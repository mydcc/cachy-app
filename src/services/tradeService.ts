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
import { RetryPolicy } from "../utils/retryPolicy";
import { mapToOMSPosition } from "./mappers";
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
    PositionRawSchema,
    BitunixPositionTierResponseSchema,
} from "../types/apiSchemas";
import type { OMSOrderSide } from "./omsTypes";
import type { NormalizedOrder, NormalizedPosition } from "../types/exchange";
import { appFetch } from "../lib/appAuth";
import { paperState } from "../stores/paperTrading.svelte";
import { paperAccountFeed } from "./paperAccountFeed";
import { paperExchange } from "./paperExchange";
import { capabilitiesOf } from "./exchangeCapabilities";
import { unwrapApiEnvelope, formatApiNum, parseDecimal } from "../utils/utils";
import { accountState } from "../stores/account.svelte";
import { keysForActiveAccount, activeAccountFor } from "../stores/settings/accounts";
import { accountEpoch } from "./accountEpoch.svelte";
import { positionsReadOrder } from "./accountReadOrder";
import { normalizeMarginMode } from "../utils/marginMode";
import { roundDownToStep } from "../lib/calculators/partialClose";
import {
    orderGate,
    assertGatePass,
    accountFingerprint,
    translateRefusal,
    OrderRefusedError,
    mismatch,
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
    buildPositionsQueryParams,
    buildTpslWriteBody,
} from "../utils/exchange/venueQueries";

// Error shapes and order parameter contracts live in ./trade/* (FEAT-0342);
// re-exported here so existing importers keep working.
export { BitunixApiError, TradeError, TRADE_ERRORS } from "./trade/tradeErrors";
export type { TpSlOrder, PlaceOrderParams, ModifyOrderParams } from "./trade/tradeParams";
import { BitunixApiError, TradeError, TRADE_ERRORS } from "./trade/tradeErrors";
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
            const provider = settingsState.apiProvider;
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
        activeVenue: () => settingsState.apiProvider,
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

    // Read-only: current leverage + margin mode for a symbol, straight from
    // the exchange (not the local calculator input). Populates
    // tradeState.remoteLeverage/remoteMarginMode, which GeneralInputs.svelte
    // already reads for its "synced with API" indicator but which nothing
    // has ever set until now.
    public async fetchLeverageMarginMode(symbol: string): Promise<void> {
        return this.accountSettings.fetchLeverageMarginMode(symbol);
    }

    /**
     * Read-only: the account-wide position mode (FEAT-0068), straight from
     * the exchange. Populates `accountState.positionMode`, which
     * ExchangeAccountControls reads for its mode chip — previously only
     * PositionsSidebar's snapshot fed it, so the chip showed "—" wherever
     * the sidebar never fetched. Same silent-read contract as
     * `fetchLeverageMarginMode`: no keys, stale session or failed request
     * leaves the previous value alone.
     */
    public async fetchPositionMode(): Promise<void> {
        return this.accountSettings.fetchPositionMode();
    }

    /**
     * Leverage for one symbol, on the exchange (FEAT-0068).
     *
     * The range check against the pair's own `minLeverage`/`maxLeverage` is
     * the caller's — `marketState.symbolMeta` holds it and this service does
     * not read the UI's stores for validation. What is enforced here is that
     * the value is a whole number the endpoint can take.
     *
     * Confirmation comes from re-reading the exchange, not from the response
     * body: `fetchLeverageMarginMode` is what updates
     * `tradeState.remoteLeverage`, so the indicator turns green because the
     * exchange said so on a second, independent read.
     */
    public async changeLeverage(symbol: string, leverage: Decimal): Promise<void> {
        return this.accountSettings.changeLeverage(symbol, leverage);
    }

    /**
     * Margin mode for one symbol (FEAT-0068). The exchange refuses this while
     * the symbol carries a position or a resting order; the UI disables the
     * control in that case, and the refusal below is what happens when the
     * two disagree.
     */
    public async changeMarginMode(
        symbol: string,
        marginMode: "ISOLATION" | "CROSS",
    ): Promise<void> {
        return this.accountSettings.changeMarginMode(symbol, marginMode);
    }

    /**
     * Position mode for the whole futures account (FEAT-0068) — ONE_WAY or
     * HEDGE. Takes no symbol: the endpoint does not.
     *
     * Read back twice, on purpose.
     *
     * `fetchPositionMode()` is the one that must happen: it writes the field
     * the mode chip reads, and it belongs to this service, so it runs whether
     * or not anything else is on screen. `requestSync()` used to be the only
     * refresh here, and it is a *no-op* unless `PositionsSidebar` is mounted
     * to register the callback — so a trader with the sidebar hidden saw the
     * toast, the broker applied the change, and the chip kept the old value
     * until a reload (BUG-0410).
     *
     * `requestSync()` stays because the mode is reported on the account *and*
     * on every position, and both views have to stop disagreeing — but it is
     * now the extra, not the mechanism.
     *
     * Ordering is not load-bearing: overlapping account reads are sequenced
     * by `accountReadOrder` (BUG-0412), so whichever of the two lands last
     * cannot be an older answer than the one already applied.
     */
    public async changePositionMode(positionMode: "ONE_WAY" | "HEDGE"): Promise<void> {
        return this.accountSettings.changePositionMode(positionMode);
    }

    /**
     * Adds or withdraws margin on one isolated position (FEAT-0068). A
     * positive amount adds, a negative one withdraws — the exchange's own
     * convention, kept rather than split into two verbs so the sign the
     * trader sees is the sign that travels.
     *
     * Nothing is written optimistically. The position's new margin arrives on
     * the private WebSocket position channel, with `requestSync()` as the
     * fallback for a socket that is not connected.
     */
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

    // Hardening: Centralized Freshness Check
    private async ensurePositionFreshness(symbol: string, positionSide: "long" | "short") {
        let positions = omsService.getPositions();
        let position = positions.find(
            (p) => p.symbol === symbol && p.side === positionSide
        );

        // If cached position is stale (> 200ms), force a refresh to ensure quantity is correct.
        const MAX_POS_AGE_MS = 200;
        const now = Date.now();

        if (position && (now - (position.lastUpdated ?? 0) > MAX_POS_AGE_MS)) {
             logger.warn("market", `[Freshness] Position stale (${now - (position.lastUpdated ?? 0)}ms). Forcing refresh.`);
             try {
                await this.refreshPositionsForProvider();
                positions = omsService.getPositions();
                position = positions.find(
                    (p) => p.symbol === symbol && p.side === positionSide
                );
             } catch (e) {
                logger.error("market", `[Freshness] Stale refresh failed`, e);
                // HARDENING: If refresh fails, do NOT trust stale data for critical ops.
                // We throw here to abort the operation.
                throw new Error(TRADE_ERRORS.FETCH_FAILED, { cause: e });
             }
        }

        if (!position) {
            logger.warn("market", `[Freshness] Position not found in cache. Accessing API fallback for: ${symbol} ${positionSide}`);
            try {
                await this.refreshPositionsForProvider();
                positions = omsService.getPositions();
                position = positions.find(
                    (p) => p.symbol === symbol && p.side === positionSide
                );
             } catch (e) {
                logger.error("market", `[Freshness] API Fallback failed`, e);
                // Propagate error if we really expected a position but couldn't confirm
                throw e;
            }
        }

        return position;
    }

    /**
     * Provider-aware OMS refresh for the single-position paths (BUG-0527).
     *
     * `ensurePositionFreshness` resolves amounts exclusively through the OMS,
     * but its fallback (`fetchOpenPositionsFromApi`) is Bitunix-only: on live
     * Bitget nothing ever fed the OMS, so every single/flash close threw
     * `POSITION_NOT_FOUND` without sending a request. Per the item's triage —
     * one truth, not two — non-Bitunix venues refresh through the same
     * provider-agnostic `/api/positions` read the positions panel uses
     * (`readFreshPositions`, which mirrors into the OMS), rather than a fresh
     * read that would leave two sources of truth in the money path.
     *
     * The refresh carries the bulk path's eviction guarantee: mirrored keys
     * the exchange no longer lists are dropped, so a flattened position does
     * not linger as an OMS ghost a later single close would size off. The
     * 200 ms staleness rule above is untouched — this only decides *how* a
     * refresh happens, never *whether* one is required.
     *
     * Paper mode is excluded on purpose: the simulator owns the book and
     * feeds the OMS itself (`paperTradingService`) — a REST mirror would
     * shadow it. Bitunix keeps its exact current path untouched: its OMS
     * feed is live over WS with real positionIds, and the mirror carries
     * none (see `mirrorPositionsToOms`).
     */
    private async refreshPositionsForProvider(): Promise<void> {
        const provider = settingsState.apiProvider || "bitunix";
        if (provider === "bitunix") {
            await this.fetchOpenPositionsFromApi();
            return;
        }
        if (paperAccountFeed()) return;
        const fresh = await this.readFreshPositions(provider);
        // Null means no credentials to prove anything with — nothing to
        // mirror, and nothing proven gone, so nothing is evicted either.
        if (fresh !== null) this.evictMirroredGhosts(fresh);
    }

    /**
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
        let clientOrderId = "";
        try {
            // 1. Get fresh position
            const position = await this.ensurePositionFreshness(symbol, positionSide);

            if (!position) {
                throw new Error(TRADE_ERRORS.POSITION_NOT_FOUND);
            }

            // 2. Execute Close
            // True execution direction, for local optimistic-order bookkeeping
            // only — the API payload's own `side` matches the position side
            // instead (not inverted); see buildCloseOrderFields.
            const side: OMSOrderSide = positionSide === "long" ? "sell" : "buy";
            const { side: apiSide, tradeSide, positionId } = this.buildCloseOrderFields(
                positionSide,
                position.positionId,
            );

            // CRITICAL: Use exact amount from OMS
            if (!position.amount || position.amount.isZero() || position.amount.isNegative()) {
                logger.error("market", `[FlashClose] Invalid position amount: ${position.amount}`, position);
                throw new Error("apiErrors.invalidAmount");
            }

            const qty = position.amount.toString();

            logger.log("market", `[FlashClose] Closing ${symbol} ${positionSide} (${qty})`);

            // Retrieve current market price for optimistic UI feedback
            const currentPrice = marketState.data[symbol]?.lastPrice || new Decimal(0);

            /*
             * Minted before the intent because the generic payload carries it,
             * but NOT yet assigned to `clientOrderId`: that variable is the
             * catch block's signal that an optimistic order exists and needs
             * rolling back. Assigning it here would send the recovery path
             * chasing an order that was never added.
             */
            // Intentionally unguarded: exchange signing already requires crypto.subtle /
            // a secure context — see docs/adr/0013-client-side-exchange-signing.md.
            const candidateOrderId = "opt-" + crypto.randomUUID().replace(/-/g, "").slice(0, 28);

            const provider = settingsState.apiProvider || "bitunix";
            const intent: PartialIntent =
                provider === "bitunix" && position.positionId
                    ? {
                          kind: "reduce",
                          endpoint: "/api/orders",
                          payload: {
                              type: "flash-close-position",
                              symbol,
                              positionId: position.positionId,
                          },
                          displayed: { symbol, positionId: position.positionId },
                          confirmAs: "flash-close-position",
                          confirmedAt,
                      }
                    : {
                          kind: "reduce",
                          endpoint: "/api/orders",
                          payload: {
                              type: "place-order",
                              symbol,
                              side: apiSide,
                              orderType: "MARKET",
                              qty,
                              reduceOnly: true,
                              clientOrderId: candidateOrderId,
                              tradeSide,
                              positionId,
                              // BUG-0597: UTA names the side it closes. Bitunix
                              // keeps the position-side convention untouched.
                              ...(settingsState.apiProvider === "bitget"
                                ? this.bitgetUtaCloseFields(positionSide)
                                : {}),
                          },
                          displayed: {
                              symbol,
                              side: apiSide,
                              positionAmount: position.amount,
                              fullClose: true,
                              positionId,
                          },
                          /*
                           * The payload says `place-order` because that is what
                           * this venue understands, but the user pressed flash
                           * close and that is the policy they configured.
                           * Without this the prompt would appear on Bitunix and
                           * not on Bitget — a difference no user asked for.
                           */
                          confirmAs: "flash-close-position",
                          confirmedAt,
                      };

            /*
             * BUG-0331. Verified BEFORE anything below has a side effect.
             *
             * The cancel further down removes this position's stop-loss and
             * take-profit, which is right when the close then happens and
             * dangerous when it does not: a refusal afterwards leaves the
             * trader holding an open position with its protection gone, at the
             * moment they were trying to get out. That is strictly worse than
             * the state they started in, and it applied to every refusal the
             * gate can issue — the kill switch, a risk limit, a price
             * mismatch, a stale account read, an unsupported venue.
             *
             * `verify` is pure and documented as safe to call twice, so asking
             * here costs nothing and changes nothing: `gatedRequest` still runs
             * the same verification, and this cannot approve anything the gate
             * would refuse. It only moves the refusal to before the damage.
             */
            orderGate.verifyOrThrow(completeIntent(intent, this.displayedAccount()));

            // Past this line the function has side effects to undo on failure.
            clientOrderId = candidateOrderId;

            // OPTIMISTIC UPDATE
            omsService.addOptimisticOrder({
                id: clientOrderId,
                clientOrderId,
                symbol,
                side: side,
                type: "market",
                status: "pending",
                price: currentPrice,
                amount: position.amount,
                filledAmount: new Decimal(0),
                timestamp: Date.now(),
                _isOptimistic: true
            });

            /*
             * BUG-0586 (product decision 2026-10-05: close-then-cancel). The
             * close is dispatched BEFORE the resting stops are cancelled, so
             * a refusal from `gatedRequest` — risk limits, kill switch, or
             * the dispatch guard's session check — lands while the position
             * is still protected: the cancel below never runs, and the catch
             * removes the optimistic order as terminal (a refusal never
             * leaves the device, so there is nothing to reconcile).
             *
             * Residual risk, accepted with the decision: a stop placed after
             * the dispatch and before the cancel can fill against the close,
             * and in hedge mode that fill opens a reverse position rather
             * than flattening one. That window is inherent to close-first;
             * the alternative (cancel-first) left a refused close open AND
             * unprotected, which is strictly worse at the moment the trader
             * was trying to get out.
             */
            const result = await this.gatedRequest(intent);

            /*
             * Cleanup AFTER the close. A resting stop that survives the fill
             * would otherwise stay live on a flat position — or fight the
             * next entry on the symbol.
             *
             * Carries the flash close's own authorisation: `cancel-all`
             * confirms by default, and without this the gate refuses a cleanup
             * the user already agreed to when they confirmed the close.
             *
             * A cancel failure here must not fail the close: the position is
             * already flat, so this is a cleanup problem, not an execution
             * one. It is logged CRITICAL because resting stops may still be
             * live and need the trader's attention.
             */
            try {
                await this.cancelAllOrders(symbol, true, {
                    action: "flash-close-position",
                    confirmedAt,
                });
            } catch (cancelError) {
                logger.error("market", `[FlashClose] CRITICAL: Close succeeded but failed to cancel open orders for ${symbol}. Resting stops may still be live.`, cancelError);
            }

            const pnlVal = position.unrealizedPnl ?? new Decimal(0);
            effectsState.triggerDuckEvent({
                type: pnlVal.isNegative() ? "trade_loss" : "trade_win",
                pnl: pnlVal,
            });

            return { success: true, data: result };

        } catch (e: unknown) {
            // Use rawMessage for display when available (human-readable API text),
            // fall back to e.message for non-API errors (e.g. "tradeErrors.positionNotFound").
            // A gate refusal (FEAT-0011) names the field that disagreed and
            // is already translatable, so it wins over both.
            const msg = e instanceof OrderRefusedError
                ? translateRefusal(e.refusal, get(_) as (key: string, options?: { values?: Record<string, string> }) => string)
                : (e instanceof BitunixApiError && e.rawMessage) ? e.rawMessage : (e instanceof Error ? e.message : String(e));

            // Handle Optimistic Order Rollback/Recovery
            if (clientOrderId) {
                logger.warn("market", `[FlashClose] Request failed. Handling optimistic order ${clientOrderId}.`, e);

                const isApiErr = (err: unknown): err is { status?: number, code?: string } =>
                    typeof err === "object" && err !== null && ("status" in err || "code" in err);

                const isTerminalError =
                    // BUG-0586: a refusal is raised *before* the bytes leave —
                    // the gate's own checks, and the dispatch guard's
                    // `beforeAttempt` hook, both run ahead of `fetch`. So this
                    // is not an unknown outcome to be reconciled later; the
                    // venue never saw it. Classifying it as indeterminate
                    // parked the close in the OMS as `_isUnconfirmed`, which
                    // reads as "a close is out there we cannot see" for a
                    // request that provably did not go out.
                    (e instanceof OrderRefusedError) ||
                    (e instanceof BitunixApiError) ||
                    (e instanceof Error && (
                        e.message.includes("400") ||
                        e.message.includes("401") ||
                        e.message.includes("403") ||
                        (isApiErr(e) && e.code === "VALIDATION_ERROR") ||
                        (isApiErr(e) && e.status === 400) ||
                        (isApiErr(e) && e.status === 401) ||
                        (isApiErr(e) && e.status === 403)
                    ));

                if (isTerminalError) {
                     logger.warn("market", `[FlashClose] Definitive API Failure. Removing optimistic order.`);
                     omsService.removeOrder(clientOrderId);
                } else {
                     // Indeterminate state (Timeout / Network Error)
                     const order = omsService.getOrder(clientOrderId);
                     if (order) {
                         order._isUnconfirmed = true;
                         omsService.updateOrder(order);
                     }
                }

                // Trigger background sync
                (async () => {
                    try {
                        await RetryPolicy.execute(() => this.refreshPositionsForProvider(), {
                            maxAttempts: 5,
                            initialDelayMs: 500,
                            maxDelayMs: 5000,
                            name: "FlashClose Recovery Sync"
                        });
                    } catch (err) {
                        logger.error("market", `[FlashClose] CRITICAL: All recovery sync attempts failed.`, err);
                    }
                })();
            }

            // [FIX] Notify User & Prevent Crash
            logger.error("market", `[FlashClose] Failed: ${msg}`, e);
            toastService.error(get(_)("trade.flashCloseFailed" as import("../locales/schema").TranslationKey, { values: { msg } }));

            // Return failure object instead of throwing
            return { success: false, error: msg };
        }
    }

    private async fetchOpenPositionsFromApi() {
        if (settingsState.apiProvider !== "bitunix") return; // Only Bitunix supported for now

        try {
            // W-6: Use generalized provider key lookup instead of hardcoding 'bitunix'
            const provider = settingsState.apiProvider;
            const keys = keysForActiveAccount(settingsState.accounts, settingsState.activeAccountId, provider);
            if (!keys?.key || !keys?.secret) return;

            // The signed query is empty here — the route has no filter to sign —
            // and the envelope carries it as an empty `x-api-query` rather than
            // omitting the header, which is how presence and emptiness stay
            // distinguishable on the wire.
            const pendingResponse = await exchangeSignedFetch({
                cachyPath: "/api/sync/positions-pending",
                keys: { apiKey: keys.key, apiSecret: keys.secret },
                fetchFn: appFetch,
                payload: {},
                queryParams: {},
            });

            if (!pendingResponse.ok) throw new Error(TRADE_ERRORS.FETCH_FAILED);

            const pendingText = await pendingResponse.text();
            const pendingResult = safeJsonParse(pendingText);
            if (pendingResult.error) throw new TradeError(pendingResult.error, "trade.apiError");

            // Hardening: Best Effort Processing
            // Instead of failing the entire batch on one malformed entry, we validate per item.
            const rawList = Array.isArray(pendingResult.data) ? pendingResult.data : [];

            if (rawList.length === 0) {
                 // Nothing to process, but we might want to clear OMS positions if the API explicitly says "empty list"
                 // Currently OMS sync is additive/update-based. Full clearing is handled by specialized logic if needed.
            }

            let errorCount = 0;

            for (const item of rawList) {
                // Per-item validation
                const validation = PositionRawSchema.safeParse(item);

                if (validation.success) {
                    try {
                        // Use centralized mapper
                        omsService.updatePosition(mapToOMSPosition(validation.data));
                    } catch (mapError) {
                         logger.warn("market", "[TradeService] Mapping error for position", mapError);
                         errorCount++;
                    }
                } else {
                    // Log but don't crash
                    logger.warn("market", "[TradeService] Invalid position schema skipped", { item, error: validation.error });
                    errorCount++;
                }
            }

            if (errorCount > 0) {
                logger.warn("market", `[TradeService] Sync completed with ${errorCount} skipped invalid items.`);
            }

        } catch (e: unknown) {
            logger.error("market", "[TradeService] Failed to fetch open positions", e);
            throw e;
        }
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
     * Bitunix's place_order/batch_order docs (docs/bitunix-api/07_trade.md:
     * 32/583) list `tradeSide` as unconditionally `Required: true` — the
     * "nur im Hedge-Modus erforderlich" wording only describes when the
     * value matters for disambiguation, not when the field may be omitted.
     * BUG-0062 trusted the wording and only sent `tradeSide`/`positionId`
     * when `positionMode === "hedge"`, falling back to the old
     * inverted-`side`-only shape otherwise — confirmed live (BUG-0063) that
     * this fallback still 500s with "must not be null" on a ONE_WAY
     * account, so it was never a working shape to begin with. `positionId`
     * is documented as required whenever `tradeSide = CLOSE`, again with no
     * Hedge-only qualifier, so it's sent unconditionally too. `side`
     * matches the position's own side (BUY closes a long, SELL closes a
     * short) per the documented request example — not inverted — since
     * `tradeSide`/`positionId` now carry the open/close and which-position
     * disambiguation in all modes.
     */
    private buildCloseOrderFields(
        positionSide: "long" | "short",
        positionId: string | undefined,
    ): { side: "BUY" | "SELL"; tradeSide: "CLOSE"; positionId?: string } {
        return {
            side: positionSide === "long" ? "BUY" : "SELL",
            tradeSide: "CLOSE",
            positionId,
        };
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

        const { side, tradeSide, positionId } = this.buildCloseOrderFields(
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
    private async readFreshPositions(provider: Venue): Promise<NormalizedPosition[] | null> {
        // BUG-0587: taken before the first await. This read hydrates the store
        // on the close-all verification path and used to take no ticket, so a
        // response landing after an account or mode switch re-stamped the
        // snapshot under the new session. The list it returns is still used
        // for the verification itself — only the *write* is gated, so a stale
        // response still fails the caller's check rather than passing it.
        const ticket = positionsReadOrder.begin();

        const paper = paperAccountFeed();
        if (paper) return paper.positions();
        const keys = keysForActiveAccount(settingsState.accounts, settingsState.activeAccountId, provider);
        if (!keys?.key || !keys?.secret) return null;
        const response = await exchangeSignedFetch({
            cachyPath: "/api/positions",
            keys: { apiKey: keys.key, apiSecret: keys.secret, passphrase: keys.passphrase },
            venue: provider,
            payload: { exchange: provider },
            queryParams: buildPositionsQueryParams(provider),
            headers: { "X-Provider": provider },
            fetchFn: appFetch,
        });
        const json = await response.json();
        const { data } = unwrapApiEnvelope<{ positions: NormalizedPosition[] }>(json);
        if (data === null || !data.positions) throw new Error(TRADE_ERRORS.FETCH_FAILED);
        if (positionsReadOrder.mayApply(ticket)) {
            accountState.hydratePositions(data.positions, "live");
            if (provider !== "bitunix") this.mirrorPositionsToOms(data.positions);
        }
        return data.positions;
    }

    /**
     * OMS keys (`symbol:side`) this service mirrored from an exchange-fresh
     * read (non-Bitunix venues only — see `mirrorPositionsToOms`). The
     * post-flatten read evicts tracked keys the exchange no longer lists, so
     * a flattened position does not linger as an OMS ghost that a later
     * single close would size off (BUG-0527's evidence calls this out: single
     * closes resolve amounts through the OMS).
     */
    private mirroredOmsKeys = new Set<string>();

    /**
     * Mirrors an exchange-fresh list into the OMS (non-Bitunix venues only).
     *
     * Without this the closes below cannot run where nothing else feeds the
     * OMS: on live Bitget neither its WS channel nor its REST refresh writes
     * there, so `closePosition` — which resolves amounts through
     * `ensurePositionFreshness` — would throw `POSITION_NOT_FOUND` for every
     * leg (single closes through the same path are affected; tracked
     * separately, not fixed here). Bitunix is excluded on purpose: its OMS
     * feed is live over WS with real positionIds, and a mirror must never
     * overwrite those — its close requires the venue's own id
     * unconditionally (BUG-0062/BUG-0063). The mirror carries no id at all,
     * so `updatePosition` merges rather than replaces, and the venue body
     * for these venues needs none (symbol, side, amount).
     *
     * Add/update only, mirroring the paper simulator's lead: entries the
     * exchange no longer lists are simply never enumerated, and the
     * post-flatten read below is what proves them gone.
     */
    private mirrorPositionsToOms(list: NormalizedPosition[]): void {
        for (const p of list) {
            const side = p.side.toLowerCase() === "short" ? "short" : "long";
            this.mirroredOmsKeys.add(`${p.symbol}:${side}`);
            omsService.updatePosition({
                symbol: p.symbol,
                side,
                amount: parseDecimal(p.size),
                entryPrice: parseDecimal(p.entryPrice),
                unrealizedPnl: parseDecimal(p.unrealizedPnL),
                leverage: parseDecimal(p.leverage),
                marginMode: (p.marginMode || "").toLowerCase().startsWith("isolat")
                    ? "isolated"
                    : "cross",
                liquidationPrice: parseDecimal(p.liquidationPrice),
                margin: parseDecimal(p.margin),
                markPrice: parseDecimal(p.markPrice),
                lastUpdated: Date.now(),
            });
        }
    }

    /**
     * Post-flatten verification shared by both close-all paths: success is
     * not reported while a position on the account remains open. A position
     * that appeared mid-flatten was never in the work list and produces no
     * rejection, so per-leg results cannot prove flat — only a fresh read
     * can. Never throws: a read that itself fails is reported as unverified
     * rather than as success.
     */
    private async verifyFlat(
        provider: Venue,
        symbol?: string,
    ): Promise<{ leftover: string[]; unverified: boolean }> {
        try {
            const after = await this.readFreshPositions(provider);
            if (after === null) return { leftover: [], unverified: true };
            this.evictMirroredGhosts(after);
            const inScope = symbol ? after.filter((p) => p.symbol === symbol) : after;
            return { leftover: [...new Set(inScope.map((p) => p.symbol))], unverified: false };
        } catch (e) {
            logger.error("market", "[CloseAll] Post-flatten verification read failed", e);
            return { leftover: [], unverified: true };
        }
    }

    /**
     * Drops mirrored OMS entries the exchange no longer lists. Only keys
     * this service mirrored are ever evicted — the Bitunix WS feed's entries
     * (with real positionIds) are never tracked and never touched. Runs on
     * the full fresh list regardless of symbol scope: a position absent
     * account-wide is gone, not out of scope.
     */
    private evictMirroredGhosts(fresh: NormalizedPosition[]): void {
        const open = new Set(
            fresh.map((p) => `${p.symbol}:${p.side.toLowerCase() === "short" ? "short" : "long"}`),
        );
        for (const key of this.mirroredOmsKeys) {
            if (open.has(key)) continue;
            const separator = key.lastIndexOf(":");
            const symbol = key.slice(0, separator);
            const side = key.slice(separator + 1);
            if (symbol && (side === "long" || side === "short")) {
                omsService.removePosition(symbol, side);
            }
            this.mirroredOmsKeys.delete(key);
        }
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

    public async modifyOrder(params: ModifyOrderParams) {
        if (!params.orderId && !params.clientId) {
            throw new Error("Either orderId or clientId must be provided to modify order");
        }

        // AC 3: Safe Modify — Synchronous call to get_order_detail first
        const liveOrder = await this.getOrderDetail(params.orderId, params.clientId);
        if (!liveOrder) {
            throw new Error(TRADE_ERRORS.ORDER_NOT_FOUND);
        }

        const symbol = params.symbol || liveOrder.symbol;

        /*
         * A quantity the caller did not ask for is not sent to Bitget. UTA's
         * modify takes qty and/or price, and whether its `qty` replaces or adds
         * is unverified — open question 6 in
         * `docs/bitget-api/15_uta_writes.md`. Under delta semantics a price-only
         * modify would inflate the order on every price step, and each step
         * would look correct to the caller; under replace semantics the field
         * was a no-op anyway. Omitting it is correct under both, so the
         * question does not have to be answered first to be safe.
         *
         * Bitunix keeps the backfill: its `modify_order` lists `qty` as
         * required and calls it an "exchange requirement" that Cachy satisfies
         * from the live order (`docs/bitunix-api/07_trade.md:529`), so a
         * price-only amend would be refused there.
         *
         * The position-size guards below still read `liveOrder.amount`
         * independently — a price change moves notional, so the cap has to be
         * measured against the resting size whether or not `qty` travels.
         */
        const qty =
            params.qty !== undefined
                ? formatApiNum(params.qty)
                : settingsState.apiProvider === "bitget"
                  ? undefined
                  : liveOrder.amount;
        const price = params.price !== undefined ? formatApiNum(params.price) : (liveOrder.price || undefined);
        /*
         * A corrupt price is not a missing one, but it is equally
         * unverifiable: refuse typed (translated at the call site) instead of
         * letting `new Decimal` throw raw past the gate. A falsy venue price
         * stays "no entry given", as before.
         */
        let entryPrice: Decimal | undefined;
        const rawEntry = params.price !== undefined ? params.price : liveOrder.price;
        if (rawEntry) {
            let parsed: Decimal | undefined;
            try {
                const candidate = new Decimal(rawEntry);
                parsed = candidate.isFinite() ? candidate : undefined;
            } catch {
                parsed = undefined;
            }
            if (parsed === undefined) {
                throw new OrderRefusedError(mismatch(
                    "entryPrice",
                    "a readable price",
                    String(rawEntry),
                ));
            }
            entryPrice = parsed;
        }

        const payload: Record<string, unknown> = {
            type: "modify-order",
            orderId: params.orderId || liveOrder.orderId,
            clientId: params.clientId || liveOrder.clientId,
            symbol,
            qty,
            price,
            tpPrice: params.tpPrice !== undefined ? formatApiNum(params.tpPrice) : (liveOrder.tpPrice || undefined),
            tpStopType: params.tpStopType || liveOrder.tpStopType,
            tpOrderType: params.tpOrderType || liveOrder.tpOrderType,
            slPrice: params.slPrice !== undefined ? formatApiNum(params.slPrice) : (liveOrder.slPrice || undefined),
            slStopType: params.slStopType || liveOrder.slStopType,
            slOrderType: params.slOrderType || liveOrder.slOrderType,
        };

        if (params.tpOrderPrice !== undefined) payload.tpOrderPrice = formatApiNum(params.tpOrderPrice);
        if (params.slOrderPrice !== undefined) payload.slOrderPrice = formatApiNum(params.slOrderPrice);

        // Account equity for the percentage position-size cap — the same
        // tradeState the order panel reads (BUG-0548). Unparseable means the
        // cap is unmeasurable and an enlarging amendment refuses rather than
        // passing unmeasured (BUG-0508).
        let accountSize: Decimal | undefined;
        try {
            const parsed = new Decimal(tradeState.accountSize);
            accountSize = parsed.isFinite() && parsed.gt(0) ? parsed : undefined;
        } catch {
            accountSize = undefined;
        }

        // The displayed side of a modify is what the caller asked for, before
        // formatApiNum() touched it. Comparing the formatted payload back
        // against the raw request is what catches a serialisation defect —
        // the exact failure mode that produced the float bug in the order
        // payload and the `response.json()`-corrupted order IDs.
        /*
         * Same fail-closed reading as entryPrice above, for the remaining
         * raw constructions in this hunk: a stated but corrupt level or
         * quantity refuses typed instead of throwing raw past the gate. An
         * absent quantity stays undefined — the gate refuses a stated
         * payload quantity without a displayed one as missing qty.inputs.
         */
        let stopLossPrice: Decimal | undefined;
        if (params.slPrice !== undefined) {
            try {
                const parsed = new Decimal(params.slPrice);
                stopLossPrice = parsed.isFinite() ? parsed : undefined;
            } catch {
                stopLossPrice = undefined;
            }
            if (stopLossPrice === undefined) {
                throw new OrderRefusedError(mismatch(
                    "stopLoss",
                    "a readable price",
                    String(params.slPrice),
                ));
            }
        }
        let takeProfits: Decimal[] | undefined;
        if (params.tpPrice !== undefined) {
            let parsed: Decimal | undefined;
            try {
                const candidate = new Decimal(params.tpPrice);
                parsed = candidate.isFinite() ? candidate : undefined;
            } catch {
                parsed = undefined;
            }
            if (parsed === undefined) {
                throw new OrderRefusedError(mismatch(
                    "takeProfit",
                    "a readable price",
                    String(params.tpPrice),
                ));
            }
            takeProfits = [parsed];
        }
        let modifyQuantity: Decimal | undefined;
        const rawQty = params.qty !== undefined ? params.qty : liveOrder.amount;
        if (rawQty !== undefined && rawQty !== null && rawQty !== "") {
            try {
                const parsed = new Decimal(rawQty);
                modifyQuantity = parsed.isFinite() ? parsed : undefined;
            } catch {
                modifyQuantity = undefined;
            }
            if (modifyQuantity === undefined) {
                throw new OrderRefusedError(mismatch(
                    "modifyQuantity",
                    "a readable quantity",
                    String(rawQty),
                ));
            }
        }
        //
        // The size the order carried before this amendment — the gate only
        // knows an amendment enlarges exposure by comparing the new quantity
        // against this one (BUG-0548). A corrupt live reading must not throw
        // raw past the gate: undefined feeds the fail-closed increase path
        // instead.
        //
        // `amount` is the order's TOTAL size, not its resting remainder, and a
        // partial fill does not shrink it. Bitunix is verified: the mirror
        // documents `qty` as "Quantity (base coin)" and `tradeQty` as the
        // filled amount, and both examples hold `qty` at 1 while `tradeQty` is
        // 0.5 — one of them explicitly `PART_FILLED`
        // (docs/bitunix-api/07_trade.md). So `previousQuantity` is the
        // pre-amendment total either way.
        //
        // Which means the baseline must NOT be "hardened" by adding `filled`:
        // that would double-count the executed portion and push the baseline
        // above the real order size, making a genuine increase read as a
        // shrink more often than before, not less.
        //
        // Not verified, and deliberately not claimed: for Bitget this reads
        // `size` as the total, which the mirror does document — but the mirror
        // has no partial-fill example, so that Bitget keeps `size` across one
        // is read off the normalised payload, not off a spec. Bitget's wire
        // format is already flagged unverified in BUG-0580, and BUG-0589
        // records what the same gap costs on the sibling field: the Bitget
        // normaliser reads `filledQty`, which the mirror never mentions (it
        // documents `baseVolume`), so `NormalizedOrder.filled` is most likely
        // always "0" there. That does not reach this gate, which reads `amount`
        // and not `filled` — but it is why nothing above leans on `filled`.
        //
        // The live read still races the gate by construction — one round trip,
        // no user action in between — so the residual is accepted rather than
        // locked, and a stale-high reading fails toward the increase path. The
        // corrupt cases are handled rather than assumed: undefined, null, NaN,
        // infinite, zero and negative all route to the increase path in
        // `isQuantityIncreasingModify`.
        let liveAmount: Decimal | undefined;
        try {
            liveAmount = new Decimal(liveOrder.amount);
        } catch {
            liveAmount = undefined;
        }
        return await this.gatedRequest({
            kind: "modify",
            endpoint: "/api/orders",
            payload,
            displayed: {
                symbol: typeof symbol === "string" ? symbol : undefined,
                orderId: params.orderId,
                entryPrice,
                positionSide: liveOrder.side,
                stopLossPrice,
                takeProfits,
                // The quantity the caller asked for, or the live order read
                // this request was merged with — the gate compares the
                // payload back against it (BUG-0505).
                modifyQuantity,
                // The size the resting order had before this amendment — the
                // gate only knows an amendment enlarges exposure by comparing
                // the new quantity against this one (BUG-0548).
                previousQuantity: liveAmount,
                accountSize,
            },
        });
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
