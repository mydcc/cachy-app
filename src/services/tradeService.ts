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
import { settingsState } from "../stores/settings.svelte";
import { marketState } from "../stores/market.svelte";
import { tradeState } from "../stores/trade.svelte";
import { effectsState } from "../stores/effects.svelte";
import { safeJsonParse } from "../utils/safeJson";
import {
    PositionRawSchema,
    BitunixLeverageMarginModeSchema,
    BitunixTradingPairResponseSchema,
    BitunixPositionTierResponseSchema,
} from "../types/apiSchemas";
import type { OMSOrderSide } from "./omsTypes";
import type { NormalizedOrder } from "../types/exchange";
import { appFetch } from "../lib/appAuth";
import { paperState } from "../stores/paperTrading.svelte";
import { paperExchange } from "./paperExchange";
import { capabilitiesOf } from "./exchangeCapabilities";
import { unwrapApiEnvelope, formatApiNum } from "../utils/utils";
import { normalizeTpSlRows } from "./tpslNormalize";
import { accountState } from "../stores/account.svelte";
import { keysForActiveAccount } from "../stores/settings/accounts";
import { accountSession } from "./accountSession.svelte";
import {
    orderGate,
    assertGatePass,
    accountFingerprint,
    translateRefusal,
    OrderRefusedError,
    type GatePass,
    type DisplayedState,
    type OrderIntent,
} from "./orderGate";

export interface TpSlOrder {
    orderId: string;
    symbol: string;
    planType: "PROFIT" | "LOSS";
    triggerPrice: string;
    qty?: string;
    status: string;
    ctime?: number;
    createTime?: number;
    id?: string;
    planId?: string;
    // Hardened types
    side?: string;
    price?: string;
    executePrice?: string;
    clientOrderId?: string;
    reduceOnly?: boolean;
    workingType?: string;
    timeInForce?: string;
    /**
     * The id of the venue row this leg was split out of (BUG-0292).
     *
     * `orderId` above is a *leg* id — `${sourceOrderId}-tp` or `-sl` — because
     * one Bitunix row carries both legs and the rest of the app models one
     * plan per leg. Anything addressing the venue (cancel, modify) must use
     * this, not `orderId`, or it names a plan the exchange has never heard of.
     */
    sourceOrderId?: string;
    /**
     * Whether this plan looks position-wide or partial, **inferred** from
     * whether its leg named a quantity. The response carries no field saying
     * which it is; see BUG-0292. Safe to show, not safe to place an order on.
     */
    scopeGuess?: "position" | "partial";
    [key: string]: unknown; // Safer than any
}

export class BitunixApiError extends Error {
    /** Raw API message for internal classification (not for display) */
    public rawMessage: string;
    constructor(public code: number | string, message?: string, rawMessage?: string) {
        super(message || `Bitunix API Error ${code}`);
        this.name = "BitunixApiError";
        this.rawMessage = rawMessage || message || "";
    }
}

/**
 * One entry submission. Extracted from `placeOrder`'s inline parameter object
 * in FEAT-0016 so the adapter's `TradingPort` can name the same shape rather
 * than restate it — two copies of an order payload's type is how the two
 * drift.
 */
export interface PlaceOrderParams {
    symbol: string;
    side: "BUY" | "SELL";
    orderType?: "LIMIT" | "MARKET";
    qty: Decimal | string;
    price?: Decimal | string;
    /** Time in force. Ignored for market orders — see the route. */
    effect?: "GTC" | "IOC" | "FOK" | "POST_ONLY";
    /** Pass the previous attempt's id to retry it idempotently. */
    clientId?: string;
    reduceOnly?: boolean;
    tradeSide?: "OPEN" | "CLOSE";
    positionId?: string;
    takeProfit?: {
        price: Decimal | string;
        stopType?: "MARK_PRICE" | "LAST_PRICE";
        orderType?: "LIMIT" | "MARKET";
        orderPrice?: Decimal | string;
    };
    stopLoss?: {
        price: Decimal | string;
        stopType?: "MARK_PRICE" | "LAST_PRICE";
        orderType?: "LIMIT" | "MARKET";
        orderPrice?: Decimal | string;
    };
    /**
     * What the UI showed when the user confirmed. The gate compares the
     * payload against this rather than against the values it was built
     * from — see FEAT-0011.
     */
    displayed: {
        accountSize: Decimal;
        riskPercentage: Decimal;
        entryPrice: Decimal;
        stopLossPrice: Decimal;
        takeProfits?: Decimal[];
        leverage?: Decimal;
        marginMode?: string;
        accountStateAt?: number;
        stepSize?: Decimal;
    };
}

export interface ModifyOrderParams {
    orderId?: string;
    clientId?: string;
    symbol?: string;
    qty?: string | Decimal | number;
    price?: string | Decimal | number;
    tpPrice?: string | Decimal | number;
    tpStopType?: string;
    tpOrderType?: string;
    tpOrderPrice?: string | Decimal | number;
    slPrice?: string | Decimal | number;
    slStopType?: string;
    slOrderType?: string;
    slOrderPrice?: string | Decimal | number;
}

export const TRADE_ERRORS = {
    POSITION_NOT_FOUND: "tradeErrors.positionNotFound",
    ORDER_NOT_FOUND: "tradeErrors.orderNotFound",
    FETCH_FAILED: "trade.fetchFailed",
    CLOSE_ALL_FAILED: "trade.closeAllFailed"
};

export class TradeError extends Error {
    constructor(message: string, public code: string, public details?: unknown) {
        super(message);
        this.name = "TradeError";
    }
}

/**
 * An intent as a call site states it: everything except the account fields,
 * which `completeIntent` fills in from the active session.
 */
type PartialIntent = Omit<OrderIntent, "displayed"> & {
    displayed: Omit<DisplayedState, "provider" | "accountFingerprint" | "paperMode">;
};

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
        method: string,
        endpoint: string,
        payload: Record<string, unknown>,
        pass?: GatePass
    ): Promise<T> {
        // Implementation for real app (simplified)
        // In test this is mocked
        const provider = settingsState.apiProvider;
        const keys = keysForActiveAccount(settingsState.accounts, settingsState.activeAccountId, provider);

        // Re-read of the account the request will actually be signed with,
        // compared against the account the gate approved. Settings can change
        // between the click and the send; this is where that is caught.
        assertGatePass(
            {
                endpoint,
                payload,
                provider,
                accountFingerprint: accountFingerprint(keys?.key),
                accountId: settingsState.activeAccountId,
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

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Provider": provider,
            "X-Api-Key": keys.key,
            "X-Api-Secret": keys.secret,
            ...(keys.passphrase ? { "X-Api-Passphrase": keys.passphrase } : {})
        };

        // Every guarded route's Zod schema requires `exchange` in the body
        // (there is no header fallback for it, only for the credentials
        // above) — inject it here once rather than relying on every call
        // site to remember it. Callers that already set it (none currently
        // do) win, since they're spread after.
        const payloadWithExchange = { exchange: provider, ...payload };

        // Deep serialize Decimals to strings before JSON.stringify
        const serializedPayload = this.serializePayload(payloadWithExchange);

        const response = await appFetch(endpoint, {
            method,
            headers,
            body: JSON.stringify(serializedPayload)
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
        const session = accountSession.current();

        try {
            const response = await appFetch("/api/leverage-margin-mode", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Api-Key": keys.key,
                    "X-Api-Secret": keys.secret,
                    ...(keys.passphrase ? { "X-Api-Passphrase": keys.passphrase } : {}),
                },
                body: JSON.stringify({
                    exchange: provider,
                    symbol,
                }),
            });
            const json = await response.json();
            const { data } = unwrapApiEnvelope<Record<string, unknown>>(json);
            if (!data) return;

            const validation = BitunixLeverageMarginModeSchema.safeParse(data);
            if (!validation.success) {
                logger.error("network", "[TradeService] Invalid leverage/margin-mode response", validation.error.issues);
                return;
            }
            if (!accountSession.isCurrent(session)) return;

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

        const response = await appFetch("/api/account-settings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Provider": provider,
                "X-Api-Key": keys.key,
                "X-Api-Secret": keys.secret,
                ...(keys.passphrase ? { "X-Api-Passphrase": keys.passphrase } : {}),
            },
            body: JSON.stringify({ exchange: provider, ...payload }),
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
        await this.fetchLeverageMarginMode(symbol);
    }

    /**
     * Position mode for the whole futures account (FEAT-0068) — ONE_WAY or
     * HEDGE. Takes no symbol: the endpoint does not.
     *
     * Re-synced through `accountState.requestSync()` rather than a targeted
     * read, because the mode is reported on the account and on every
     * position, and both views have to stop disagreeing.
     */
    public async changePositionMode(positionMode: "ONE_WAY" | "HEDGE"): Promise<void> {
        await this.accountSettingRequest({ type: "change-position-mode", positionMode });
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
    // a symbol (market/trading_pairs). Public endpoint, no credentials.
    public async fetchTradingPairInfo(symbol: string): Promise<void> {
        try {
            const response = await appFetch(`/api/trading-pairs?symbols=${encodeURIComponent(symbol)}`);
            if (!response.ok) return;
            const json = await response.json();

            const validation = BitunixTradingPairResponseSchema.safeParse(json);
            if (!validation.success) {
                logger.error("network", "[TradeService] Invalid trading-pairs response", validation.error.issues);
                return;
            }
            const entry = validation.data.data?.[0];
            if (!entry) return;

            marketState.setSymbolMeta(symbol, {
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
        } catch (e) {
            logger.debug("api", "[TradeService] fetchTradingPairInfo failed", e);
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
        return {
            provider,
            accountFingerprint: accountFingerprint(
                keysForActiveAccount(
                    settingsState.accounts,
                    settingsState.activeAccountId,
                    provider,
                ).key,
            ),
            // FEAT-0026. Be honest about what this is: a second *field*, not
            // yet a second *derivation* — both this and the transmit-time
            // read still come from `settingsState`. It is nonetheless a
            // strict improvement, because it catches an account switch that
            // leaves the key string unchanged, which the fingerprint cannot
            // see. Sourcing one of the two roots from what the user was
            // actually shown is the account chip's job, in the PR that adds
            // it.
            accountId: settingsState.activeAccountId,
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
        return {
            ...intent,
            displayed: { ...this.displayedAccount(), ...intent.displayed },
        };
    }

    private async gatedRequest<T>(intent: PartialIntent, method = "POST"): Promise<T> {
        const full = this.completeIntent(intent);
        const result = await orderGate.submit<T>(full, (pass) =>
            this.signedRequest<T>(method, full.endpoint, full.payload, pass),
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
                await this.fetchOpenPositionsFromApi();
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
                await this.fetchOpenPositionsFromApi();
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
                        await RetryPolicy.execute(() => this.fetchOpenPositionsFromApi(), {
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

            const pendingResponse = await appFetch("/api/sync/positions-pending", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Api-Key": keys.key,
                    "X-Api-Secret": keys.secret
                },
                body: JSON.stringify({}),
            });

            if (!pendingResponse.ok) throw new Error(TRADE_ERRORS.FETCH_FAILED);

            const pendingText = await pendingResponse.text();
            const pendingResult = safeJsonParse(pendingText);
            if (pendingResult.error) throw new TradeError(pendingResult.error, "trade.apiError");

            // Hardening: Best Effort Processing
            // Instead of failing the entire batch via PositionListSchema, we validate per item.
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
            ? (marketState?.symbolMeta?.[params.symbol] ??
               marketState?.symbolMeta?.[normalizeSymbol(params.symbol, "bitunix")])
            : undefined;

        // formatApiNum everywhere: a price serialised as "1e-7" is rejected
        // by the exchange, and a native float here would undo the precision
        // the calculator spent effort producing.
        const payload: Record<string, unknown> = {
            type: "place-order",
            symbol: params.symbol,
            side: params.side,
            orderType,
            qty: formatApiNum(params.qty),
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

        const stepSize =
            params.displayed.stepSize ??
            (meta?.basePrecision !== undefined
                ? new Decimal(10).pow(-meta.basePrecision)
                : undefined);

        const result = await this.gatedRequest({
            kind: "open",
            endpoint: "/api/orders",
            payload,
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

        // Metadata is best-effort: an instrument whose meta has not loaded
        // yields no step, and the gate then checks what it can rather than
        // refusing on an absence.
        const meta =
            marketState?.symbolMeta?.[symbol] ??
            marketState?.symbolMeta?.[normalizeSymbol(symbol, "bitunix")];
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
                positionId,
            },
        });
    }

    public async closeAllPositions(symbol?: string) {
        logger.log("market", `[CloseAll] Closing all positions${symbol ? ` for ${symbol}` : ""}`);
        try {
            const provider = settingsState.apiProvider || "bitunix";
            if (provider === "bitunix") {
                return await this.gatedRequest({
                    kind: "bulk",
                    endpoint: "/api/orders",
                    payload: {
                        type: "close-all-positions",
                        symbol: symbol || undefined,
                    },
                    displayed: symbol ? { symbol } : {},
                });
            }

            // Fallback for non-Bitunix providers
            const positions = omsService.getPositions();
            const toClose = symbol ? positions.filter(p => p.symbol === symbol) : positions;
            const promises = toClose.map(p => this.closePosition({ symbol: p.symbol, positionSide: p.side, forceFullClose: true }));
            const results = await Promise.allSettled(promises);

            const failures = results.filter(r => r.status === "rejected");
            if (failures.length > 0) {
                const failedSymbols = results.map((r, i) => r.status === "rejected" ? (toClose[i]?.symbol ?? `position[${i}]`) : null).filter(Boolean).join(", ");
                logger.error("market", `[CloseAll] Failed to close ${failures.length} positions: ${failedSymbols}`);
                toastService.error(get(_)("trade.closeAllFailed" as import("../locales/schema").TranslationKey, { values: { failedSymbols } }));
                throw new Error(TRADE_ERRORS.CLOSE_ALL_FAILED);
            }

            return results;
        } catch (e: unknown) {
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
        return await this.signedRequest<NormalizedOrder>("POST", "/api/orders", {
            type: "order-detail",
            orderId,
            clientId,
        });
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
                entryPrice: params.price !== undefined ? new Decimal(params.price) : undefined,
                stopLossPrice: params.slPrice !== undefined ? new Decimal(params.slPrice) : undefined,
                takeProfits: params.tpPrice !== undefined ? [new Decimal(params.tpPrice)] : undefined,
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

                              const data = await this.signedRequest<Record<string, unknown>>("POST", "/api/tpsl", {
                                  exchange: "bitunix",
                                  action: view,
                                  params
                              }).catch((e): Record<string, unknown> => {
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
             // Generic provider
             const data = await this.signedRequest<Record<string, unknown>>("POST", "/api/tpsl", {
                  action: view
             });
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
                // A PROFIT plan's trigger is a take-profit level, a LOSS
                // plan's is a stop — same field on the wire, different
                // meaning, and each has to land in the slot the gate checks.
                takeProfits: params.planType === "PROFIT" ? [new Decimal(params.triggerPrice)] : undefined,
                stopLossPrice: params.planType === "LOSS" ? new Decimal(params.triggerPrice) : undefined,
            },
            priceFields: {
                stopLoss: "params.slPrice",
                takeProfit: "params.tpPrice",
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
                takeProfits: params.takeProfit ? [params.takeProfit.price] : undefined,
                stopLossPrice: params.stopLoss?.price,
            },
            priceFields: {
                takeProfit: "params.tpPrice",
                stopLoss: "params.slPrice",
            },
        });
    }
}

export const tradeService = new TradeService();
