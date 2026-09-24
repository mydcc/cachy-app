/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Trade error shapes, extracted from tradeService.ts (FEAT-0342).
 * Leaf module with no imports.
 */
export class BitunixApiError extends Error {
    /** Raw API message for internal classification (not for display) */
    public rawMessage: string;
    constructor(public code: number | string, message?: string, rawMessage?: string) {
        super(message || `Bitunix API Error ${code}`);
        this.name = "BitunixApiError";
        this.rawMessage = rawMessage || message || "";
    }
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
