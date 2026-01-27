/*
 * Copyright (C) 2026 MYDCT
 *
 * Trade Service
 * Handles order execution, validation, and lifecycle management.
 */

import Decimal from "decimal.js";
import { omsService } from "./omsService";
import { logger } from "./logger";
import { settingsState } from "../stores/settings.svelte";

export class BitunixApiError extends Error {
    constructor(public code: number | string, message?: string) {
        super(message || `Bitunix API Error ${code}`);
        this.name = "BitunixApiError";
    }
}

class TradeService {
    // Helper to sign and send requests to backend
    // Test mocks this
    public async signedRequest<T>(
        method: string,
        endpoint: string,
        payload: any
    ): Promise<T> {
        // Implementation for real app (simplified)
        // In test this is mocked
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Provider": provider
        };

        const response = await fetch(endpoint, {
            method,
            headers,
            body: JSON.stringify({
                ...payload,
                // Ensure keys are sent to backend for signing/execution
                apiKey: keys.key,
                apiSecret: keys.secret,
                passphrase: (keys as any).passphrase
            })
        });

        const data = await response.json();

        if (!response.ok || (data.code && data.code !== 0)) {
            throw new BitunixApiError(data.code || -1, data.msg || data.error);
        }

        return data;
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
            throw new Error(`Position not found: ${symbol} ${positionSide}`);
        }

        // 2. Execute Close
        // Close Long -> Sell
        // Close Short -> Buy
        const side = positionSide === "long" ? "SELL" : "BUY";

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
            side: side.toLowerCase() as any,
            type: "market",
            status: "pending",
            price: new Decimal(0),
            amount: position.amount,
            filledAmount: new Decimal(0),
            timestamp: Date.now(),
            _isOptimistic: true
        });

        try {
            return await this.signedRequest("POST", "/api/orders", {
                symbol,
                side,
                orderType: "MARKET",
                qty, // String for precision
                reduceOnly: true,
                clientOrderId
            });
        } catch (e) {
            omsService.removeOrder(clientOrderId);
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

            if (!pendingResponse.ok) throw new Error("Fetch failed");

            const pendingResult = await pendingResponse.json();
            if (pendingResult.error) throw new Error(pendingResult.error);

            const pendingPositions = Array.isArray(pendingResult.data) ? pendingResult.data : [];

            // Map and Update OMS
            pendingPositions.forEach((p: any) => {
                const side = (p.side || "").toLowerCase().includes("sell") || (p.side || "").toLowerCase().includes("short") ? "short" : "long";

                // Simple mapping (subset of full mapper)
                const mappedPosition: any = {
                    symbol: p.symbol,
                    side: side,
                    amount: new Decimal(p.qty || p.size || p.amount || 0),
                    entryPrice: new Decimal(p.avgOpenPrice || p.entryPrice || 0),
                    unrealizedPnl: new Decimal(p.unrealizedPNL || p.unrealizedPnl || 0),
                    leverage: new Decimal(p.leverage || 0),
                    marginMode: (p.marginMode || "cross").toLowerCase(),
                    liquidationPrice: p.liquidationPrice ? new Decimal(p.liquidationPrice) : undefined
                };

                omsService.updatePosition(mappedPosition);
            });

        } catch (e) {
            logger.error("market", "[TradeService] Failed to fetch open positions", e);
            throw e;
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
            throw new Error(`Position not found: ${symbol} ${positionSide}`);
        }

        const side = positionSide === "long" ? "SELL" : "BUY";

        // Use explicit amount or full position amount
        // If explicit amount is provided, use it.
        const qty = amount ? amount.toString() : position.amount.toString();
        const numQty = amount || position.amount;

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
            throw new Error(`Failed to close ${failures.length} positions`);
        }

        return results;
    }
}

export const tradeService = new TradeService();
