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
    BitunixLeverageMarginModeSchema,
    BitunixTradingPairResponseSchema,
    BitunixPositionTierResponseSchema,
    BitgetContractsResponseSchema,
} from "../types/apiSchemas";
import type { OMSOrderSide } from "./omsTypes";
import type { NormalizedOrder, NormalizedPosition } from "../types/exchange";
import { appFetch } from "../lib/appAuth";
import { paperState } from "../stores/paperTrading.svelte";
import { paperAccountFeed } from "./paperAccountFeed";
import { paperExchange } from "./paperExchange";
import { capabilitiesOf } from "./exchangeCapabilities";
import { unwrapApiEnvelope, formatApiNum, parseDecimal } from "../utils/utils";
import { normalizeTpSlRows } from "./tpslNormalize";
import { accountState } from "../stores/account.svelte";
import { keysForActiveAccount, activeAccountFor } from "../stores/settings/accounts";
import { accountEpoch } from "./accountEpoch.svelte";
import { accountReadOrder, leverageReadOrder } from "./accountReadOrder";
import { normalizeMarginMode } from "../utils/marginMode";
import { roundDownToStep } from "../lib/calculators/partialClose";
import {
    orderGate,
    assertGatePass,
    accountFingerprint,
    translateRefusal,
    OrderRefusedError,
    mismatch,
    BOT_PAPER_ONLY_MESSAGE_KEY,
    type GatePass,
    type DisplayedState,
    type OrderIntent,
    type OrderOrigin,
} from "./orderGate";
import { exchangeSignedFetch, SIGNING_ERRORS } from "../utils/exchange/browserSigning";
import {
    cachyAction,
    planForRoute,
    signatureShapeFor,
    type Venue,
} from "../utils/exchange/restSigningPlan";
import {
    buildAccountQueryParams,
    buildLeverageMarginModeQueryParams,
    buildOrderDetailQueryParams,
    buildPositionsQueryParams,
    buildTpslReadQueryParams,
    buildTpslWriteBody,
} from "../utils/exchange/venueQueries";
import { AccountSettingsRequestSchema } from "../types/accountSettingsSchemas";
import { OrderRequestSchema } from "../types/orderSchemas";

// Error shapes and order parameter contracts live in ./trade/* (FEAT-0342);
// re-exported here so existing importers keep working.
export { BitunixApiError, TradeError, TRADE_ERRORS } from "./trade/tradeErrors";
export type { TpSlOrder, PlaceOrderParams, ModifyOrderParams } from "./trade/tradeParams";
import { BitunixApiError, TradeError, TRADE_ERRORS } from "./trade/tradeErrors";
import type { TpSlOrder, PlaceOrderParams, ModifyOrderParams } from "./trade/tradeParams";
/**
 * An intent as a call site states it: everything except the account fields,
 * which `completeIntent` fills in from the active session.
 */
type PartialIntent = Omit<OrderIntent, "displayed"> & {
    displayed: Omit<DisplayedState, "provider" | "accountFingerprint" | "paperMode">;
};

/**
 * The credentials of an account that does not exist.
 *
 * Frozen: it is shared by the two gate-facing reads, and a caller that
 * mutated it would silently poison both.
 */
const EMPTY_KEYS: Readonly<ApiKeys> = Object.freeze({ key: "", secret: "" });

/**
 * Attempts for a post-write read-back, the immediate one included
 * (BUG-0409).
 */
const READ_BACK_ATTEMPTS = 3;

/**
 * Gaps before the second and third attempt.
 *
 * Two numbers rather than a formula: a venue that has not settled within
 * ~2.7 s of a confirmed write will not settle at ~3 s either, and a trader
 * watching a chip must not be left in front of an open-ended backoff. Whoever
 * widens this owes the request-budget arithmetic — the venue allows 10 req/s
 * per endpoint and every other account read is event-driven.
 */
const READ_BACK_DELAYS_MS = [700, 2000];

class TradeService {
    // Hardening: Promise Coalescing to prevent Thundering Herd
    private fetchPositionsPromise: Promise<void> | null = null;

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
        assertGatePass(
            {
                endpoint,
                payload,
                provider,
                accountFingerprint: accountFingerprint(keys?.key),
                accountId: account?.id,
                paperMode: paperState.enabled,
            },
            pass
        );

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
        const serializedPayload = this.serializePayload(payloadWithExchange);

        // FEAT-0405 A5 — the orders schema is not a pass-through. It defaults
        // `marginCoin`, uppercases `side` and clamps `limit`, and the route
        // builds its rebuild of the signed bytes from *its* parse. Signing the
        // raw payload here would therefore be a different string and every
        // order would come back as `PRESIGNED_DIVERGENCE` before Bitunix saw
        // it — the same trap the account-settings transport sidesteps by
        // parsing first, and for the same reason.
        const signedPayload =
            endpoint === "/api/orders"
                ? this.parseOrderPayload(serializedPayload)
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
                  fetchFn: appFetch,
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
        const provider = settingsState.apiProvider;
        if (provider !== "bitunix") return; // Bitget equivalent: follow the M2 adapter shape
        const keys = keysForActiveAccount(settingsState.accounts, settingsState.activeAccountId, provider);
        if (!keys?.key || !keys?.secret) return;

        // FEAT-0026. These three fields are what the FEAT-0011 gate ages: it
        // asks "is this recent enough", never "is this the account I am
        // signing for". A late response writing them would look freshly
        // confirmed while describing the account the trader just left.
        //
        // BUG-0412's ordering rides on the same ticket, in its own lane: this
        // read has five-plus triggers (symbol selection, the order-submit
        // stale gate, post-write read-backs) and the read-back below fires it
        // repeatedly on purpose, so overlapping answers are the normal case
        // here rather than the exception.
        const ticket = leverageReadOrder.begin();

        try {
            const response = await exchangeSignedFetch({
                cachyPath: "/api/leverage-margin-mode",
                keys: { apiKey: keys.key, apiSecret: keys.secret },
                fetchFn: appFetch,
                payload: { exchange: provider, symbol },
                queryParams: buildLeverageMarginModeQueryParams({ symbol }),
            });
            const json = await response.json();
            const { data } = unwrapApiEnvelope<Record<string, unknown>>(json);
            if (!data) return;

            const validation = BitunixLeverageMarginModeSchema.safeParse(data);
            if (!validation.success) {
                logger.error("network", "[TradeService] Invalid leverage/margin-mode response", validation.error.issues);
                return;
            }
            if (!leverageReadOrder.mayApply(ticket)) return;

            tradeState.remoteLeverage = new Decimal(validation.data.leverage);
            tradeState.remoteMarginMode = validation.data.marginMode;
            // FEAT-0011 measures staleness from here. Stamped only on a
            // successful read, so a failed refresh leaves the previous
            // timestamp to age out rather than looking freshly confirmed.
            tradeState.remoteAccountStateAt = Date.now();
        } catch (e) {
            logger.debug("api", "[TradeService] fetchLeverageMarginMode failed", e);
        }
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
        const provider = settingsState.apiProvider || "bitunix";
        const keys = keysForActiveAccount(settingsState.accounts, settingsState.activeAccountId, provider);
        if (!keys?.key || !keys?.secret) return;

        // BUG-0412: this read competes with PositionsSidebar's two mounted
        // instances for the same store field, so the ticket has to be taken
        // here — before the first `await` — rather than at the write.
        const ticket = accountReadOrder.begin();

        // Paper mode answers from the simulated book, exactly like
        // PositionsSidebar: paperExchange simulates orders only and knows
        // no venue margin modes, so there is no live read to take here.
        const paper = paperAccountFeed();
        if (paper) {
            if (!accountReadOrder.mayApply(ticket)) return;
            accountState.setPositionMode(paper.accountInfo().positionMode);
            return;
        }

        try {
            // FEAT-0405 A5 — this read used to carry the secret, and its failure
            // is swallowed by every caller (`.catch(() => {})` in
            // ExchangeAccountControls), which is exactly how an unmigrated call
            // site here would present: position mode silently stuck on its
            // default. Signing it in the browser is what keeps that quiet.
            const response = await exchangeSignedFetch({
                cachyPath: "/api/account",
                keys: { apiKey: keys.key, apiSecret: keys.secret, passphrase: keys.passphrase },
                venue: provider,
                payload: { exchange: provider },
                queryParams: buildAccountQueryParams(provider),
                headers: { "X-Provider": provider },
                fetchFn: appFetch,
            });
            const json = await response.json();
            const { data } = unwrapApiEnvelope<{ positionMode?: unknown }>(json);
            if (!data) return;
            // Leaves the "a failed read changes nothing" contract above
            // intact: only a read that actually produced a snapshot claims
            // the ordering slot.
            if (!accountReadOrder.mayApply(ticket)) return;

            accountState.setPositionMode(
                typeof data.positionMode === "string" ? data.positionMode : undefined,
            );
        } catch (e) {
            logger.debug("api", "[TradeService] fetchPositionMode failed", e);
        }
    }

    /*
     * FEAT-0068 — the account-settings write transport.
     *
     * Deliberately separate from `signedRequest`: none of these is an order,
     * so none carries a FEAT-0011 gate pass, and routing them through the
     * order transport would either need a pass they cannot produce or a hole
     * in `assertGatePass`. They are still writes, which is why they throw on
     * failure rather than resolving quietly the way the account *reads* above
     * do — a leverage change that reported nothing would leave the trader
     * sizing a position against a number the exchange never accepted.
     *
     * FEAT-0405 A5: the credential rides as a pre-signed envelope like every
     * other migrated route, so the secret never leaves the device.
     *
     * Paper mode never reaches the network. `paperExchange` simulates orders,
     * not account settings; there is nothing on the far side to change, so
     * this refuses instead of pretending.
     */
    private async accountSettingRequest(
        payload: Record<string, unknown>,
    ): Promise<unknown> {
        if (paperState.enabled) {
            throw new Error("exchange.accountSettings.paperMode");
        }

        const provider = settingsState.apiProvider;
        const keys = keysForActiveAccount(settingsState.accounts, settingsState.activeAccountId, provider);
        if (!keys?.key || !keys?.secret) {
            throw new Error("apiErrors.missingCredentials");
        }

        // Parsed here as well as in the route, and for the same reason the route
        // parses: `marginCoin` carries a default and `amount` a transform, so the
        // two sides only build the same bytes if they build from the same parsed
        // payload. Signing the raw object instead would be refused as
        // `PRESIGNED_DIVERGENCE` before anything left Cachy.
        const parsed = AccountSettingsRequestSchema.safeParse({ exchange: provider, ...payload });
        if (!parsed.success) {
            const details = parsed.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join(", ");
            throw new BitunixApiError("VALIDATION_ERROR", "apiErrors.generic", details);
        }

        const response = await exchangeSignedFetch({
            cachyPath: "/api/account-settings",
            keys: { apiKey: keys.key, apiSecret: keys.secret, passphrase: keys.passphrase },
            method: "POST",
            // Named rather than inferred: the route resolves its venue from the
            // body, and the envelope itself carries only credentials.
            venue: provider,
            fetchFn: appFetch,
            headers: { "X-Provider": provider },
            payload: parsed.data,
        });

        const text = await response.text();
        let data: Record<string, unknown> = {};
        try {
            data = safeJsonParse(text);
        } catch {
            if (!response.ok) throw new BitunixApiError(response.status, "apiErrors.invalidResponse");
        }

        const code = data.code as string | number | undefined;
        if (!response.ok || (code !== undefined && String(code) !== "0")) {
            const rawMsg = String(data.error || data.msg || "Unknown API Error");
            logger.debug("api", `[TradeService] Account setting rejected: ${rawMsg}`);
            throw new BitunixApiError(code ?? response.status ?? -1, "apiErrors.generic", rawMsg);
        }

        return data.data ?? null;
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
        if (!leverage.isFinite() || !leverage.isInteger() || leverage.lte(0)) {
            throw new Error("apiErrors.invalidAmount");
        }
        // Leverage is already validated as finite, integer, and positive.
        // Converting to native number for the wire protocol.
        await this.accountSettingRequest({
            type: "change-leverage",
            symbol,
            leverage: +leverage,
        });
        await this.fetchLeverageMarginMode(symbol);
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
        await this.accountSettingRequest({ type: "change-margin-mode", symbol, marginMode });

        accountState.marginModeVerifying = true;
        try {
            const outcome = await this.readBackUntilApplied(
                () => this.fetchLeverageMarginMode(symbol),
                () =>
                    normalizeMarginMode(tradeState.remoteMarginMode) ===
                    normalizeMarginMode(marginMode),
            );
            if (outcome === "unconfirmed") this.warnUnconfirmed();
        } finally {
            accountState.marginModeVerifying = false;
        }
    }

    /**
     * Read one account setting back until the venue reports what was written
     * (BUG-0409).
     *
     * The write returning 200 is not the same as the change being readable.
     * A single immediate re-read can land inside the venue's own propagation
     * window and answer with the pre-write value — captured live: an
     * `/api/account` body still saying `HEDGE` seconds after a confirmed
     * `ONE_WAY` write, with the broker app already showing `ONE_WAY`. The
     * chip then showed the old mode and nothing ever corrected it, so the
     * trader's next write diffed against a value that was never current.
     *
     * Bounded and finite on purpose: this is a read-back for one write, not a
     * poller. It stops the moment the venue agrees, gives up after
     * `READ_BACK_ATTEMPTS`, and abandons immediately if the account is
     * switched underneath — the answer would describe an account the trader
     * has left.
     *
     * Returns how the read-back ended. `confirmed` and `unconfirmed`
     * both mean the account is still the trader's own — only then may the
     * caller warn. `switched` means the account moved underneath: warning
     * about the previous account's value would blame the venue for a read
     * that no longer belongs to this session. It deliberately does not
     * decide beyond that: the caller knows which control the trader is
     * looking at.
     */
    private async readBackUntilApplied(
        read: () => Promise<void>,
        isApplied: () => boolean,
    ): Promise<"confirmed" | "unconfirmed" | "switched"> {
        const session = accountEpoch.current();

        for (let attempt = 0; attempt < READ_BACK_ATTEMPTS; attempt++) {
            if (attempt > 0) {
                await new Promise((resolve) =>
                    setTimeout(resolve, READ_BACK_DELAYS_MS[attempt - 1]),
                );
                if (!accountEpoch.isCurrent(session)) return "switched";
            }
            await read();
            if (!accountEpoch.isCurrent(session)) return "switched";
            if (isApplied()) return "confirmed";
        }
        return "unconfirmed";
    }

    /**
     * Say out loud that the venue never confirmed the change.
     *
     * The alternative this replaces was a `logger` line: the write succeeded,
     * the toast said so, and the chip kept the old value with nothing to
     * distinguish "the exchange is slow" from "Cachy is broken". The displayed
     * value stays whatever the venue last reported — it is not overwritten
     * with what was requested, because that would be the optimistic write
     * FEAT-0068 exists to avoid.
     */
    private warnUnconfirmed(): void {
        toastService.warning(get(_)("exchange.accountSettings.notConfirmed"));
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
        await this.accountSettingRequest({ type: "change-position-mode", positionMode });

        accountState.positionModeVerifying = true;
        try {
            const outcome = await this.readBackUntilApplied(
                () => this.fetchPositionMode(),
                () => (accountState.positionMode ?? "").toUpperCase() === positionMode,
            );
            if (outcome === "unconfirmed") this.warnUnconfirmed();
        } finally {
            accountState.positionModeVerifying = false;
        }

        accountState.requestSync();
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
        const { symbol, amount, side, positionId } = params;
        if (!amount.isFinite() || amount.isZero()) {
            throw new Error("apiErrors.invalidAmount");
        }
        if (!side && !positionId) {
            throw new Error("apiErrors.invalidAmount");
        }
        // All financial calculations are complete; converting to string for the
        // wire protocol with full precision.
        const amountStr = amount.toFixed(amount.decimalPlaces() ?? 0);
        await this.accountSettingRequest({
            type: "adjust-position-margin",
            symbol,
            amount: amountStr,
            ...(side ? { side } : {}),
            ...(positionId ? { positionId } : {}),
        });
        accountState.requestSync();
    }

    // Read-only: precision, order-size limits, leverage range and status for
    // a symbol. Public endpoints, no credentials.
    //
    // BUG-0501: venue-dispatched internally — Bitunix reads market/
    // trading_pairs, Bitget reads V2 mix contracts — but one method, so the
    // adapter table keeps a single verb to declare. The entry is keyed
    // venue-normalized, and every miss path records the attempt instead of
    // writing a stub: a failed fetch retries after the cooldown, never reads
    // as "no precision".
    public async fetchTradingPairInfo(symbol: string): Promise<void> {
        const venue = settingsState.apiProvider || "bitunix";
        const key = normalizeSymbol(symbol, venue);
        await this.fetchKeyedMeta(key, () =>
            venue === "bitget"
                ? this.loadBitgetInstrumentInfo(key, symbol)
                : this.loadBitunixPairInfo(key, symbol),
        );
    }

    /** In-flight metadata loads, so concurrent callers share one request. */
    private metaFetchInflight: Record<string, Promise<void>> = {};

    private async fetchKeyedMeta(key: string, load: () => Promise<boolean>): Promise<void> {
        if (!marketState.shouldFetchMeta(key)) return;
        const running = this.metaFetchInflight[key];
        if (running) {
            await running;
            return;
        }
        const flight = (async () => {
            try {
                marketState.noteMetaFetch(key, await load());
            } catch {
                marketState.noteMetaFetch(key, false);
            } finally {
                delete this.metaFetchInflight[key];
            }
        })();
        this.metaFetchInflight[key] = flight;
        await flight;
    }

    /** Loads one Bitunix row; true when an entry was written. */
    private async loadBitunixPairInfo(key: string, symbol: string): Promise<boolean> {
        try {
            const response = await appFetch(`/api/trading-pairs?symbols=${encodeURIComponent(symbol)}`);
            if (!response.ok) return false;
            const json = await response.json();

            const validation = BitunixTradingPairResponseSchema.safeParse(json);
            if (!validation.success) {
                logger.error("network", "[TradeService] Invalid trading-pairs response", validation.error.issues);
                return false;
            }
            const entry = validation.data.data?.[0];
            if (!entry) return false;

            marketState.setSymbolMeta(key, {
                symbol: entry.symbol,
                basePrecision: entry.basePrecision,
                quotePrecision: entry.quotePrecision,
                minTradeVolume: entry.minTradeVolume ?? null,
                maxLimitOrderVolume: entry.maxLimitOrderVolume ?? null,
                maxMarketOrderVolume: entry.maxMarketOrderVolume ?? null,
                minLeverage: entry.minLeverage,
                maxLeverage: entry.maxLeverage,
                defaultLeverage: entry.defaultLeverage,
                priceProtectScope: entry.priceProtectScope ?? null,
                symbolStatus: entry.symbolStatus,
                isApiSupported: entry.isApiSupported,
            });
            return true;
        } catch (e) {
            logger.debug("api", "[TradeService] fetchTradingPairInfo failed", e);
            return false;
        }
    }

    /** Loads one Bitget V2 contracts row; true when an entry was written. */
    private async loadBitgetInstrumentInfo(key: string, symbol: string): Promise<boolean> {
        const toInt = (v: string | undefined): number | undefined => {
            if (v === undefined) return undefined;
            const n = parseInt(v, 10);
            return Number.isFinite(n) ? n : undefined;
        };
        const toDecimalOrNull = (v: string | undefined): Decimal | null => {
            if (v === undefined) return null;
            try {
                const d = new Decimal(v);
                return d.isFinite() ? d : null;
            } catch {
                return null;
            }
        };
        try {
            const response = await appFetch(`/api/bitget/contracts?symbols=${encodeURIComponent(symbol)}`);
            if (!response.ok) return false;
            const json = await response.json();

            const validation = BitgetContractsResponseSchema.safeParse(json);
            if (!validation.success || validation.data.code !== "00000") {
                logger.error("network", "[TradeService] Invalid bitget contracts response");
                return false;
            }
            const row = validation.data.data?.find(
                (r) => normalizeSymbol(r.symbol, "bitget") === key,
            );
            if (!row) return false;

            marketState.setSymbolMeta(key, {
                symbol: row.symbol,
                basePrecision: toInt(row.volumePlace),
                quotePrecision: toInt(row.pricePlace),
                minTradeVolume: toDecimalOrNull(row.minTradeNum),
                maxLimitOrderVolume: toDecimalOrNull(row.maxOrderQty),
                maxMarketOrderVolume: toDecimalOrNull(row.maxMarketOrderQty),
                minLeverage: toInt(row.minLever),
                maxLeverage: toInt(row.maxLever),
                defaultLeverage: undefined,
                priceProtectScope: null,
                // V2 reports "normal"; the gate and the panel speak Bitunix
                // ("OPEN"). Mapped here so one vocabulary rules downstream;
                // anything else passes through raw and refuses closed.
                symbolStatus: row.symbolStatus === "normal" ? "OPEN" : row.symbolStatus,
                isApiSupported: undefined,
            });
            return true;
        } catch (e) {
            logger.debug("api", "[TradeService] fetchBitgetInstrumentInfo failed", e);
            return false;
        }
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

    // Helper to safely serialize Decimals to strings
    /**
     * Validates an order payload before it is signed (FEAT-0405 A5).
     *
     * The route validates the body it receives and rebuilds the signed bytes
     * from *that* parse, so this is the only way both sides can arrive at the
     * same string. Throws rather than falling back to the raw payload: a
     * payload the route would refuse is not one to sign, and a silent fallback
     * would surface as a divergence in the middle of a trade.
     */
    private parseOrderPayload(
        payload: unknown,
    ): Record<string, unknown> {
        const parsed = OrderRequestSchema.safeParse(payload);
        if (!parsed.success) {
            const details = parsed.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join(", ");
            throw new BitunixApiError("VALIDATION_ERROR", "apiErrors.generic", details);
        }
        return parsed.data as Record<string, unknown>;
    }

    private serializePayload(payload: unknown, depth = 0, seen = new WeakSet()): unknown {
        if (depth > 20) {
            logger.warn("market", "[TradeService] Serialization depth limit exceeded");
            return "[Serialization Limit]";
        }

        if (!payload) return payload;
        if (payload instanceof Decimal) return payload.toString();

        // Handle generic objects that might be Decimals if constructor name is mangled or instance check fails
        if (Decimal.isDecimal(payload)) {
            return payload.toString();
        }

        if (typeof payload === 'object' && payload !== null) {
            if (seen.has(payload)) return "[Circular]";
            seen.add(payload);
        }

        if (Array.isArray(payload)) {
            return payload.map(item => this.serializePayload(item, depth + 1, seen));
        }

        if (typeof payload === 'object') {
            const newObj: Record<string, unknown> = {};
            for (const key in payload) {
                if (Object.prototype.hasOwnProperty.call(payload, key)) {
                    newObj[key] = this.serializePayload((payload as Record<string, unknown>)[key], depth + 1, seen);
                }
            }
            return newObj;
        }

        return payload;
    }

    /**
     * The account half of the displayed state — the exchange and key the UI
     * currently shows as active. Every intent needs it; nothing else about
     * an intent is shared, so the rest is built per call site.
     */
    private displayedAccount(): Pick<
        DisplayedState,
        "provider" | "accountFingerprint" | "accountId" | "paperMode"
    > {
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
    /**
     * Fills in the account fields every intent shares, so a caller states only
     * what is specific to its order.
     *
     * Extracted in BUG-0331 because the flash-close path now verifies an
     * intent before it acts and then submits the same one. Building it twice
     * would mean the check and the submission could disagree — which is the
     * exact class of bug the gate exists to catch.
     */
    private completeIntent(intent: PartialIntent): OrderIntent {
        const account = this.displayedAccount();

        // A caller may *state* which account it believed was active — that is
        // how the account chip will supply a second, independent root once
        // every order surface renders one. What a caller may not do is blank
        // it.
        //
        // `...intent.displayed` spreads over the store-derived block, and
        // `accountId` is not in `PartialIntent`'s omit list, so a call site
        // passing `accountId: maybeUndefined` used to overwrite the real id
        // with `undefined` — and `assertGatePass` skips the comparison
        // entirely when the pass carries none. An ordinary-looking assignment
        // could therefore switch off a money-critical check with nothing
        // going red anywhere.
        //
        // So: a supplied id that disagrees with the store is a refusal, and
        // the id that reaches the pass is always the store's.
        const supplied = intent.displayed.accountId;
        if (supplied !== undefined && supplied !== account.accountId) {
            throw new OrderRefusedError(
                mismatch("account", supplied, account.accountId ?? "—"),
            );
        }

        return {
            ...intent,
            displayed: {
                ...account,
                ...intent.displayed,
                accountId: account.accountId,
            },
        };
    }

    private async gatedRequest<T>(intent: PartialIntent): Promise<T> {
        const full = this.completeIntent(intent);
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
            orderGate.verifyOrThrow(this.completeIntent(intent));

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
             * HARDENING: Safety First. Clear the position's resting SL/TP
             * before closing, or a resting stop can fight the market order.
             *
             * Carries the flash close's own authorisation: `cancel-all`
             * confirms by default, and without this the gate refuses a cleanup
             * the user already agreed to when they confirmed the close. The
             * refusal is caught below, so the symptom would have been silent —
             * the position closes with its stops still resting.
             */
            try {
                await this.cancelAllOrders(symbol, true, {
                    action: "flash-close-position",
                    confirmedAt,
                });
            } catch (cancelError) {
                logger.error("market", `[FlashClose] CRITICAL: Failed to cancel open orders for ${symbol}. Proceeding with close.`, cancelError);
            }

            const result = await this.gatedRequest(intent);

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

        const result = await this.gatedRequest({
            kind: "open",
            endpoint: "/api/orders",
            payload,
            origin: params.origin,
            displayed: {
                symbol: params.symbol,
                side: params.side,
                ...params.displayed,
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

        // The settlement asset's free balance. This only carries the reading —
        // the refusal decision lives in `checkMargin` (orderGate.ts), which
        // refuses the add when the balance has not loaded, since margin is
        // its only ceiling (BUG-0511). Paper accounts hydrate the same
        // channel from the simulated balance.
        const availableMargin = accountState.assets.find(
            (a) => a.currency === "USDT",
        )?.available;

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
        accountState.hydratePositions(data.positions);
        if (provider !== "bitunix") this.mirrorPositionsToOms(data.positions);
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

        const qty = params.qty !== undefined ? formatApiNum(params.qty) : liveOrder.amount;
        const price = params.price !== undefined ? formatApiNum(params.price) : (liveOrder.price || undefined);
        const entryPrice = params.price !== undefined
            ? new Decimal(params.price)
            : liveOrder.price
              ? new Decimal(liveOrder.price)
              : undefined;

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

        // The displayed side of a modify is what the caller asked for, before
        // formatApiNum() touched it. Comparing the formatted payload back
        // against the raw request is what catches a serialisation defect —
        // the exact failure mode that produced the float bug in the order
        // payload and the `response.json()`-corrupted order IDs.
        return await this.gatedRequest({
            kind: "modify",
            endpoint: "/api/orders",
            payload,
            displayed: {
                symbol: typeof symbol === "string" ? symbol : undefined,
                orderId: params.orderId,
                entryPrice,
                positionSide: liveOrder.side,
                stopLossPrice: params.slPrice !== undefined ? new Decimal(params.slPrice) : undefined,
                takeProfits: params.tpPrice !== undefined ? [new Decimal(params.tpPrice)] : undefined,
                // The quantity the caller asked for, or the live order read
                // this request was merged with — the gate compares the
                // payload back against it (BUG-0505).
                modifyQuantity: params.qty !== undefined ? new Decimal(params.qty) : new Decimal(liveOrder.amount),
            },
        });
    }

    public async fetchTpSlOrders(view: "pending" | "history" = "pending"): Promise<TpSlOrder[]> {
        const provider = settingsState.apiProvider || "bitunix";
        const keys = keysForActiveAccount(settingsState.accounts, settingsState.activeAccountId, provider);
        /*
         * Credentials are what a *venue* needs, and this read goes through
         * `signedRequest`, which answers from the simulator in paper mode
         * without touching the network (FEAT-0327).
         *
         * Not a mode branch: the request built below is identical either way.
         * This only stops the guard from refusing, before the seam is even
         * reached, a read that needs no credentials — which is what told
         * `orderPlacementService` that every simulated entry's stop was
         * missing, and reported a protected position as unprotected.
         */
        if (!paperState.enabled && (!keys?.key || !keys?.secret)) {
             throw new Error("dashboard.alerts.noApiKeys");
        }

        if (provider === "bitunix") {
             const symbolsToFetch = new Set<string>();
             // Add current active symbol
             if (tradeState.symbol) symbolsToFetch.add(tradeState.symbol);
             // Add all symbols with open positions
             const positions = omsService.getPositions();
             positions.forEach(p => symbolsToFetch.add(p.symbol));

             const fetchList = symbolsToFetch.size > 0 ? Array.from(symbolsToFetch) : [undefined];
             const results: TpSlOrder[] = [];

             // Rate limit handling: Batch requests (max 5 concurrent)
             const BATCH_SIZE = 5;
             for (let i = 0; i < fetchList.length; i += BATCH_SIZE) {
                  const batch = fetchList.slice(i, i + BATCH_SIZE);
                  await Promise.all(
                      batch.map(async (sym) => {
                          try {
                              const params: Record<string, unknown> = {};
                              if (sym) params.symbol = sym;

                              const data = await this.signedRequest<Record<string, unknown>>(
                                  "/api/tpsl",
                                  { exchange: "bitunix", action: view, params },
                                  undefined,
                                  buildTpslReadQueryParams(params),
                              ).catch((e): Record<string, unknown> => {
                                  // Preserve rawMessage for classification if available
                                  const errMsg = (e instanceof BitunixApiError && e.rawMessage) ? e.rawMessage : (e instanceof Error ? e.message : String(e));
                                  return { error: errMsg };
                              }); // Hardened

                              if (data.error) {
                                  if (!String(data.error).includes("code: 2")) { // Symbol not found
                                      logger.warn("market", `TP/SL fetch warning for ${sym}: ${data.error}`);
                                  }
                                  return;
                              }
                              // BUG-0292: a Bitunix row carries both legs and
                              // names neither, so it has to be split into the
                              // one-plan-per-leg shape the store groups by.
                              // Pushing the raw rows through is what made
                              // `plansFor()` answer "no stop" for every
                              // position that had one.
                              const res = (Array.isArray(data) ? data : data.rows || []) as unknown[];
                              results.push(...normalizeTpSlRows(res));
                          } catch (e: unknown) {
                              logger.warn("market", `TP/SL network error for ${sym}`, e);
                          }
                      })
                  );
             }

             // Deduplicate
             const uniqueOrders = new Map<string, TpSlOrder>();
             results.forEach((o) => {
                 // `orderId` first, deliberately (BUG-0292): after the split it
                 // is the *leg* id, and the two legs of one row share the row's
                 // `id`. Keying on `id` would collapse a take-profit and its
                 // stop into one entry and drop whichever arrived first.
                 const id = o.orderId || o.id || o.planId;
                 if (id) uniqueOrders.set(String(id), o);
             });
             const final = Array.from(uniqueOrders.values());
             // Sort by time (newest first)
             final.sort((a: TpSlOrder, b: TpSlOrder) => (b.ctime || b.createTime || 0) - (a.ctime || a.createTime || 0));
             return final;
        } else {
             // Generic provider — live-Bitget never arrives here: its adapter
             // gates this read on SUPPORTS.tpSl (false) and resolves empty, so
             // no Bitunix-only envelope is ever signed with Bitget keys outside
             // paper mode, where the seam below answers simulated.
             const data = await this.signedRequest<Record<string, unknown>>(
                  "/api/tpsl",
                  { action: view },
                  undefined,
                  buildTpslReadQueryParams({}),
             );
             const list = (Array.isArray(data) ? data : data.rows || []) as TpSlOrder[];
             list.sort((a: TpSlOrder, b: TpSlOrder) => (b.ctime || b.createTime || 0) - (a.ctime || a.createTime || 0));
             return list;
    }
    }

    public async cancelTpSlOrder(order: TpSlOrder) {
        // `/api/tpsl` nests the order fields under `params`; the gate reads
        // symbol/orderId off the top level, so they are mirrored there. The
        // route ignores the extra keys.
        //
        // `sourceOrderId` first (BUG-0292): `orderId` on a normalised plan is
        // the leg id this app invented ("123-tp"), which the venue has never
        // heard of. The row id it was split from is the one that cancels
        // something. Falls back to `orderId` for plans that were never split —
        // the generic non-Bitunix path produces those.
        const orderId = order.sourceOrderId || order.orderId || order.id;
        return this.gatedRequest({
            kind: "cancel",
            endpoint: "/api/tpsl",
            payload: {
                exchange: "bitunix",
                action: "cancel",
                symbol: order.symbol,
                orderId,
                params: {
                    orderId,
                    symbol: order.symbol,
                    planType: order.planType,
                },
            },
            displayed: { symbol: order.symbol, orderId },
        });
    }

    /**
     * Modifies one leg of an existing TP/SL order (BUG-0293).
     *
     * `POST /tpsl/modify_order` reads `tpPrice`/`slPrice` (at least one),
     * each with its own stop type, order type/price and quantity — the same
     * per-leg shape `placeTpSlOrder` sends, not a `planType`+`triggerPrice`
     * switch. It has no `symbol` parameter either; the order is identified by
     * `orderId` alone. This used to build a wire body the endpoint does not
     * document — `{orderId, symbol, planType, triggerPrice, qty}` — which
     * every call since it shipped sent, and which the venue's own "at least
     * one of tpPrice/slPrice" rule would reject.
     */
    public async modifyTpSlOrder(params: {
        orderId: string,
        symbol: string,
        planType: "PROFIT" | "LOSS",
        triggerPrice: string,
        qty?: string,
        stopType?: "LAST_PRICE" | "MARK_PRICE",
        context?: { side: "long" | "short"; entryPrice: Decimal },
        tickSize?: Decimal,
    }) {
        const wire: Record<string, unknown> = { orderId: params.orderId };
        if (params.planType === "PROFIT") {
            wire.tpPrice = params.triggerPrice;
            wire.tpStopType = params.stopType ?? "MARK_PRICE";
            if (params.qty !== undefined) wire.tpQty = params.qty;
        } else {
            wire.slPrice = params.triggerPrice;
            wire.slStopType = params.stopType ?? "MARK_PRICE";
            if (params.qty !== undefined) wire.slQty = params.qty;
        }

        return this.gatedRequest({
            kind: "modify",
            endpoint: "/api/tpsl",
            payload: {
                exchange: "bitunix",
                action: "modify",
                symbol: params.symbol,
                orderId: params.orderId,
                params: wire,
            },
            displayed: {
                symbol: params.symbol,
                orderId: params.orderId,
                positionSide: params.context?.side.toUpperCase(),
                entryPrice: params.context?.entryPrice,
                tickSize: params.tickSize,
                // A PROFIT plan's trigger is a take-profit level, a LOSS
                // plan's is a stop — same field on the wire, different
                // meaning, and each has to land in the slot the gate checks.
                takeProfits: params.planType === "PROFIT" ? [new Decimal(params.triggerPrice)] : undefined,
                stopLossPrice: params.planType === "LOSS" ? new Decimal(params.triggerPrice) : undefined,
                // The quantity travels on the same leg it prices; the gate
                // compares it back against this (BUG-0505).
                takeProfitQty: params.planType === "PROFIT" && params.qty !== undefined ? new Decimal(params.qty) : undefined,
                stopLossQty: params.planType === "LOSS" && params.qty !== undefined ? new Decimal(params.qty) : undefined,
            },
            priceFields: {
                stopLoss: "params.slPrice",
                takeProfit: "params.tpPrice",
            },
            qtyFields: {
                takeProfit: "params.tpQty",
                takeProfitOrderType: "params.tpOrderType",
                stopLoss: "params.slQty",
                stopLossOrderType: "params.slOrderType",
            },
        });
    }

    /**
     * Creates the one position-wide TP/SL plan a position may carry
     * (FEAT-0070).
     *
     * Distinct from `placeTpSlOrder` below in what it protects: this plan
     * tracks the position's size, so a position that grows or shrinks stays
     * covered, and it closes at market. Bitunix allows exactly one per
     * position — a second create is refused there, which is why the caller
     * offers edit instead when one already exists.
     *
     * `kind: "modify"` rather than `"open"`: setting a stop reduces exposure
     * and must keep working while the kill switch is engaged, which is what
     * its own refusal message promises ("adjusting stops still work").
     */
    public async placePositionTpSl(params: {
        symbol: string,
        positionId: string,
        takeProfit?: { price: Decimal, stopType?: "LAST_PRICE" | "MARK_PRICE" },
        stopLoss?: { price: Decimal, stopType?: "LAST_PRICE" | "MARK_PRICE" },
        context?: { side: "long" | "short"; entryPrice: Decimal },
        tickSize?: Decimal,
    }) {
        if (!params.takeProfit && !params.stopLoss) {
            throw new Error("apiErrors.tpslNoLeg");
        }

        const wire: Record<string, unknown> = {
            symbol: params.symbol,
            positionId: params.positionId,
        };
        if (params.takeProfit) {
            wire.tpPrice = formatApiNum(params.takeProfit.price);
            wire.tpStopType = params.takeProfit.stopType ?? "MARK_PRICE";
        }
        if (params.stopLoss) {
            wire.slPrice = formatApiNum(params.stopLoss.price);
            wire.slStopType = params.stopLoss.stopType ?? "MARK_PRICE";
        }

        return this.gatedRequest({
            kind: "modify",
            endpoint: "/api/tpsl",
            payload: {
                exchange: "bitunix",
                action: "place-position",
                symbol: params.symbol,
                params: wire,
            },
            displayed: {
                symbol: params.symbol,
                positionId: params.positionId,
                positionSide: params.context?.side.toUpperCase(),
                entryPrice: params.context?.entryPrice,
                tickSize: params.tickSize,
                takeProfits: params.takeProfit ? [params.takeProfit.price] : undefined,
                stopLossPrice: params.stopLoss?.price,
            },
            priceFields: {
                takeProfit: "params.tpPrice",
                stopLoss: "params.slPrice",
            },
        });
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
    public async placeTpSlOrder(params: {
        symbol: string,
        positionId: string,
        takeProfit?: {
            price: Decimal,
            qty: Decimal,
            stopType?: "LAST_PRICE" | "MARK_PRICE",
            orderType?: "LIMIT" | "MARKET",
            orderPrice?: Decimal,
        },
        stopLoss?: {
            price: Decimal,
            qty: Decimal,
            stopType?: "LAST_PRICE" | "MARK_PRICE",
            orderType?: "LIMIT" | "MARKET",
            orderPrice?: Decimal,
        },
        context?: { side: "long" | "short"; entryPrice: Decimal },
        tickSize?: Decimal,
    }) {
        if (!params.takeProfit && !params.stopLoss) {
            throw new Error("apiErrors.tpslNoLeg");
        }

        const wire: Record<string, unknown> = {
            symbol: params.symbol,
            positionId: params.positionId,
        };
        if (params.takeProfit) {
            wire.tpPrice = formatApiNum(params.takeProfit.price);
            wire.tpQty = formatApiNum(params.takeProfit.qty);
            wire.tpStopType = params.takeProfit.stopType ?? "MARK_PRICE";
            wire.tpOrderType = params.takeProfit.orderType ?? "MARKET";
            if (params.takeProfit.orderPrice !== undefined) {
                wire.tpOrderPrice = formatApiNum(params.takeProfit.orderPrice);
            }
        }
        if (params.stopLoss) {
            wire.slPrice = formatApiNum(params.stopLoss.price);
            wire.slQty = formatApiNum(params.stopLoss.qty);
            wire.slStopType = params.stopLoss.stopType ?? "MARK_PRICE";
            wire.slOrderType = params.stopLoss.orderType ?? "MARKET";
            if (params.stopLoss.orderPrice !== undefined) {
                wire.slOrderPrice = formatApiNum(params.stopLoss.orderPrice);
            }
        }

        return this.gatedRequest({
            kind: "modify",
            endpoint: "/api/tpsl",
            payload: {
                exchange: "bitunix",
                action: "place",
                symbol: params.symbol,
                params: wire,
            },
            displayed: {
                symbol: params.symbol,
                positionId: params.positionId,
                positionSide: params.context?.side.toUpperCase(),
                entryPrice: params.context?.entryPrice,
                tickSize: params.tickSize,
                takeProfits: params.takeProfit ? [params.takeProfit.price] : undefined,
                stopLossPrice: params.stopLoss?.price,
                // Fixed-quantity legs, compared back against the wire the
                // same way prices are (BUG-0505).
                takeProfitQty: params.takeProfit?.qty,
                stopLossQty: params.stopLoss?.qty,
            },
            priceFields: {
                takeProfit: "params.tpPrice",
                stopLoss: "params.slPrice",
            },
            qtyFields: {
                takeProfit: "params.tpQty",
                takeProfitOrderType: "params.tpOrderType",
                stopLoss: "params.slQty",
                stopLossOrderType: "params.slOrderType",
            },
        });
    }
}

export const tradeService = new TradeService();
