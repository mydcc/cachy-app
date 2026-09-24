/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Extracted error shapes (FEAT-0342): names, codes, and message fallbacks
 * must survive the move out of tradeService.ts unchanged.
 */
import { describe, it, expect } from "vitest";
import { BitunixApiError, TradeError, TRADE_ERRORS } from "./tradeErrors";

describe("tradeErrors", () => {
  it("builds a BitunixApiError with code-first message fallback", () => {
    const err = new BitunixApiError(45001, "original", "raw");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("BitunixApiError");
    expect(err.code).toBe(45001);
    expect(err.message).toBe("original");
    expect(err.rawMessage).toBe("raw");
  });

  it("falls back to a code-derived message without one", () => {
    const err = new BitunixApiError("frequent");
    expect(err.message).toBe("Bitunix API Error frequent");
    expect(err.rawMessage).toBe("");
  });

  it("builds a TradeError carrying code and details", () => {
    const details = { symbol: "BTCUSDT" };
    const err = new TradeError("trade.fetchFailed", "FETCH_FAILED", details);
    expect(err.name).toBe("TradeError");
    expect(err.code).toBe("FETCH_FAILED");
    expect(err.details).toBe(details);
  });

  it("keeps the TRADE_ERRORS keys the app matches on", () => {
    expect(TRADE_ERRORS).toEqual({
      POSITION_NOT_FOUND: "tradeErrors.positionNotFound",
      ORDER_NOT_FOUND: "tradeErrors.orderNotFound",
      FETCH_FAILED: "trade.fetchFailed",
      CLOSE_ALL_FAILED: "trade.closeAllFailed",
    });
  });
});
