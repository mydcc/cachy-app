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

import Decimal from "decimal.js";
import { omsService } from "./omsService";
import { logger } from "./logger";
import { RetryPolicy } from "../utils/retryPolicy";
import { mapToOMSPosition } from "./mappers";
import { settingsState } from "../stores/settings.svelte";
import { marketState } from "../stores/market.svelte";
import { tradeState } from "../stores/trade.svelte";
import { safeJsonParse } from "../utils/safeJson";
import { generateUUID } from "../utils/utils";
import { PositionRawSchema, type PositionRaw, TpSlOrderSchema, type TpSlOrderZod } from "../types/apiSchemas";
import type { OMSOrderSide } from "./omsTypes";

// Use the Zod type definition
export type TpSlOrder = TpSlOrderZod;

export class BitunixApiError extends Error {
    constructor(public code: number | string, message?: string) {
        super(message || `apiErrors.bitunixApiError`); // Code accessible via .code
        this.name = "BitunixApiError";
    }
}

export const TRADE_ERRORS = {
    POSITION_NOT_FOUND: "tradeErrors.positionNotFound",
    FETCH_FAILED: "tradeErrors.fetchFailed",
    CLOSE_ALL_FAILED: "tradeErrors.closeAllFailed"
};

export class TradeError extends Error {
    constructor(message: string, public code: string, public details?: any) {
        super(message);
        this.name = "TradeError";
    }
}

class TradeService {
    // Helper to sign and send requests to backend
    // Test mocks this
    public async signedRequest<T>(
        method: string,
        endpoint: string,
        payload: Record<string, any>
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
            "X-Provider": provider, ...(settingsState.appAccessToken ? { "x-app-access-token": settingsState.appAccessToken } : {})
        };

        // Deep serialize Decimals to strings before JSON.stringify
        const serializedPayload = this.serializePayload(payload);

        const response = await fetch(endpoint, {
            method,
            headers,
            body: JSON.stringify({
                ...serializedPayload,
                // Ensure keys are sent to backend for signing/execution
                apiKey: keys.key,
                apiSecret: keys.secret,
                passphrase: keys.passphrase
            })
        });

        const text = await response.text();
        let data: any = {};
        try {
            data = safeJsonParse(text);
        } catch (e) {
            // If response is not JSON (e.g. 502 Bad Gateway HTML, or 429 plain text)
            // use the status code as the error code
            if (!response.ok) {
                 throw new BitunixApiError(response.status, text || response.statusText);
            }
        }

        // Loose check for "code" != 0 (Bitunix style)
        // We cast to string to handle both number 0 and string "0"
        if (!response.ok || (data.code !== undefined && String(data.code) !== "0")) {
            throw new BitunixApiError(data.code || response.status || -1, data.msg || data.error || "apiErrors.unknown");
        }

        return data;
    }

    // Helper to safely serialize Decimals to strings
    private serializePayload(payload: any, depth = 0, seen = new WeakSet()): any {
        if (depth > 20) {
            logger.warn("market", "[TradeService] Serialization depth limit exceeded");
            return "[Serialization Limit]";
        }

        if (!payload) return payload;
        if (payload instanceof Decimal) return payload.toString();

        // Strict Decimal check
        if (payload instanceof Decimal || (typeof payload === 'object' && payload !== null && (payload.constructor?.name === 'Decimal' || Decimal.isDecimal(payload)))) {
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
            const newObj: any = {};
            for (const key in payload) {
                if (Object.prototype.hasOwnProperty.call(payload, key)) {
                    newObj[key] = this.serializePayload(payload[key], depth + 1, seen);
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

        if (position && position.lastUpdated && (now - position.lastUpdated > MAX_POS_AGE_MS)) {
             logger.warn("market", `[Freshness] Position stale (${now - position.lastUpdated}ms). Forcing refresh.`);
             try {
                await this.fetchOpenPositionsFromApi();
                positions = omsService.getPositions();
                position = positions.find(
                    (p) => p.symbol === symbol && p.side === positionSide
                );
             } catch (e) {
                logger.error("market", `[Freshness] Stale refresh failed`, e);
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
            }
        }

        return position;
    }

    public async flashClosePosition(symbol: string, positionSide: "long" | "short") {
        // 1. Get fresh position
        const position = await this.ensurePositionFreshness(symbol, positionSide);

        if (!position) {
            logger.error("market", `[FlashClose] Position definitely not found: ${symbol} ${positionSide}`);
            throw new Error("tradeErrors.positionNotFound");
        }

        // 2. Execute Close
        // Close Long -> Sell
        // Close Short -> Buy
        const side: OMSOrderSide = positionSide === "long" ? "sell" : "buy";
        const apiSide = side === "sell" ? "SELL" : "BUY";

        // CRITICAL: Use exact amount from OMS
        if (!position.amount || position.amount.isZero() || position.amount.isNegative()) {
            logger.error("market", `[FlashClose] Invalid position amount: ${position.amount}`, position);
            throw new Error("apiErrors.invalidAmount");
        }

        const qty = position.amount.toString();

        logger.log("market", `[FlashClose] Closing ${symbol} ${positionSide} (${qty})`);

        // Retrieve current market price for optimistic UI feedback
        // Fallback to 0 if not available, but usually MarketWatcher ensures it is.
        const currentPrice = marketState.data[symbol]?.lastPrice || new Decimal(0);

        // OPTIMISTIC UPDATE
        const clientOrderId = "opt-" + generateUUID();
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

        try {
            // HARDENING: Safety First. Attempt to cancel all open orders (SL/TP) before closing.
            // This prevents "Naked Stop Loss" scenarios where a position is closed but the SL remains.
            try {
                await this.cancelAllOrders(symbol, true);
            } catch (cancelError) {
                // If cancellation fails, we log CRITICAL error but PROCEED with closing.
                // Priority: Capital Preservation (Exit Position) > Clean State (No Naked Orders).
                // In a true emergency (e.g. flash crash), getting out is more important than cleaning up triggers.
                logger.error("market", `[FlashClose] CRITICAL: Failed to cancel open orders for ${symbol}. Proceeding with close to prevent stuck position. Naked orders may remain!`, cancelError);
            }

            return await this.signedRequest("POST", "/api/orders", {
                symbol,
                side: apiSide,
                orderType: "MARKET",
                qty, // String for precision
                reduceOnly: true,
                clientOrderId
            });
        } catch (e: unknown) {
            // HARDENING: Two Generals Problem.
            // If request fails (timeout/network), order might be live.
            // Do NOT remove optimistic order. Instead, keep it visible and force a sync.

            logger.warn("market", `[FlashClose] Request failed. Keeping optimistic order ${clientOrderId} and forcing sync.`, e);

            // HARDENING: Clean up optimistic order if we KNOW it failed (e.g. 4xx error)
            const isTerminalError =
                (e instanceof BitunixApiError) ||
                (e instanceof Error && (
                    e.message.includes("400") ||
                    e.message.includes("401") ||
                    e.message.includes("403") ||
                    (e as any).code === "VALIDATION_ERROR" ||
                    (e as any).status === 400 ||
                    (e as any).status === 401 ||
                    (e as any).status === 403
                ));

            if (isTerminalError) {
                 logger.warn("market", `[FlashClose] Definitive API Failure. Removing optimistic order.`);
                 omsService.removeOrder(clientOrderId);
            } else {
                 // Indeterminate state (Timeout / Network Error)
                 // Mark as unconfirmed
                 const order = omsService.getOrder(clientOrderId);
                 if (order) {
                     order._isUnconfirmed = true;
                     omsService.updateOrder(order);
                 }
            }

            // Trigger background sync with RETRY LOGIC (Backoff)
            (async () => {
                try {
                    await RetryPolicy.execute(() => this.fetchOpenPositionsFromApi(), {
                        maxAttempts: 5,
                        initialDelayMs: 500,
                        maxDelayMs: 5000,
                        name: "FlashClose Recovery Sync"
                    });
                    logger.log("market", `[FlashClose] Recovery sync successful.`);
                } catch (err) {
                    logger.error("market", `[FlashClose] CRITICAL: All recovery sync attempts failed.`, err);
                }
            })();

            throw e;
        }
    }

    // Emergency Fallback to fetch ALL open positions directly from Bitunix/API
    private async fetchOpenPositionsFromApi() {
        if (settingsState.apiProvider !== "bitunix") return; // Only Bitunix supported for now

        try {
            // Re-use the sync endpoint which wraps the signed API call
            const pendingResponse = await fetch("/api/sync/positions-pending", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(settingsState.appAccessToken ? { "x-app-access-token": settingsState.appAccessToken } : {}) },
                body: JSON.stringify({
                    apiKey: settingsState.apiKeys.bitunix.key,
                    apiSecret: settingsState.apiKeys.bitunix.secret,
                }),
            });

            if (!pendingResponse.ok) throw new Error("apiErrors.fetchFailed");

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

            let validCount = 0;
            let errorCount = 0;

            for (const item of rawList) {
                // Per-item validation
                const validation = PositionRawSchema.safeParse(item);

                if (validation.success) {
                    try {
                        // Use centralized mapper
                        omsService.updatePosition(mapToOMSPosition(validation.data));
                        validCount++;
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

    public async cancelAllOrders(symbol: string, throwOnError = false) {
        if (!symbol) return;
        logger.log("market", `[Trade] Cancelling all orders for ${symbol}`);
        try {
             return await this.signedRequest("POST", "/api/orders", {
                symbol,
                type: "cancel-all"
             });
        } catch (e: unknown) {
             logger.warn("market", `[Trade] Failed to cancel orders for ${symbol}`, e);
             if (throwOnError) throw e;
        }
    }

    public async closePosition(params: { symbol: string, positionSide: "long" | "short", amount?: Decimal, forceFullClose?: boolean }) {
        const { symbol, positionSide, amount, forceFullClose } = params;

        // 1. Get fresh position
        const position = await this.ensurePositionFreshness(symbol, positionSide);

        if (!position) {
            throw new Error("tradeErrors.positionNotFound");
        }

        const side = positionSide === "long" ? "SELL" : "BUY";

        // Use explicit amount or full position amount
        // If explicit amount is provided, use it.
        if (!amount && !forceFullClose) {
             logger.error("market", `[ClosePosition] No amount specified and forceFullClose is false. Aborting close for ${symbol} ${positionSide}`);
             throw new Error("tradeErrors.invalidAmount");
        }

        const qty = amount ? amount.toString() : position.amount.toString();

        logger.log("market", `[ClosePosition] Closing ${symbol} ${positionSide} (${qty})`);

        return this.signedRequest("POST", "/api/orders", {
            symbol,
            side,
            orderType: "MARKET",
            qty,
            reduceOnly: true
        });
    }

    public async closeAllPositions() {
        const positions = omsService.getPositions();
        const promises = positions.map(p => this.closePosition({ symbol: p.symbol, positionSide: p.side, forceFullClose: true }));
        const results = await Promise.allSettled(promises);

        const failures = results.filter(r => r.status === "rejected");
        if (failures.length > 0) {
            logger.error("market", `[CloseAll] Failed to close ${failures.length} positions.`);
            throw new Error("apiErrors.generic"); // Or specific bulk error if we had one
        }

        return results;
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
                  const batchResults = await Promise.all(
                      batch.map(async (sym) => {
                          try {
                              const params: any = {};
                              if (sym) params.symbol = sym;

                              const data = await this.signedRequest<any>("POST", "/api/tpsl", {
                                  action: view,
                                  params
                              }).catch(e => ({ error: (e instanceof Error ? e.message : String(e)) })); // Hardened

                              if (data.error) {
                                  if (!String(data.error).includes("code: 2")) { // Symbol not found
                                      logger.warn("market", `TP/SL fetch warning for ${sym}: ${data.error}`);
                                  }
                                  return [];
                              }

                              const rawItems = Array.isArray(data) ? data : (data.rows || []);
                              // Validate items
                              const validItems: TpSlOrder[] = [];
                              for (const item of rawItems) {
                                  const validation = TpSlOrderSchema.safeParse(item);
                                  if (validation.success) {
                                      validItems.push(validation.data);
                                  } else {
                                      logger.warn("market", `Invalid TP/SL item skipped for ${sym}`, { item, error: validation.error });
                                  }
                              }
                              return validItems;
                          } catch (e: unknown) {
                              logger.warn("market", `TP/SL network error for ${sym}`, e);
                              return [];
                          }
                      })
                  );
                  results.push(...batchResults.flat());
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
             const data = await this.signedRequest<any>("POST", "/api/tpsl", {
                  action: view
             });
             const rawItems = Array.isArray(data) ? data : (data.rows || []);
             const validItems: TpSlOrder[] = [];
             for (const item of rawItems) {
                 const validation = TpSlOrderSchema.safeParse(item);
                 if (validation.success) {
                     validItems.push(validation.data);
                 }
             }
             validItems.sort((a: TpSlOrder, b: TpSlOrder) => (b.ctime || b.createTime || 0) - (a.ctime || a.createTime || 0));
             return validItems;
    }
    }

    public async cancelTpSlOrder(order: any) {
        return this.signedRequest("POST", "/api/tpsl", {
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
