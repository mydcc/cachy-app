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
    public async signedRequest(
        method: string,
        endpoint: string,
        payload: any
    ): Promise<any> {
        // Implementation for real app (simplified)
        // In test this is mocked
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Provider": settingsState.apiProvider
        };

        const response = await fetch(endpoint, {
            method,
            headers,
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || (data.code && data.code !== 0)) {
             throw new BitunixApiError(data.code || -1, data.msg || data.error);
        }

        return data;
    }

    public async flashClosePosition(symbol: string, positionSide: "long" | "short") {
        // 1. Get position from OMS (Source of Truth)
        const positions = omsService.getPositions();
        const position = positions.find(
            (p) => p.symbol === symbol && p.side === positionSide
        );

        if (!position) {
            logger.error("market", `[FlashClose] Position not found: ${symbol} ${positionSide}`);
            throw new Error(`Position not found: ${symbol} ${positionSide}`);
        }

        // 2. Execute Close
        // Close Long -> Sell
        // Close Short -> Buy
        const side = positionSide === "long" ? "SELL" : "BUY";

        // CRITICAL: Use exact amount from OMS
        const qty = position.amount.toString();

        logger.log("market", `[FlashClose] Closing ${symbol} ${positionSide} (${qty})`);

        return this.signedRequest("POST", "/api/orders", {
            symbol,
            side,
            orderType: "MARKET",
            qty, // String for precision
            reduceOnly: true
        });
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

        logger.log("market", `[ClosePosition] Closing ${symbol} ${positionSide} (${qty})`);

        return this.signedRequest("POST", "/api/orders", {
            symbol,
            side,
            orderType: "MARKET",
            qty,
            reduceOnly: true
        });
    }
}

export const tradeService = new TradeService();
