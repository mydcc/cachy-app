/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "decimal.js";

// Mock appAuth to observe whether any proxy requests travel
vi.mock("../../lib/appAuth", () => ({
  appFetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Should not be called" }), { status: 500 }))
}));

vi.mock("../../services/cmcService", () => ({
  cmcService: {
    getGlobalMetrics: vi.fn().mockResolvedValue(null),
    getCoinMetadata: vi.fn().mockResolvedValue(null),
  }
}));

vi.mock("../../services/newsService", () => ({
  newsService: {
    fetchNews: vi.fn().mockResolvedValue([]),
  }
}));

vi.mock("../../services/exchange", () => ({
  activeExchange: () => ({
    marketData: {
      fetchKlines: vi.fn().mockResolvedValue([]),
    }
  })
}));

import { aiState } from "../../stores/ai.svelte";
import { settingsState } from "../../stores/settings.svelte";
import { journalState } from "../../stores/journal.svelte";
import { tradeState } from "../../stores/trade.svelte";
import { accountState } from "../../stores/account.svelte";
import { buildSystemPrompt } from "../../lib/ai/prompts/promptBuilder";
import { appFetch } from "../../lib/appAuth";

describe("BUG-0282: AI context egress boundary & consent (ADR-0011)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Populate Class A data in journal, trade, and account
    journalState.entries = [
      {
        id: "entry-1",
        symbol: "BTCUSDT",
        tradeType: "long",
        entryPrice: "50000",
        exitPrice: "55000",
        entryDate: "2026-08-01T10:00:00Z",
        exitDate: "2026-08-01T12:00:00Z",
        totalNetProfit: "1337.42",
        rating: 5,
        tags: ["secret-strategy"],
      }
    ];

    tradeState.symbol = "BTCUSDT";
    tradeState.entryPrice = "60000";
    tradeState.stopLossPrice = "58000";
    tradeState.riskPercentage = "2.5";
    tradeState.targets = [{ price: "65000", percent: 100 }];

    accountState.positions = [
      {
        symbol: "BTCUSDT",
        side: "buy",
        size: new Decimal("0.5"),
        entryPrice: new Decimal("59000"),
        markPrice: new Decimal("60000"),
        liquidationPrice: new Decimal("40000"),
        leverage: 10,
        margin: new Decimal("3000"),
        unrealizedPnl: new Decimal("500"),
      }
    ];
  });

  it("omits Class A data (journal, portfolio stats, open positions, trade setup) when consent is default-off", async () => {
    // Default consent is false
    settingsState.aiShareTradeContext = false;

    const context = await aiState.gatherContext();

    // Context fields must be undefined/omitted
    expect(context.portfolioStats).toBeUndefined();
    expect(context.recentHistory).toBeUndefined();
    expect(context.openPositions).toBeUndefined();
    expect(context.tradeSetup).toBeUndefined();

    // Market / public data should still be present
    expect(context.activeSymbol).toBe("BTCUSDT");

    // Formatted prompt must not contain Class A secrets
    const prompt = buildSystemPrompt({ mode: "risk", context });
    expect(prompt).not.toContain("1337.42");
    expect(prompt).not.toContain("secret-strategy");
    expect(prompt).not.toContain('"portfolioStats":');
    expect(prompt).not.toContain('"tradeSetup":');
    expect(prompt).not.toContain('"openPositions":');
    expect(prompt).not.toContain('"recentHistory":');
  });

  it("includes Class A data when consent is explicitly enabled, and revoking immediately stops egress", async () => {
    // 1. Explicit opt-in
    settingsState.aiShareTradeContext = true;

    const contextWithConsent = await aiState.gatherContext();
    expect(contextWithConsent.portfolioStats).toBeDefined();
    expect(contextWithConsent.recentHistory).toBeDefined();
    expect(contextWithConsent.recentHistory?.length).toBe(1);
    expect(contextWithConsent.tradeSetup).toBeDefined();

    const promptWithConsent = buildSystemPrompt({ mode: "risk", context: contextWithConsent });
    expect(promptWithConsent).toContain("1337.42");

    // 2. Revoke consent immediately
    settingsState.aiShareTradeContext = false;

    const contextAfterRevocation = await aiState.gatherContext();
    expect(contextAfterRevocation.portfolioStats).toBeUndefined();
    expect(contextAfterRevocation.recentHistory).toBeUndefined();
    expect(contextAfterRevocation.tradeSetup).toBeUndefined();

    const promptAfterRevocation = buildSystemPrompt({ mode: "risk", context: contextAfterRevocation });
    expect(promptAfterRevocation).not.toContain("1337.42");
  });

  it("Ollama mode fails closed and never calls server proxy when local endpoint is unreachable", async () => {
    settingsState.aiProvider = "ollama";
    settingsState.ollamaBaseUrl = "http://127.0.0.1:9999";
    settingsState.ollamaModel = "llama3:latest";

    // Simulate browser fetch failure (e.g. connection refused)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Failed to connect to 127.0.0.1:9999"));

    try {
      await aiState.sendMessage("Test message");

      // appFetch (the Cachy server proxy) must NEVER be called
      expect(appFetch).not.toHaveBeenCalled();

      // aiState must report error and stop streaming
      expect(aiState.isStreaming).toBe(false);
      expect(aiState.error).toContain("Ollama");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
