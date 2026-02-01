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
import { mapToOMSPosition } from "./mappers";
import { settingsState } from "../stores/settings.svelte";
import { safeJsonParse } from "../utils/safeJson";
import { PositionRawSchema, type PositionRaw } from "../types/apiSchemas";
import type { OMSOrderSide } from "./omsTypes";

export class BitunixApiError extends Error {
    constructor(public code: number | string, message?: string) {
        super(message || `Bitunix API Error ${code}`);
        this.name = "BitunixApiError";
    }
}

export const TRADE_ERRORS = {
    POSITION_NOT_FOUND: "trade.positionNotFound",
    FETCH_FAILED: "trade.fetchFailed",
    CLOSE_ALL_FAILED: "trade.closeAllFailed"
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
            "X-Provider": provider
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
            throw new BitunixApiError(data.code || response.status || -1, data.msg || data.error || "Unknown API Error");
        }

        return data;
    }

    // Helper to safely serialize Decimals to strings
    private serializePayload(payload: any): any {
        if (!payload) return payload;
        if (payload instanceof Decimal) return payload.toString();

        // Handle generic objects that might be Decimals if constructor name is mangled or instance check fails
        if (typeof payload === 'object' && payload !== null && typeof payload.isZero === 'function' && typeof payload.toFixed === 'function') {
            return payload.toString();
        }

        if (Array.isArray(payload)) {
            return payload.map(item => this.serializePayload(item));
        }

        if (typeof payload === 'object') {
            const newObj: any = {};
            for (const key in payload) {
                if (Object.prototype.hasOwnProperty.call(payload, key)) {
                    newObj[key] = this.serializePayload(payload[key]);
                }
            }
            return newObj;
        }

        return payload;
    }

    public async flashClosePosition(symbol: string, positionSide: "long" | "short") {
        // 1. Get position from OMS (Source of Truth)
        let positions = omsService.getPositions();
        let position = positions.find(
            (p) => p.symbol === symbol && p.side === positionSide
        );

        if (!position) {
            logger.warn("market", `[FlashClose] Position not found in cache. Accessing API fallback for: ${symbol} ${positionSide}`);

            try {
                // Force sync open positions
                await this.fetchOpenPositionsFromApi();
                // Re-check
                positions = omsService.getPositions();
                position = positions.find(
                    (p) => p.symbol === symbol && p.side === positionSide
                );
            } catch (e) {
                logger.error("market", `[FlashClose] API Fallback failed`, e);
            }
        }

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

        // OPTIMISTIC UPDATE
        const clientOrderId = "opt-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
        omsService.addOptimisticOrder({
            id: clientOrderId,
            clientOrderId,
            symbol,
            side: side,
            type: "market",
            status: "pending",
            price: new Decimal(0),
            amount: position.amount,
            filledAmount: new Decimal(0),
            timestamp: Date.now(),
            _isOptimistic: true
        });

        try {
            // HARDENING: Safety First. Attempt to cancel all open orders (SL/TP) before closing.
            // This prevents "Naked Stop Loss" scenarios where a position is closed but the SL remains.
            // We await this to ensure safety, even though it adds latency. "Best Effort" (catch inside cancelAllOrders).
            await this.cancelAllOrders(symbol);

            return await this.signedRequest("POST", "/api/orders", {
                symbol,
                side: apiSide,
                orderType: "MARKET",
                qty, // String for precision
                reduceOnly: true,
                clientOrderId
            });
        } catch (e) {
            // HARDENING: Two Generals Problem.
            // If request fails (timeout/network), order might be live.
            // Do NOT remove optimistic order. Instead, keep it visible and force a sync.
            // omsService.removeOrder(clientOrderId); <--- UNSAFE

            logger.warn("market", `[FlashClose] Request failed. Keeping optimistic order ${clientOrderId} and forcing sync.`, e);

            // HARDENING: Clean up optimistic order if we KNOW it failed (e.g. 4xx error)
            // BitunixApiError (checked in signedRequest) throws with code if response came back.
            // Standard Error might be network timeout.
            if (e instanceof BitunixApiError || (e instanceof Error && e.message && (e.message.includes("400") || e.message.includes("401") || e.message.includes("403")))) {
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

            // Trigger background sync to verify state
            this.fetchOpenPositionsFromApi().catch(err => {
                 logger.error("market", "[FlashClose] Sync failed after error", err);
            });

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
                headers: { "Content-Type": "application/json" },
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

        } catch (e) {
            logger.error("market", "[TradeService] Failed to fetch open positions", e);
            throw e;
        }
    }

    public async cancelAllOrders(symbol: string) {
        if (!symbol) return;
        logger.log("market", `[Trade] Cancelling all orders for ${symbol}`);
        try {
             return await this.signedRequest("POST", "/api/orders", {
                symbol,
                type: "cancel-all"
             });
        } catch (e) {
             logger.warn("market", `[Trade] Failed to cancel orders for ${symbol}`, e);
             // We don't throw here, because we want flashClose to proceed even if cancel fails (best effort)
        }
    }

    public async closePosition(params: { symbol: string, positionSide: "long" | "short", amount?: Decimal }) {
        const { symbol, positionSide, amount } = params;

        // 1. Get position from OMS
        const positions = omsService.getPositions();
        const position = positions.find(
            (p) => p.symbol === symbol && p.side === positionSide
        );

        if (!position) {
            throw new Error("tradeErrors.positionNotFound");
        }

        const side = positionSide === "long" ? "SELL" : "BUY";

        // Use explicit amount or full position amount
        // If explicit amount is provided, use it.
        if (!amount) {
             logger.warn("market", `[ClosePosition] No amount specified. Defaulting to FULL CLOSE for ${symbol} ${positionSide}`);
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
        const promises = positions.map(p => this.closePosition({ symbol: p.symbol, positionSide: p.side }));
        const results = await Promise.allSettled(promises);

        const failures = results.filter(r => r.status === "rejected");
        if (failures.length > 0) {
            logger.error("market", `[CloseAll] Failed to close ${failures.length} positions.`);
            throw new Error("apiErrors.generic"); // Or specific bulk error if we had one
        }

        return results;
    }
}

export const tradeService = new TradeService();
