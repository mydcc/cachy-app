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
import { safeJsonParse } from "../utils/safeJson";
import {
    PositionRawSchema,
    BitunixLeverageMarginModeSchema,
    BitunixTradingPairResponseSchema,
    BitunixPositionTierResponseSchema,
} from "../types/apiSchemas";
import type { OMSOrderSide } from "./omsTypes";
import type { NormalizedOrder } from "../types/bitunix";
import { appFetch } from "../lib/appAuth";
import { unwrapApiEnvelope, formatApiNum } from "../utils/utils";

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

class TradeService {
    // Hardening: Promise Coalescing to prevent Thundering Herd
    private fetchPositionsPromise: Promise<void> | null = null;

    // Helper to sign and send requests to backend
    // Test mocks this
    public async signedRequest<T>(
        method: string,
        endpoint: string,
        payload: Record<string, unknown>
    ): Promise<T> {
        // Implementation for real app (simplified)
        // In test this is mocked
        const provider = settingsState.apiProvider;
        const keys = settingsState.apiKeys[provider];

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
        const keys = settingsState.apiKeys[provider];
        if (!keys?.key || !keys?.secret) return;

        try {
            const response = await appFetch("/api/leverage-margin-mode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    exchange: provider,
                    apiKey: keys.key,
                    apiSecret: keys.secret,
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
            tradeState.remoteLeverage = new Decimal(validation.data.leverage);
            tradeState.remoteMarginMode = validation.data.marginMode;
        } catch (e) {
            logger.debug("api", "[TradeService] fetchLeverageMarginMode failed", e);
        }
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

    public async flashClosePosition(symbol: string, positionSide: "long" | "short") {
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

            // OPTIMISTIC UPDATE
            clientOrderId = "opt-" + crypto.randomUUID().replace(/-/g, "").slice(0, 28);
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

            // HARDENING: Safety First. Attempt to cancel all open orders (SL/TP) before closing.
            try {
                await this.cancelAllOrders(symbol, true);
            } catch (cancelError) {
                logger.error("market", `[FlashClose] CRITICAL: Failed to cancel open orders for ${symbol}. Proceeding with close.`, cancelError);
            }

            const provider = settingsState.apiProvider || "bitunix";
            let result: unknown;
            if (provider === "bitunix" && position.positionId) {
                result = await this.signedRequest("POST", "/api/orders", {
                    type: "flash-close-position",
                    symbol,
                    positionId: position.positionId,
                });
            } else {
                result = await this.signedRequest("POST", "/api/orders", {
                    type: "place-order",
                    symbol,
                    side: apiSide,
                    orderType: "MARKET",
                    qty,
                    reduceOnly: true,
                    clientOrderId,
                    tradeSide,
                    positionId,
                });
            }

            return { success: true, data: result };

        } catch (e: unknown) {
            // Use rawMessage for display when available (human-readable API text),
            // fall back to e.message for non-API errors (e.g. "tradeErrors.positionNotFound")
            const msg = (e instanceof BitunixApiError && e.rawMessage) ? e.rawMessage : (e instanceof Error ? e.message : String(e));

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
            toastService.error(get(_)("trade.flashCloseFailed" as import("../locales/schema").TranslationKey, { values: { msg } }) || `Flash Close Failed: ${msg}`);

            // Return failure object instead of throwing
            return { success: false, error: msg };
        }
    }

    private async fetchOpenPositionsFromApi() {
        if (settingsState.apiProvider !== "bitunix") return; // Only Bitunix supported for now

        try {
            // W-6: Use generalized provider key lookup instead of hardcoding 'bitunix'
            const provider = settingsState.apiProvider;
            const keys = settingsState.apiKeys[provider];
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
        return await this.signedRequest("POST", "/api/orders", {
            symbol,
            orderId,
            type: "cancel-order"
        });
    }

    public async cancelAllOrders(symbol?: string, throwOnError = false) {
        logger.log("market", `[Trade] Cancelling all orders${symbol ? ` for ${symbol}` : ""}`);
        try {
             return await this.signedRequest("POST", "/api/orders", {
                symbol: symbol || undefined,
                type: "cancel-all"
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

        logger.log("market", `[ClosePosition] Closing ${symbol} ${positionSide} (${qty})`);

        return this.signedRequest("POST", "/api/orders", {
            type: "place-order",
            symbol,
            side,
            orderType: "MARKET",
            qty,
            reduceOnly: true,
            tradeSide,
            positionId,
        });
    }

    public async closeAllPositions(symbol?: string) {
        logger.log("market", `[CloseAll] Closing all positions${symbol ? ` for ${symbol}` : ""}`);
        try {
            const provider = settingsState.apiProvider || "bitunix";
            if (provider === "bitunix") {
                return await this.signedRequest("POST", "/api/orders", {
                    type: "close-all-positions",
                    symbol: symbol || undefined,
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
                toastService.error(get(_)("trade.closeAllFailed" as import("../locales/schema").TranslationKey, { values: { failedSymbols } }) || `Close All Failed for: ${failedSymbols}`);
                throw new Error(TRADE_ERRORS.CLOSE_ALL_FAILED);
            }

            return results;
        } catch (e: unknown) {
            logger.error("market", "[CloseAll] Failed to close all positions", e);
            const failedSymbols = symbol || "all";
            toastService.error(get(_)("trade.closeAllFailed" as import("../locales/schema").TranslationKey, { values: { failedSymbols } }) || `Close All Failed for: ${failedSymbols}`);
            throw new Error(TRADE_ERRORS.CLOSE_ALL_FAILED);
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

        const qty = params.qty !== undefined ? formatApiNum(params.qty) : liveOrder.amount;
        const price = params.price !== undefined ? formatApiNum(params.price) : (liveOrder.price || undefined);
        const symbol = params.symbol || liveOrder.symbol;

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

        return await this.signedRequest("POST", "/api/orders", payload);
    }

    public async fetchTpSlOrders(view: "pending" | "history" = "pending"): Promise<TpSlOrder[]> {
        const provider = settingsState.apiProvider || "bitunix";
        const keys = settingsState.apiKeys[provider];
        if (!keys?.key || !keys?.secret) {
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
                              const res = (Array.isArray(data) ? data : data.rows || []) as TpSlOrder[];
                              results.push(...res);
                          } catch (e: unknown) {
                              logger.warn("market", `TP/SL network error for ${sym}`, e);
                          }
                      })
                  );
             }

             // Deduplicate
             const uniqueOrders = new Map<string, TpSlOrder>();
             results.forEach((o) => {
                 const id = o.id || o.orderId || o.planId;
                 if (id) uniqueOrders.set(id, o);
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
        return this.signedRequest("POST", "/api/tpsl", {
            exchange: "bitunix",
            action: "cancel",
            params: {
                orderId: order.orderId || order.id,
                symbol: order.symbol,
                planType: order.planType,
            },
        });
    }

    public async modifyTpSlOrder(params: {
        orderId: string,
        symbol: string,
        planType: "PROFIT" | "LOSS",
        triggerPrice: string,
        qty?: string
    }) {
        return this.signedRequest("POST", "/api/tpsl", {
            exchange: "bitunix",
            action: "modify",
            params: {
                orderId: params.orderId,
                symbol: params.symbol,
                planType: params.planType,
                triggerPrice: params.triggerPrice,
                qty: params.qty
            },
        });
    }
}

export const tradeService = new TradeService();
