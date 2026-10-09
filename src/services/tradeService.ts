/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Copyright (C) 2026 MYDCT
 *
 * Trade Service
 * Handles order execution, validation, and lifecycle management.
 */

import { Decimal } from "decimal.js";
import { normalizeSymbol } from "../utils/symbolUtils";
import { omsService } from "./omsService";
import { logger } from "./logger";
import { toastService } from "./toastService.svelte";
import { _ } from "../locales/i18n";
import { get } from "svelte/store";
import { settingsState, type ApiKeys } from "../stores/settings.svelte";
import { marketState } from "../stores/market.svelte";
import { tradeState } from "../stores/trade.svelte";
import { tpSlState } from "../stores/tpsl.svelte";
import { effectsState } from "../stores/effects.svelte";
import { safeJsonParse } from "../utils/safeJson";
import {
    BitunixPositionTierResponseSchema,
} from "../types/apiSchemas";
import type { NormalizedOrder, NormalizedPosition } from "../types/exchange";
import { appFetch } from "../lib/appAuth";
import { paperState } from "../stores/paperTrading.svelte";
import { paperAccountFeed } from "./paperAccountFeed";
import { paperExchange } from "./paperExchange";
import { capabilitiesOf } from "./exchangeCapabilities";
import { formatApiNum } from "../utils/utils";
import { accountState } from "../stores/account.svelte";
import { keysForActiveAccount, activeAccountFor } from "../stores/settings/accounts";
import { accountEpoch } from "./accountEpoch.svelte";
import { positionsReadOrder, type AccountReadTicket } from "./accountReadOrder";
import { normalizeMarginMode } from "../utils/marginMode";
import { roundDownToStep } from "../lib/calculators/partialClose";
import {
    orderGate,
    assertGatePass,
    accountFingerprint,
    OrderRefusedError,
    mutatingActionOf,
    BOT_PAPER_ONLY_MESSAGE_KEY,
    type GatePass,
    type OrderOrigin,
    type TransportContext,
} from "./orderGate";
import { exchangeSignedFetch, SIGNING_ERRORS } from "../utils/exchange/browserSigning";
import {
    cachyAction,
    planForRoute,
    signatureShapeFor,
    type Venue,
} from "../utils/exchange/restSigningPlan";
import {
    buildOrderDetailQueryParams,
    buildTpslWriteBody,
} from "../utils/exchange/venueQueries";

// Error shapes and order parameter contracts live in ./trade/* (FEAT-0342);
// re-exported here so existing importers keep working.
export { BitunixApiError, TradeError, TRADE_ERRORS } from "./trade/tradeErrors";
export type { TpSlOrder, PlaceOrderParams, ModifyOrderParams } from "./trade/tradeParams";
import { BitunixApiError, TRADE_ERRORS } from "./trade/tradeErrors";
import type { TpSlOrder, PlaceOrderParams, ModifyOrderParams } from "./trade/tradeParams";
// Payload validation/serialization and the intent builder (FEAT-0342). The
// intent builder takes the account half as an argument rather than reading
// the store itself: a service must not import stores.
import {
    completeIntent,
    parseOrderPayload,
    serializePayload,
    type AccountHalf,
    type PartialIntent,
} from "./trade/payloadCodec";
import { createSessionDispatch, type DispatchContext } from "./trade/dispatchSession";
import { createPairMetaLoader } from "./trade/pairMeta";
import {
    createTpSlService,
    type ModifyTpSlParams,
    type PlacePositionTpSlParams,
    type PlaceTpSlParams,
} from "./trade/tpSlService";
import { createAccountSettingsService } from "./trade/accountSettings";
import { createPositionLifecycleService } from "./trade/positionLifecycle";
import { createFlashCloseService, buildCloseOrderFields } from "./trade/flashClose";
import { createModifyOrderService } from "./trade/modifyOrder";

/**
 * The credentials of an account that does not exist.
 *
 * Frozen: it is shared by the two gate-facing reads, and a caller that
 * mutated it would silently poison both.
 */
const EMPTY_KEYS: Readonly<ApiKeys> = Object.freeze({ key: "", secret: "" });

/**
 * The context a request is about to be sent under, read now.
 *
 * The same derivation as at approval time, deliberately: `activeAccountFor`
 * is venue-scoped, so reporting `activeAccountId` raw would name an account
 * the signature does not belong to.
 *
 * The BUG-0551 guard that consumes this — refusing a request whose context
 * moved under the signing await — lives in ./trade/dispatchSession and takes
 * this read as a port, because a service must not import stores.
 */
function readDispatchContext(): DispatchContext {
    const provider = settingsState.apiProvider;
    const account = activeAccountFor(
        settingsState.accounts,
        settingsState.activeAccountId,
        provider,
    );
    return {
        provider,
        accountId: account?.id,
        accountFingerprint: accountFingerprint(account?.keys.key),
        paperMode: paperState.enabled,
    };
}

class TradeService {
    /**
     * BUG-0551's per-attempt guard, bound to this service's context reads.
     * The rule lives in ./trade/dispatchSession; the reads are injected here
     * because they reach stores, which that module may not import.
     */
    private readonly dispatchUnderSession = createSessionDispatch(
        readDispatchContext,
        (session) => accountEpoch.isCurrent(session),
    );

    /** Pair metadata. The loader owns the in-flight bookkeeping. */
    private readonly pairMeta = createPairMetaLoader({
        shouldFetchMeta: (key) => marketState.shouldFetchMeta(key),
        noteMetaFetch: (key, ok) => marketState.noteMetaFetch(key, ok),
        setSymbolMeta: (key, info) => marketState.setSymbolMeta(key, info),
    });

    /**
     * Position freshness, exchange→OMS mirroring and flat verification.
     *
     * The port carries the raw `apiProvider` setting: origin coerced it in
     * `refreshPositionsForProvider` but compared it raw in
     * `fetchOpenPositionsFromApi`, and the module keeps both spellings so the
     * extraction stays verbatim rather than unifying them.
     */
    private readonly positionLifecycle = createPositionLifecycleService({
        activeProvider: () => settingsState.apiProvider,
        activeKeys: (provider) =>
            keysForActiveAccount(
                settingsState.accounts,
                settingsState.activeAccountId,
                provider,
            ),
        getPositions: () => omsService.getPositions(),
        updatePosition: (position) => omsService.updatePosition(position),
        removePosition: (symbol, side) => omsService.removePosition(symbol, side),
        paperFeed: () => paperAccountFeed(),
        hydratePositions: (positions, source) =>
            accountState.hydratePositions(positions, source),
        beginPositionsRead: () => positionsReadOrder.begin(),
        // The port types the ticket as opaque `unknown`; the facade reattaches
        // the brand. A bare `(ticket) => …` leaves it `unknown`, which the
        // branded `mayApply` rejects — the cast is the seam between the two.
        mayApplyPositionsRead: (ticket) =>
            positionsReadOrder.mayApply(ticket as AccountReadTicket),
    });

    /**
     * TP/SL reads and writes. Every write goes through the gate port, which
     * is the same `gatedRequest` the order paths use — there is no second
     * route to a state-mutating request.
     */
    private readonly tpSl = createTpSlService({
        gatedRequest: <T,>(intent: PartialIntent) => this.gatedRequest<T>(intent),
        signedRequest: <T,>(
            endpoint: string,
            payload: Record<string, unknown>,
            pass?: GatePass,
            queryParams?: Record<string, string>,
            origin?: OrderOrigin,
        ) => this.signedRequest<T>(endpoint, payload, pass, queryParams, origin),
        // Both fallbacks kept, deliberately: `apiProvider` is typed
        // `"bitunix" | "bitget"` and can never be empty today, so the `||` is
        // dead on both sides — but two reads of the same store disagreeing in
        // shape is exactly what makes a reader stop trusting the pair.
        activeVenue: () => settingsState.apiProvider || "bitunix",
        hasActiveKeys: () => {
            const provider = settingsState.apiProvider || "bitunix";
            const keys = keysForActiveAccount(
                settingsState.accounts,
                settingsState.activeAccountId,
                provider,
            );
            return Boolean(keys?.key && keys?.secret);
        },
        isPaperMode: () => paperState.enabled,
        activeSymbol: () => tradeState.symbol,
    });

    /**
     * Leverage, margin mode, position mode and isolated-margin adjustments.
     *
     * The one lane that is deliberately *not* gated: these are account
     * settings rather than orders, so they carry no FEAT-0011 pass and refuse
     * in paper mode instead of pretending. That is the whole reason this lane
     * does not go through `signedRequest`; see `accountSettingRequest`.
     */
    private readonly accountSettings = createAccountSettingsService({
        activeVenue: () => settingsState.apiProvider || "bitunix",
        activeKeys: (provider) =>
            keysForActiveAccount(
                settingsState.accounts,
                settingsState.activeAccountId,
                provider,
            ),
        sessionFetch: () =>
            this.dispatchUnderSession(accountEpoch.current(), readDispatchContext()),
        isPaperMode: () => paperState.enabled,
        applyRemoteLeverageMargin: (leverage, marginMode) => {
            tradeState.remoteLeverage = leverage;
            tradeState.remoteMarginMode = marginMode;
            // FEAT-0011 measures staleness from here. Stamped only on a
            // successful read, so a failed refresh leaves the previous
            // timestamp to age out rather than looking freshly confirmed.
            tradeState.remoteAccountStateAt = Date.now();
        },
        readRemoteMarginMode: () => tradeState.remoteMarginMode,
        setPositionMode: (mode) => accountState.setPositionMode(mode),
        readPositionMode: () => accountState.positionMode,
        setMarginModeVerifying: (busy) => {
            accountState.marginModeVerifying = busy;
        },
        setPositionModeVerifying: (busy) => {
            accountState.positionModeVerifying = busy;
        },
        requestSync: () => accountState.requestSync(),
        // The toast lives here, not in the module: translation is the owner's
        // job, exactly as the order gate's refusal keys are translated in
        // `gatedRequest` rather than where the refusal is raised.
        warnUnconfirmed: () =>
            toastService.warning(get(_)("exchange.accountSettings.notConfirmed")),
    });

    /**
     * Full-close lane (see ./trade/flashClose). Every write goes through the
     * gate port, which is the same `gatedRequest` the order paths use.
     */
    private readonly flashClose = createFlashCloseService({
        gatedRequest: <T,>(intent: PartialIntent) => this.gatedRequest<T>(intent),
        displayedAccount: () => this.displayedAccount(),
        ensurePositionFreshness: (symbol, side) =>
            this.ensurePositionFreshness(symbol, side),
        buildCloseOrderFields,
        bitgetUtaCloseFields: (positionSide) => this.bitgetUtaCloseFields(positionSide),
        cancelAllOrders: (symbol, throwOnError, onBehalfOf) =>
            this.cancelAllOrders(symbol, throwOnError, onBehalfOf),
        refreshPositionsForProvider: () => this.refreshPositionsForProvider(),
        activeVenue: () => settingsState.apiProvider || "bitunix",
        lastPrice: (symbol) => marketState.data[symbol]?.lastPrice || new Decimal(0),
        triggerDuckEvent: (event) => effectsState.triggerDuckEvent(event),
        t: (key, options) =>
            (
                get(_) as (
                    key: string,
                    options?: { values?: Record<string, string> },
                ) => string
            )(key, options),
        notifyFailure: (msg) =>
            toastService.error(
                get(_)("trade.flashCloseFailed" as import("../locales/schema").TranslationKey, {
                    values: { msg },
                }),
            ),
    });

    /**
     * Safe-amend lane (see ./trade/modifyOrder). Same gate port, same rule:
     * no second route to a state-mutating request.
     */
    private readonly orderModify = createModifyOrderService({
        getOrderDetail: (orderId, clientId) => this.getOrderDetail(orderId, clientId),
        gatedRequest: <T,>(intent: PartialIntent) => this.gatedRequest<T>(intent),
        activeVenue: () => settingsState.apiProvider || "bitunix",
        accountSizeText: () => tradeState.accountSize,
    });

    // Helper to sign and send requests to backend
    // Test mocks this
    //
    // FEAT-0011: this is the transport, and it is not reachable for a
    // state-mutating order without a pass from the order gate. `pass` is
    // typed optional because read-only calls (history, pending,
    // order-detail, TP/SL listing) legitimately have none — for anything
    // that changes exchange state `assertGatePass` throws, so a call site
    // that skips the gate fails at runtime rather than sending an
    // unverified order. A source-level scan catches the same mistake
    // earlier; see src/tests/architecture/order_gate_bypass.test.ts.
    public async signedRequest<T>(
        endpoint: string,
        payload: Record<string, unknown>,
        pass?: GatePass,
        /**
         * The parameters the venue signature covers on a query-signed route.
         * Built by the caller from the same payload the server rebuilds them
         * from, so both sides sign identical bytes; ignored on body-signed
         * routes, where the body is what is signed.
         */
        queryParams?: Record<string, string>,
        /**
         * Where the order came from, when the caller is placing one
         * (BUG-0494). Only the gated entry path sets it; reads leave it
         * absent and keep their exact behaviour. A bot-stamped request with
         * paper trading off is refused here — loudly, before the paper seam
         * below could fall through to the live branch — as defence in depth
         * behind the gate's own approval-time refusal. Deliberately *before*
         * `assertGatePass`: provenance outranks the pass, and the refusal is
         * testable without minting one.
         */
        origin?: OrderOrigin,
    ): Promise<T> {
        // Implementation for real app (simplified)
        // In test this is mocked
        const provider = settingsState.apiProvider;
        // Resolve the *account*, not just its keys, so the id reported to the
        // gate describes the credentials this request will actually carry.
        //
        // Reporting `settingsState.activeAccountId` raw was wrong: the lookup
        // is venue-scoped and falls back to the venue's account when the
        // active id names one on another exchange. The id would then name an
        // account the signature does not belong to — and because both sides
        // of the gate made the same claim, they agreed and the order went
        // out. A field that can be false about what it describes is worse
        // than no field.
        const account = activeAccountFor(
            settingsState.accounts,
            settingsState.activeAccountId,
            provider,
        );
        const keys = account?.keys ?? EMPTY_KEYS;

        // BUG-0494 — provenance outranks the pass. A bot-stamped order with
        // paper trading off never reaches the live branch below: the gate
        // already refuses it at approval time, and this repeats the refusal
        // for any path that reaches the transport directly. Deliberately
        // before `assertGatePass`, so the refusal is testable without
        // minting a pass and names the true cause instead of "bypassed".
        if (origin === "bot" && !paperState.enabled) {
            throw new OrderRefusedError({
                field: "mode",
                reason: "unsupported",
                messageKey: BOT_PAPER_ONLY_MESSAGE_KEY,
                values: {},
            });
        }

        // Re-read of the account the request will actually be signed with,
        // compared against the account the gate approved. Settings can change
        // between the click and the send; this is where that is caught.
        //
        // BUG-0551: built once and kept, because the signing await below is
        // the one gap between this read and the network — `dispatchUnderSession`
        // compares against this very object after signing, so the two checks
        // cannot drift apart.
        const transportContext: TransportContext = {
            endpoint,
            payload,
            provider,
            accountFingerprint: accountFingerprint(keys?.key),
            accountId: account?.id,
            paperMode: paperState.enabled,
        };
        assertGatePass(transportContext, pass);

        // FEAT-0012: THE seam. Live and paper differ here and nowhere else —
        // construction, the gate, the risk limits, OMS tracking, the journal
        // and the UI have all already run identically to reach this line.
        // Everything below it is the network; nothing below it runs in paper
        // mode, so a simulated order cannot produce an outbound request.
        if (paperState.enabled) {
            return (await paperExchange.handle(endpoint, payload)) as T;
        }

        if (!keys || !keys.key) {
            throw new Error("apiErrors.missingCredentials");
        }

        // Every guarded route's Zod schema requires `exchange` in the body
        // (there is no header fallback for it, only for the credentials
        // above) — inject it here once rather than relying on every call
        // site to remember it. Callers that already set it (none currently
        // do) win, since they're spread after.
        const payloadWithExchange = { exchange: provider, ...payload };

        // Deep serialize Decimals to strings before JSON.stringify
        const serializedPayload = serializePayload(payloadWithExchange);

        // FEAT-0405 A5 — the orders schema is not a pass-through. It defaults
        // `marginCoin`, uppercases `side` and clamps `limit`, and the route
        // builds its rebuild of the signed bytes from *its* parse. Signing the
        // raw payload here would therefore be a different string and every
        // order would come back as `PRESIGNED_DIVERGENCE` before Bitunix saw
        // it — the same trap the account-settings transport sidesteps by
        // parsing first, and for the same reason.
        const signedPayload =
            endpoint === "/api/orders"
                ? parseOrderPayload(serializedPayload)
                : serializedPayload;

        const plan = planForRoute(endpoint);
        // A route whose shape varies per action is told which action it is
        // through its URL — see `cachyAction` in restSigningPlan.ts. The
        // caller already named it in the payload, so the transport moves it
        // to where the route looks rather than making every call site carry
        // the query string itself.
        //
        // The discriminator is the payload's `type` as well as its `action`:
        // `/api/orders` names its actions in `type` (the field its Zod schema
        // and its venue dispatch both switch on), and a read left without the
        // URL parameter would resolve as a body-signed action and be signed
        // wrongly. `/api/tpsl` uses `action`, so the two spellings are both
        // read here rather than making every call site carry a query string.
        const actionForUrl =
            typeof payload.action === "string"
                ? payload.action
                : typeof payload.type === "string"
                  ? payload.type
                  : undefined;
        const routeUrl =
            plan?.signedByAction && actionForUrl !== undefined
                ? `${endpoint}?action=${encodeURIComponent(actionForUrl)}`
                : endpoint;

        // Shape is resolved from the URL, the same way `signCachyRequest`
        // resolves it, because it decides *which bytes* go out: on a body-signed
        // action the exchange signature covers the builder's serialisation, on a
        // query-signed one the body is only Cachy's own wrapper and must stay an
        // object — fixing the read actions to the write builder would send a
        // JSON string where the route validates `{ exchange, action, params }`.
        //
        // FEAT-0405 A5 — every route in the table now reads an envelope, so this
        // is unconditional. The legacy branch that carried `X-Api-Secret` and
        // the set that gated it are gone: a route absent from the table has no
        // plan, and signing it is refused below rather than sent with a secret.
        if (!plan) {
            throw new Error(SIGNING_ERRORS.ROUTE_NOT_MIGRATED);
        }
        const shape = signatureShapeFor(plan, cachyAction(routeUrl));
        // `/api/tpsl` is the one route whose signed bytes are not the payload:
        // its write callers hand over the `{ exchange, action, …, params }`
        // wrapper (the gate reads symbol/orderId off the top level), while the
        // venue reads `params` — so the venue body is built from `params`
        // through the same builder the route rebuilds it with. Every other
        // body-signed payload already *is* the venue's own object.
        const params = (signedPayload as Record<string, unknown>)?.params;
        const signingPayload =
            shape === "body" &&
            endpoint === "/api/tpsl" &&
            typeof params === "object" &&
            params !== null &&
            !Array.isArray(params)
                ? buildTpslWriteBody(params as Record<string, unknown>)
                : signedPayload;

        const response = await exchangeSignedFetch({
                  cachyPath: routeUrl,
                  // Declared, not just embedded: `routeUrl` already carries
                  // this in its query string, and the mismatch guard inside
                  // fires if the two ever disagree — one source of truth,
                  // checked twice.
                  action: actionForUrl,
                  keys: { apiKey: keys.key, apiSecret: keys.secret, passphrase: keys.passphrase },
                  // The *venue* method, which Bitget folds into its prehash and
                  // Bitunix ignores. Taken from the shape rather than from the
                  // caller's argument: a query-signed action reads, and signing
                  // it as `POST` would be a signature Bitget rejects.
                  method: shape === "body" ? "POST" : "GET",
                  // Named rather than inferred. The route used to enforce this
                  // itself, by reading `exchange` out of the body and answering
                  // 400 for anything but Bitunix; that check left with the
                  // secret, so without this line a Bitget account would sign a
                  // Bitunix envelope with Bitget keys and Bitunix could not tell.
                  venue: provider,
                  // BUG-0551: the signing await inside `exchangeSignedFetch` is
                  // the last place a context switch can slip through, so the
                  // dispatch itself is where the re-check lives. A read keeps
                  // its exact behaviour — `mutatingActionOf` says the payload
                  // carries no write, and a stale read is dropped at the store,
                  // not here.
                  fetchFn:
                      mutatingActionOf(payload, endpoint) === null
                          ? appFetch
                          : this.dispatchUnderSession(
                                accountEpoch.current(),
                                transportContext,
                            ),
                  // Still named here: the route reads the provider to resolve
                  // its venue, and the envelope only carries credentials.
                  headers: { "X-Provider": provider },
                  // `signingPayload` is the venue's JSON object by construction —
                  // the shape `serializePayload` cannot express because it
                  // walks arrays and nested values too. The route re-validates
                  // the result with Zod, so a payload that is not an object is
                  // refused there rather than forwarded.
                  payload: signingPayload,
                  queryParams,
              });

        const text = await response.text();
        let data: Record<string, unknown> = {};
        try {
            data = safeJsonParse(text);
        } catch {
            // If response is not JSON (e.g. 502 Bad Gateway HTML, or 429 plain text)
            // use the status code as the error code. Do NOT expose raw text or statusText.
            if (!response.ok) {
                 throw new BitunixApiError(response.status, "apiErrors.invalidResponse");
            }
        }

        // Loose check for "code" != 0 (Bitunix style)
        // We cast to string to handle both number 0 and string "0"
        const code = data.code as string | number | undefined;
        if (!response.ok || (code !== undefined && String(code) !== "0")) {
            // Log raw gateway text silently
            const rawMsg = String(data.msg || data.error || "Unknown API Error");
            if (rawMsg) {
                logger.debug("api", `[Bitunix] API Exception: ${rawMsg}`);
            }
            throw new BitunixApiError(code || response.status || -1, "apiErrors.generic", rawMsg);
        }

        return data as T;
    }

    /** Read-only: current leverage + margin mode for a symbol. Rationale and
     *  read contract: see ./trade/accountSettings.fetchLeverageMarginMode. */
    public async fetchLeverageMarginMode(symbol: string): Promise<void> {
        return this.accountSettings.fetchLeverageMarginMode(symbol);
    }

    /** Read-only: the account-wide position mode (FEAT-0068), straight from the
     * exchange. What populates the mode chip is on
     * ./trade/accountSettings.fetchPositionMode. */
    public async fetchPositionMode(): Promise<void> {
        return this.accountSettings.fetchPositionMode();
    }

    /** Leverage for one symbol, on the exchange (FEAT-0068).
     * Rationale and the read-back contract: see
     * ./trade/accountSettings.changeLeverage. */
    public async changeLeverage(symbol: string, leverage: Decimal): Promise<void> {
        return this.accountSettings.changeLeverage(symbol, leverage);
    }

    /** Margin mode for one symbol (FEAT-0068). The venue refuses this while
     * positions are open; the full rule and the read-back contract are on
     * ./trade/accountSettings.changeMarginMode. */
    public async changeMarginMode(
        symbol: string,
        marginMode: "ISOLATION" | "CROSS",
    ): Promise<void> {
        return this.accountSettings.changeMarginMode(symbol, marginMode);
    }

    /** Position mode for the whole futures account (FEAT-0068). Rationale and
     * read-back contract: see ./trade/accountSettings.changePositionMode. */
    public async changePositionMode(positionMode: "ONE_WAY" | "HEDGE"): Promise<void> {
        return this.accountSettings.changePositionMode(positionMode);
    }

    /** Adds or withdraws margin on one isolated position (FEAT-0068). The full
     * rule is on ./trade/accountSettings.adjustPositionMargin. */
    public async adjustPositionMargin(params: {
        symbol: string;
        amount: Decimal;
        side?: "LONG" | "SHORT";
        positionId?: string;
    }): Promise<void> {
        return this.accountSettings.adjustPositionMargin(params);
    }

    /**
     * Read-only: precision, order-size limits, leverage range and status for
     * a symbol. Public endpoints, no credentials.
     *
     * BUG-0501: venue-dispatched internally — Bitunix reads market/
     * trading_pairs, Bitget reads V2 mix contracts — but one method, so the
     * adapter table keeps a single verb to declare. The loader, and the
     * in-flight bookkeeping that coalesces concurrent reads, live in
     * ./trade/pairMeta.
     */
    public async fetchTradingPairInfo(symbol: string): Promise<void> {
        await this.pairMeta.fetchTradingPairInfo(
            symbol,
            settingsState.apiProvider || "bitunix",
        );
    }

    // Read-only: maintenance-margin tiers for a symbol
    // (position/get_position_tiers). Public endpoint, no credentials.
    public async fetchPositionTiers(symbol: string): Promise<void> {
        try {
            const response = await appFetch(`/api/position-tiers?symbol=${encodeURIComponent(symbol)}`);
            if (!response.ok) return;
            const json = await response.json();

            const validation = BitunixPositionTierResponseSchema.safeParse(json);
            if (!validation.success) {
                logger.error("network", "[TradeService] Invalid position-tiers response", validation.error.issues);
                return;
            }
            const tiers = (validation.data.data ?? []).map(t => ({
                level: t.level,
                startValue: t.startValue ?? null,
                endValue: t.endValue ?? null,
                leverage: t.leverage,
                maintenanceMarginRate: t.maintenanceMarginRate ?? null,
            }));
            marketState.setPositionTiers(symbol, tiers);
        } catch (e) {
            logger.debug("api", "[TradeService] fetchPositionTiers failed", e);
        }
    }

    /**
     * The account half of the displayed state — the exchange and key the UI
     * currently shows as active. Every intent needs it; nothing else about
     * an intent is shared, so the rest is built per call site.
     *
     * The store read stays here; the intent builder that consumes it is in
     * ./trade/payloadCodec, which cannot read stores itself.
     */
    private displayedAccount(): AccountHalf {
        const provider = settingsState.apiProvider;
        // Same resolution as the transport, for the same reason: the id has
        // to name the account the fingerprint came from.
        const account = activeAccountFor(
            settingsState.accounts,
            settingsState.activeAccountId,
            provider,
        );
        return {
            provider,
            accountFingerprint: accountFingerprint((account?.keys ?? EMPTY_KEYS).key),
            // FEAT-0026. Be honest about what this is: a second *field*, not
            // yet a second *derivation* — both this and the transmit-time
            // read still come from `settingsState`. It is nonetheless a
            // strict improvement, because it catches an account switch that
            // leaves the key string unchanged, which the fingerprint cannot
            // see. Sourcing one of the two roots from what the user was
            // actually shown is the account chip's job, in the PR that adds
            // it.
            accountId: account?.id,
            paperMode: paperState.enabled,
        };
    }

    /**
     * FEAT-0011: verify, then transmit. Every mutating order in this service
     * goes through here — `signedRequest` refuses one that does not.
     */
    private async gatedRequest<T>(intent: PartialIntent): Promise<T> {
        const full = completeIntent(intent, this.displayedAccount());
        const result = await orderGate.submit<T>(full, (pass) =>
            this.signedRequest<T>(full.endpoint, full.payload, pass, undefined, full.origin),
        );
        // Eager post-action reconciliation: refresh account balance & positions
        try {
            accountState.requestSync();
        } catch {
            // non-blocking
        }
        return result;
    }

    /**
     * Freshness, mirroring and flat verification live in
     * ./trade/positionLifecycle (FEAT-0342). The bodies moved verbatim; this
     * facade keeps the call sites and the signatures unchanged.
     */
    private ensurePositionFreshness(symbol: string, positionSide: "long" | "short") {
        return this.positionLifecycle.ensurePositionFreshness(symbol, positionSide);
    }

    private refreshPositionsForProvider(): Promise<void> {
        return this.positionLifecycle.refreshPositionsForProvider();
    }

    /**
     * Full-close of one position with optimistic rollback.
     *
     * The lane lives in ./trade/flashClose; this facade keeps the signature.
     *
     * @param confirmedAt When the user confirmed, as `Date.now()` — FEAT-0024.
     *   Omitted when no confirmation was needed. If the policy requires one and
     *   this is absent, the gate refuses rather than sending: a caller that
     *   forgets to ask stops, it does not proceed silently.
     */
    public async flashClosePosition(
        symbol: string,
        positionSide: "long" | "short",
        confirmedAt?: number,
    ) {
        return this.flashClose.flashClosePosition(symbol, positionSide, confirmedAt);
    }

    public async cancelOrder(symbol: string, orderId: string) {
        if (!symbol || !orderId) return;
        logger.log("market", `[Trade] Cancelling order ${orderId} for ${symbol}`);
        return await this.gatedRequest({
            kind: "cancel",
            endpoint: "/api/orders",
            payload: {
                symbol,
                orderId,
                type: "cancel-order"
            },
            displayed: { symbol, orderId },
        });
    }

    /**
     * @param onBehalfOf The already-confirmed action this cancel is part of —
     *   FEAT-0024. `cancel-all` confirms by default, and this cancel is not
     *   always a decision of its own: `flashClosePosition` clears the
     *   position's stops as one step of the close the user already agreed to.
     *   Asking a second time for the same action would be a prompt the user
     *   cannot connect to anything they did, and leaving it unconfirmed makes
     *   the gate refuse a cleanup that was authorised.
     *
     *   A user-initiated cancel-all passes nothing and is confirmed on its own
     *   terms.
     */
    public async cancelAllOrders(
        symbol?: string,
        throwOnError = false,
        onBehalfOf?: { action: string; confirmedAt?: number },
    ) {
        logger.log("market", `[Trade] Cancelling all orders${symbol ? ` for ${symbol}` : ""}`);
        try {
             return await this.gatedRequest({
                kind: "bulk",
                endpoint: "/api/orders",
                payload: {
                    symbol: symbol || undefined,
                    type: "cancel-all"
                },
                displayed: symbol ? { symbol } : {},
                confirmAs: onBehalfOf?.action,
                confirmedAt: onBehalfOf?.confirmedAt,
             });
        } catch (e: unknown) {
             logger.warn("market", `[Trade] Failed to cancel orders${symbol ? ` for ${symbol}` : ""}`, e);
             if (throwOnError) throw e;
        }
    }

    /**
     * BUG-0597: UTA intent fields for a close. The caller names the position
     * side it is closing; this returns the transactional direction UTA wants
     * (`SELL` closes a long) plus the position side itself — never the
     * position-side convention the Bitunix branch of these call sites uses.
     *
     * Mode comes from the store (BUG-0596 positions lane). Only a positive
     * `one_way` omits `posSide`; an unknown mode reads as hedge, because a
     * `posSide` sent to a one-way account rejects at the venue while an
     * omitted one on hedge leaves the intent ambiguous. The reverse
     * staleness — mode flipped to hedge while the store still says one_way —
     * emits reduce-only without posSide on a hedge account: likely
     * venue-rejected (reduceOnly is one-way-only), but direction alone on
     * hedge is ambiguous if ever accepted. A mode change with open positions
     * is the operator's cue to re-sync before trading. `reduceOnly` is
     * one-way-only on UTA and never travels with `posSide` — the body
     * builder throws on the combination, so a hedge close arrives with it
     * false rather than relying on the venue to ignore it.
     *
     * `marginMode` is passed through unresolved (possibly ""): the builder
     * refuses an unknown mode instead of letting the venue default to cross.
     */
    private bitgetUtaCloseFields(positionSide: "long" | "short"): {
        side: "BUY" | "SELL";
        posSide?: "LONG" | "SHORT";
        reduceOnly: boolean;
        marginMode?: string;
    } {
        const side = positionSide === "long" ? "SELL" : "BUY";
        // Undefined (not "") when never synced: the gate only compares margin
        // mode when both sides carry one, so an empty string would read as a
        // present-but-wrong value and refuse with a mismatch. The body builder
        // still requires it and throws when it is absent.
        const marginMode = normalizeMarginMode(tradeState.remoteMarginMode) || undefined;
        if ((accountState.positionMode ?? "").toLowerCase() === "one_way") {
            return { side, reduceOnly: true, marginMode };
        }
        return {
            side,
            posSide: positionSide.toUpperCase() as "LONG" | "SHORT",
            reduceOnly: false,
            marginMode,
        };
    }

    /**
     * BUG-0597: UTA intent fields for an open. Direction implies the position
     * side (`BUY` opens long) except in one-way mode, where no `posSide`
     * travels at all.
     */
    private bitgetUtaOpenFields(direction: "BUY" | "SELL"): {
        posSide?: "LONG" | "SHORT";
        marginMode?: string;
    } {
        return {
            posSide:
                (accountState.positionMode ?? "").toLowerCase() === "one_way"
                    ? undefined
                    : direction === "BUY"
                      ? "LONG"
                      : "SHORT",
            marginMode: normalizeMarginMode(tradeState.remoteMarginMode) || undefined,
        };
    }

    /**
     * Generates the client order ID for one submission attempt.
     *
     * FEAT-0069's open question was whether this should be random per attempt
     * or derived deterministically so a crash-and-reload can rediscover an
     * in-flight order. Neither pure form works:
     *
     * - Purely random, regenerated on every retry, defeats the entire point.
     *   A retry after an ambiguous response is exactly when idempotency
     *   matters, and a fresh ID there doubles the order.
     * - Derived from the order's content collides on purpose. Two deliberate
     *   identical entries — the same symbol, side, size and price, which is
     *   ordinary when scaling in — would produce the same ID, and the second
     *   would be rejected as a duplicate of an order the trader meant to
     *   place.
     *
     * So the unit is the *attempt*, not the content: random per attempt, and
     * `placeOrder` accepts one back so a retry of that attempt reuses it.
     * Rediscovery after a crash comes from the FEAT-0015 audit trail, which
     * already persists the id alongside everything else about the attempt —
     * rather than from a second persistence mechanism that could disagree
     * with it.
     */
    public newClientOrderId(): string {
        // Bitunix caps clientId at 64 chars (07_trade.md); this is ~30.
        // Intentionally unguarded: exchange signing already requires crypto.subtle /
        // a secure context — see docs/adr/0013-client-side-exchange-signing.md.
        const stamp = Date.now().toString(36);
        const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        return `cachy-${stamp}-${rand}`;
    }

    /**
     * Opens or adds to a position — FEAT-0069.
     *
     * Everything the exchange accepts in one request goes in one request:
     * the entry, its stop and its target. A position that exists before its
     * protective orders do is unprotected for as long as the second request
     * takes, and that second request can fail.
     *
     * The intent is `open`, so this is the path on which the FEAT-0011 gate's
     * size recomputation, leverage and margin-mode checks, and FEAT-0013's
     * risk limits and kill switch all actually apply.
     */
    /**
     * The time in force to put on a limit order.
     *
     * FEAT-0069 made GTC the default, because Bitunix documents `effect` as
     * required on a limit order and dropping it there fails the request.
     * FEAT-0017 qualifies that: a venue declaring no time in force has no
     * value this default could stand for, so filling one in invents a field.
     *
     * It was not a harmless invention. `orderPlacementService` resolves
     * `undefined` for such a venue on purpose, and `?? "GTC"` put the value
     * straight back — so the gate refused the order over a time in force the
     * trader never chose and the panel showed as "—".
     *
     * An explicit value is always honoured, including one the venue cannot
     * take: that one travels and is refused by name, which is the loud
     * failure a silent downgrade would have hidden.
     */
    private effectFor(effect: PlaceOrderParams["effect"]): PlaceOrderParams["effect"] {
        if (effect !== undefined) return effect;
        const venue = capabilitiesOf(settingsState.apiProvider);
        return venue.timeInForce.length > 0 ? "GTC" : undefined;
    }

    public async placeOrder(params: PlaceOrderParams) {
        const orderType = params.orderType ?? "MARKET";
        const clientId = params.clientId ?? this.newClientOrderId();
        const meta = params.symbol
            ? marketState?.symbolMeta?.[normalizeSymbol(params.symbol, settingsState.apiProvider || "bitunix")]
            : undefined;

        // The venue fills whole multiples of the instrument's step, so a raw
        // calculator result that lands between steps is refused there — after
        // the user has already confirmed. Round down to the step before it
        // travels; the gate still refuses the volume limits (BUG-0380).
        const stepSize =
            params.displayed.stepSize ??
            (meta?.basePrecision !== undefined
                ? new Decimal(10).pow(-meta.basePrecision)
                : undefined);
        const qty = stepSize
            ? roundDownToStep(new Decimal(params.qty), stepSize)
            : params.qty;

        // formatApiNum everywhere: a price serialised as "1e-7" is rejected
        // by the exchange, and a native float here would undo the precision
        // the calculator spent effort producing.
        const payload: Record<string, unknown> = {
            type: "place-order",
            symbol: params.symbol,
            side: params.side,
            orderType,
            qty: formatApiNum(qty),
            price: params.price !== undefined ? formatApiNum(params.price) : undefined,
            reduceOnly: params.reduceOnly ?? false,
            clientId,
            // Omitted for MARKET by the route too; not sending it at all
            // keeps the audit record honest about what went out.
            effect: orderType === "MARKET" ? undefined : this.effectFor(params.effect),
            tradeSide: params.tradeSide,
            positionId: params.positionId,
            // BUG-0597: direction implies the position side on opens.
            ...(settingsState.apiProvider === "bitget"
              ? this.bitgetUtaOpenFields(params.side)
              : {}),
        };

        if (params.takeProfit) {
            payload.tpPrice = formatApiNum(params.takeProfit.price);
            payload.tpStopType = params.takeProfit.stopType ?? "MARK_PRICE";
            payload.tpOrderType = params.takeProfit.orderType ?? "MARKET";
            if (params.takeProfit.orderPrice !== undefined) {
                payload.tpOrderPrice = formatApiNum(params.takeProfit.orderPrice);
            }
        }

        if (params.stopLoss) {
            payload.slPrice = formatApiNum(params.stopLoss.price);
            payload.slStopType = params.stopLoss.stopType ?? "MARK_PRICE";
            payload.slOrderType = params.stopLoss.orderType ?? "MARKET";
            if (params.stopLoss.orderPrice !== undefined) {
                payload.slOrderPrice = formatApiNum(params.stopLoss.orderPrice);
            }
        }

        // The free USDT balance the trader is spending from — read for the
        // active mode only (BUG-0565). Live wallet and the paper account
        // hydrate the same store, so an ambient read would measure against
        // whichever writer ran last. A mismatch (or no measurement at all)
        // hands the gate `undefined`, and the existing unmeasured path
        // engages (BUG-0511, recorded as `availableMarginUnmeasured`).
        // Settlement is currently USDT-M only, so USDT free is the whole
        // spendable balance until multi-collateral arrives.
        const balanceForMode = accountState.readUsdtBalance(
            paperState.enabled ? "paper" : "live",
        );

        const result = await this.gatedRequest({
            kind: "open",
            endpoint: "/api/orders",
            payload,
            origin: params.origin,
            displayed: {
                symbol: params.symbol,
                side: params.side,
                ...params.displayed,
                // Present, the gate measures the open's required margin
                // against it; absent or non-finite, it skips the measurement
                // as before (BUG-0511, recorded as
                // `availableMarginUnmeasured`). Stamped alongside the value
                // so the two can never disagree — the stamp itself is
                // informational, no gate consumes it as a freshness check:
                // a stale-high reading approves and the venue rejects, a
                // stale-low reading refuses early. Neither creates funds —
                // the venue stays final.
                availableMargin: balanceForMode?.available,
                availableMarginAt: balanceForMode?.at,
                stepSize,
                minTradeVolume: meta?.minTradeVolume ? new Decimal(meta.minTradeVolume) : undefined,
                maxLimitOrderVolume: meta?.maxLimitOrderVolume ? new Decimal(meta.maxLimitOrderVolume) : undefined,
                maxMarketOrderVolume: meta?.maxMarketOrderVolume ? new Decimal(meta.maxMarketOrderVolume) : undefined,
                symbolStatus: meta?.symbolStatus,
                isApiSupported: meta?.isApiSupported,
            },
        });

        // Returned so a caller retrying an ambiguous failure can reuse the
        // same id rather than minting a new one.
        return { clientId, result };
    }

    /**
     * Adds to an open position — FEAT-0334.
     *
     * An opening order in the direction the position already faces, so it
     * carries `tradeSide: "OPEN"` and never `reduceOnly`. It is *not* routed
     * through `placeOrder`: that path is for a risk-sized entry, and the gate
     * verifies its quantity by re-deriving it from account size, risk and stop
     * distance. An add has no new stop to divide by, so it travels as
     * `kind: "add"` and is verified against the quantity the panel previewed
     * plus available margin — see `OrderIntentKind` in `orderGate.ts`.
     *
     * The confirmation is `place-order`'s. An add is an order placement, and
     * FEAT-0024's catalogue already has a key for that; minting a second one
     * for a case the gate enforces structurally would dilute the catalogue
     * rather than tighten it.
     *
     * The position is re-read before the payload is built, so the size, entry
     * and mark the gate compares against are the venue's current figures and
     * not whatever the panel was showing when the trader started typing.
     */
    public async addToPosition(params: {
        symbol: string;
        positionSide: "long" | "short";
        amount: Decimal;
        orderType?: "LIMIT" | "MARKET";
        price?: Decimal;
        effect?: PlaceOrderParams["effect"];
        clientId?: string;
        confirmedAt?: number;
    }) {
        const { symbol, positionSide, amount } = params;
        const orderType = params.orderType ?? "MARKET";

        if (!amount || !amount.isFinite() || amount.lte(0)) {
            throw new Error("apiErrors.invalidAmount");
        }
        if (orderType === "LIMIT" && (!params.price || params.price.lte(0))) {
            throw new Error("apiErrors.invalidPrice");
        }

        // Fresh, not remembered: an add sized against a position that has
        // since been partly liquidated is an add against a different trade.
        const position = await this.ensurePositionFreshness(symbol, positionSide);
        if (!position) {
            throw new Error(TRADE_ERRORS.POSITION_NOT_FOUND);
        }

        const clientId = params.clientId ?? this.newClientOrderId();
        const meta = marketState?.symbolMeta?.[normalizeSymbol(symbol, settingsState.apiProvider || "bitunix")];

        /*
         * Where the add is expected to fill, used for the margin check only.
         * A limit add fills at its limit; a market add is estimated at the
         * mark, and where the venue omits the mark the entry is the closest
         * honest stand-in — an estimate that is stated, never one that is
         * silently zero.
         */
        const fillPrice =
            orderType === "LIMIT" && params.price
                ? params.price
                : position.markPrice && position.markPrice.gt(0)
                    ? position.markPrice
                    : position.entryPrice;

        // The settlement asset's free balance (USDT-M only), read for the
        // active mode only (BUG-0565) — see placeOrder above. This only
        // carries the reading — the refusal decision lives in `checkMargin`
        // (orderGate.ts), which refuses the add when the balance has not
        // loaded, since margin is its only ceiling (BUG-0511).
        const balanceForMode = accountState.readUsdtBalance(
            paperState.enabled ? "paper" : "live",
        );
        const availableMargin = balanceForMode?.available;
        const availableMarginAt = balanceForMode?.at;

        // Account equity for the percentage position-size cap — the same
        // tradeState the order panel reads. Unparseable means the cap is
        // unmeasurable and the add refuses rather than passing unmeasured
        // (BUG-0508).
        let accountSize: Decimal | undefined;
        try {
            accountSize = new Decimal(tradeState.accountSize);
        } catch {
            accountSize = undefined;
        }

        const payload: Record<string, unknown> = {
            type: "place-order",
            symbol,
            // `side` names the direction of the exposure, the same convention
            // `buildCloseOrderFields` follows; `tradeSide` says whether it is
            // being opened or closed.
            side: positionSide === "long" ? "BUY" : "SELL",
            orderType,
            qty: formatApiNum(amount),
            price: orderType === "LIMIT" && params.price ? formatApiNum(params.price) : undefined,
            reduceOnly: false,
            clientId,
            effect: orderType === "MARKET" ? undefined : this.effectFor(params.effect),
            tradeSide: "OPEN",
            positionId: position.positionId,
            // BUG-0597: direction implies the position side on opens.
            ...(settingsState.apiProvider === "bitget"
              ? this.bitgetUtaOpenFields(positionSide === "long" ? "BUY" : "SELL")
              : {}),
        };

        const result = await this.gatedRequest({
            kind: "add",
            endpoint: "/api/orders",
            payload,
            confirmAs: "place-order",
            confirmedAt: params.confirmedAt,
            displayed: {
                symbol,
                side: positionSide === "long" ? "BUY" : "SELL",
                // The quantity the panel previewed and the trader agreed to.
                // The gate has no second way to derive this, which is exactly
                // why it is stated rather than recomputed.
                addQuantity: amount,
                entryPrice: fillPrice,
                positionAmount: position.amount,
                positionId: position.positionId,
                // For the percentage position-size cap (BUG-0508).
                accountSize,
                // The venue-reported average entry before the add, so the
                // gate measures the resulting position's stop risk from
                // displayed inputs rather than trusting constructor math.
                positionEntryPrice: position.entryPrice,
                // The position's resting stop when one is safely
                // attributable, so the loss-per-trade limit can measure the
                // add against the resulting position (BUG-0510). A dedicated
                // field: `stopLossPrice` would claim the request carries a
                // stop it never sends. Read from the cache, never fetched
                // here: the add dialog warms it before this can run, and a
                // fetch inside the order path would race the gate. Cold cache
                // means no stop known, which the limit treats as
                // unmeasurable, not unprotected. Scoped to this position by
                // id (BUG-0524) — in hedge mode the first LOSS leg is an
                // arbitrary side's stop.
                restingStopPrice: tpSlState.restingStopPrice(symbol, positionSide, position.positionId) ?? undefined,
                leverage: position.leverage,
                marginMode: position.marginMode === "isolated" ? "ISOLATION" : "CROSS",
                availableMargin,
                availableMarginAt,
                /*
                 * When the venue last confirmed this account's leverage and
                 * margin mode. The gate refuses an add on a read older than
                 * MAX_ACCOUNT_STATE_AGE_MS, the same as it does an open,
                 * because an add opens exposure too.
                 *
                 * Read from `tradeState` — the same source `PlaceOrderPanel`
                 * hands to `placeOrder` — rather than stamped `Date.now()`
                 * here. Stamping it locally would satisfy the freshness check
                 * with the time this code ran instead of the time the exchange
                 * answered, which is a check that always passes and therefore
                 * is not a check.
                 */
                accountStateAt: tradeState.remoteAccountStateAt,
                stepSize:
                    meta?.basePrecision !== undefined
                        ? new Decimal(10).pow(-meta.basePrecision)
                        : undefined,
                minTradeVolume: meta?.minTradeVolume ? new Decimal(meta.minTradeVolume) : undefined,
                maxLimitOrderVolume: meta?.maxLimitOrderVolume
                    ? new Decimal(meta.maxLimitOrderVolume)
                    : undefined,
                maxMarketOrderVolume: meta?.maxMarketOrderVolume
                    ? new Decimal(meta.maxMarketOrderVolume)
                    : undefined,
                symbolStatus: meta?.symbolStatus,
                isApiSupported: meta?.isApiSupported,
            },
        });

        return { clientId, result };
    }

    public async closePosition(params: { symbol: string, positionSide: "long" | "short", amount?: Decimal, forceFullClose?: boolean }) {
        const { symbol, positionSide, amount, forceFullClose } = params;

        // 1. Get fresh position
        const position = await this.ensurePositionFreshness(symbol, positionSide);

        if (!position) {
            throw new Error(TRADE_ERRORS.POSITION_NOT_FOUND);
        }

        const { side, tradeSide, positionId } = buildCloseOrderFields(
            positionSide,
            position.positionId,
        );

        // Use explicit amount or full position amount
        // If explicit amount is provided, use it.
        if (!amount && !forceFullClose) {
             logger.error("market", `[ClosePosition] No amount specified and forceFullClose is false. Aborting close for ${symbol} ${positionSide}`);
             throw new Error("apiErrors.invalidAmount");
        }

        const qty = amount ? amount.toString() : position.amount.toString();

        // A close that names the full amount explicitly is still a full close.
        // `!amount` alone got this wrong for every caller that passes the size
        // it read off the position — which is what the positions panel does —
        // and the distinction now decides whether the gate applies its step-size
        // rule (FEAT-0256). Declaring a full close as partial would refuse an
        // exit from a position whose size is not a whole multiple of the current
        // step, i.e. lock the trader in.
        const closesEverything = !amount || amount.eq(position.amount);

        // Metadata is best-effort for the step size; the minimum is a
        // precondition for a partial close. A partial whose instrument
        // metadata never loaded states no minimum, and the gate refuses it
        // rather than approving an unmeasurable size (BUG-0509, BUG-0501).
        // Full closes stay exempt — a position under the minimum must still
        // be closable.
        const meta = marketState?.symbolMeta?.[normalizeSymbol(symbol, settingsState.apiProvider || "bitunix")];
        const stepSize =
            meta?.basePrecision !== undefined
                ? new Decimal(10).pow(-meta.basePrecision)
                : undefined;

        logger.log("market", `[ClosePosition] Closing ${symbol} ${positionSide} (${qty})`);

        const pnlVal = position.unrealizedPnl ?? new Decimal(0);
        effectsState.triggerDuckEvent({
            type: pnlVal.isNegative() ? "trade_loss" : "trade_win",
            pnl: pnlVal,
        });

        return this.gatedRequest({
            kind: "reduce",
            endpoint: "/api/orders",
            payload: {
                type: "place-order",
                symbol,
                side,
                orderType: "MARKET",
                qty,
                reduceOnly: true,
                tradeSide,
                positionId,
                // BUG-0597: UTA names the side it closes (transactional
                // direction + posSide). Bitunix keeps its convention untouched.
                ...(settingsState.apiProvider === "bitget"
                  ? this.bitgetUtaCloseFields(positionSide)
                  : {}),
            },
            displayed: {
                symbol,
                side,
                // The ceiling comes from the position re-read above, not from
                // the caller's `amount` — comparing the caller's number
                // against itself would prove nothing.
                positionAmount: position.amount,
                fullClose: closesEverything,
                stepSize,
                minTradeVolume: meta?.minTradeVolume ?? undefined,
                positionId,
            },
        });
    }

    /**
     * Exchange-fresh position list for the close-all paths (BUG-0514).
     *
     * Reads the provider-agnostic `/api/positions` route — the same read the
     * positions panel uses — and hydrates the result into the store, so the
     * caller sees what the exchange sees. A position opened in the venue's
     * own UI, missed during a WebSocket outage, or never snapshotted is
     * invisible in the cache and would otherwise survive the flatten while
     * the call reports success.
     *
     * Returns null when no read is possible (no keys to sign with) — the
     * caller then proceeds on the cache and reports unverified. Throws
     * `FETCH_FAILED` on a failed read rather than returning a possibly
     * partial list: flattening blind and reporting success is the defect
     * this exists to prevent. In paper mode returns the simulated book: the
     * OMS mirror only catches up on the next price tick, so it cannot
     * verify a flatten that just ran.
     */
    private readFreshPositions(provider: Venue): Promise<NormalizedPosition[] | null> {
        return this.positionLifecycle.readFreshPositions(provider);
    }

    private verifyFlat(
        provider: Venue,
        symbol?: string,
    ): Promise<{ leftover: string[]; unverified: boolean }> {
        return this.positionLifecycle.verifyFlat(provider, symbol);
    }

    /**
     * Reports a flatten that stopped short and throws. Failed attempts and
     * still-open leftovers are named; an unconfirmable run says exactly
     * that. Exactly one toast per run — the outer catch rethrows an already
     * reported `CLOSE_ALL_FAILED` untouched.
     */
    private reportFlattenShortfall(args: {
        failedCount: number;
        failedSymbols: string[];
        leftover: string[];
        unverified: boolean;
        symbol?: string;
    }): never {
        const { failedCount, failedSymbols, leftover, unverified, symbol } = args;
        const names = [...new Set([...failedSymbols, ...leftover])];
        if (unverified && failedCount === 0 && leftover.length === 0) {
            logger.error("market", "[CloseAll] Closes sent but flat could not be confirmed");
            toastService.error(get(_)("trade.closeAllUnverified" as import("../locales/schema").TranslationKey, { values: { scope: symbol || "all" } }));
        } else {
            const joined = names.join(", ");
            logger.error("market", `[CloseAll] Failed to close ${failedCount} positions, ${leftover.length} still open: ${joined}`);
            toastService.error(get(_)("trade.closeAllFailed" as import("../locales/schema").TranslationKey, { values: { failedSymbols: joined || symbol || "all" } }));
        }
        throw new Error(TRADE_ERRORS.CLOSE_ALL_FAILED);
    }

    public async closeAllPositions(symbol?: string) {
        logger.log("market", `[CloseAll] Closing all positions${symbol ? ` for ${symbol}` : ""}`);
        try {
            const provider = settingsState.apiProvider || "bitunix";
            if (provider === "bitunix") {
                const result = await this.gatedRequest({
                    kind: "bulk",
                    endpoint: "/api/orders",
                    payload: {
                        type: "close-all-positions",
                        symbol: symbol || undefined,
                    },
                    displayed: symbol ? { symbol } : {},
                });
                // The venue enumerates, so the work list cannot be stale —
                // but a mid-flatten race (opened during the run) and a
                // partial fill apply to this path too. Same guarantee as the
                // fallback: no success reported while anything remains open.
                const { leftover, unverified } = await this.verifyFlat(provider, symbol);
                if (leftover.length > 0 || unverified) {
                    this.reportFlattenShortfall({
                        failedCount: 0,
                        failedSymbols: [],
                        leftover,
                        unverified,
                        symbol,
                    });
                }
                return result;
            }

            /*
             * Fallback for non-Bitunix providers (BUG-0514): no verified
             * native bulk-close is wired. Bitget documents
             * POST /api/v2/mix/order/close-positions ("Flash Close Position",
             * symbol optional) and the UTA API documents an account-wide
             * close — but neither wire format is verified against the venue
             * (no local reference, no sandbox run), and BUG-0001 is the
             * standing reminder not to guess an exchange's wire format for a
             * call that closes real positions. FEAT-0525 pins the full Bitget
             * reference; until then the loop below over an exchange-fresh
             * list is the complete path, not a placeholder.
             */
            // A failed read throws FETCH_FAILED: flattening blind and
            // reporting success is the defect. No keys means no read is
            // possible — proceed on the cache best-effort (the closes then
            // refuse at signing) and let verification report unverified.
            const fresh = await this.readFreshPositions(provider);
            const toClose = (fresh ?? omsService.getPositions())
                .filter((p) => !symbol || p.symbol === symbol)
                .map((p) => ({
                    symbol: p.symbol,
                    positionSide: (p.side.toLowerCase() === "short" ? "short" : "long") as
                        "long" | "short",
                }));
            const promises = toClose.map((p) =>
                this.closePosition({ symbol: p.symbol, positionSide: p.positionSide, forceFullClose: true }),
            );
            const results = await Promise.allSettled(promises);

            const failures = results.filter((r) => r.status === "rejected");
            const failedSymbols = [
                ...new Set(
                    results
                        .map((r, i) => r.status === "rejected" ? (toClose[i]?.symbol ?? `position[${i}]`) : null)
                        .filter((s): s is string => s !== null),
                ),
            ];

            const { leftover, unverified } = await this.verifyFlat(provider, symbol);
            if (failures.length > 0 || leftover.length > 0 || unverified) {
                this.reportFlattenShortfall({
                    failedCount: failures.length,
                    failedSymbols,
                    leftover,
                    unverified,
                    symbol,
                });
            }

            return results;
        } catch (e: unknown) {
            // Already reported specifically above (failed/leftover/unverified
            // toast) — rethrow untouched so the trader is not toasted twice,
            // once with names and once without.
            if (e instanceof Error && e.message === TRADE_ERRORS.CLOSE_ALL_FAILED) throw e;
            logger.error("market", "[CloseAll] Failed to close all positions", e);
            const failedSymbols = symbol || "all";
            toastService.error(get(_)("trade.closeAllFailed" as import("../locales/schema").TranslationKey, { values: { failedSymbols } }));
            throw new Error(TRADE_ERRORS.CLOSE_ALL_FAILED, { cause: e });
        }
    }

    public async getOrderDetail(orderId?: string, clientId?: string): Promise<NormalizedOrder> {
        if (!orderId && !clientId) {
            throw new Error("Either orderId or clientId must be provided");
        }
        return await this.signedRequest<NormalizedOrder>(
            "/api/orders",
            {
                type: "order-detail",
                orderId,
                clientId,
            },
            undefined,
            // `order-detail` is one of the three query-signed actions, so the
            // venue signature covers these parameters rather than the body —
            // built here through the same function the route rebuilds them with.
            buildOrderDetailQueryParams({ orderId, clientId }),
        );
    }

    /**
     * Safe amend by re-reading the live order first.
     *
     * The lane lives in ./trade/modifyOrder; this facade keeps the signature.
     */
    public async modifyOrder(params: ModifyOrderParams) {
        return this.orderModify.modifyOrder(params);
    }

    public async fetchTpSlOrders(view: "pending" | "history" = "pending"): Promise<TpSlOrder[]> {
        return this.tpSl.fetchTpSlOrders(view);
    }

    public async cancelTpSlOrder(order: TpSlOrder) {
        return this.tpSl.cancelTpSlOrder(order);
    }

    /**
     * Modifies one leg of an existing TP/SL order (BUG-0293).
     *
     * The wire shape and why it is per-leg is documented on the module that
     * builds it, ./trade/tpSlService.
     */
    public async modifyTpSlOrder(params: ModifyTpSlParams): Promise<unknown> {
        return this.tpSl.modifyTpSlOrder(params);
    }

    /**
     * Creates the one position-wide TP/SL plan a position may carry
     * (FEAT-0070).
     *
     * Why this counts as a "modify" rather than an "open", and how it differs
     * from the fixed-quantity plan below, is documented on the module that
     * builds it, ./trade/tpSlService.
     */
    public async placePositionTpSl(params: PlacePositionTpSlParams): Promise<unknown> {
        return this.tpSl.placePositionTpSl(params);
    }

    /**
     * Creates a partial TP/SL plan with an explicit quantity (FEAT-0070).
     *
     * Unlike the position-wide plan, several of these can coexist, and each
     * covers a fixed quantity rather than tracking the position. That is what
     * a scale-out ladder is made of.
     *
     * The quantity is the caller's, unrounded here: `closePosition` rounds
     * because it derives a quantity from a percentage, while this one is
     * handed a quantity the caller already decided. Rounding it again would
     * move a number the trader typed.
     */
    public async placeTpSlOrder(params: PlaceTpSlParams): Promise<unknown> {
        return this.tpSl.placeTpSlOrder(params);
    }
}

export const tradeService = new TradeService();
