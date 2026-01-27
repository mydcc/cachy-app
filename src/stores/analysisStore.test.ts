/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { analysisState, type SymbolAnalysis } from "./analysis.svelte";
import { settingsState } from "./settings.svelte";

describe("analysisStore", () => {
  beforeEach(() => {
    analysisState.reset();
    // Set a known cache size for testing
    settingsState.marketCacheSize = 5;
  });

  it("should have updateAnalysis function", () => {
    expect(typeof analysisState.updateAnalysis).toBe("function");
  });

  it("should update analysis data correctly", () => {
    const testData: SymbolAnalysis = {
      symbol: "BTCUSDT",
      updatedAt: Date.now(),
      price: "50000",
      change24h: "2.5",
      trend4h: "bullish",
      rsi1h: "65",
      confluenceScore: 75,
      condition: "trending",
    };

    analysisState.updateAnalysis("BTCUSDT", testData);

    const result = analysisState.results["BTCUSDT"];
    expect(result).toBeDefined();
    expect(result.symbol).toBe("BTCUSDT");
    expect(result.price).toBe("50000");
    expect(result.trend4h).toBe("bullish");
  });

  it("should enforce cache limit by evicting oldest entries", () => {
    // Cache size is set to 5 in beforeEach
    const now = Date.now();

    // Add 7 symbols with different timestamps
    for (let i = 0; i < 7; i++) {
      const testData: SymbolAnalysis = {
        symbol: `SYMBOL${i}`,
        updatedAt: now + i * 1000, // Each symbol is 1 second apart
        price: String(1000 + i),
        change24h: "1.0",
        trend4h: "neutral",
        rsi1h: "50",
        confluenceScore: 50,
        condition: "neutral",
      };
      analysisState.updateAnalysis(`SYMBOL${i}`, testData);
    }

    // Should only have 5 entries (cache limit)
    const keys = Object.keys(analysisState.results);
    expect(keys.length).toBe(5);

    // The oldest 2 symbols (SYMBOL0 and SYMBOL1) should have been evicted
    expect(analysisState.results["SYMBOL0"]).toBeUndefined();
    expect(analysisState.results["SYMBOL1"]).toBeUndefined();

    // The newest 5 symbols should remain
    expect(analysisState.results["SYMBOL2"]).toBeDefined();
    expect(analysisState.results["SYMBOL3"]).toBeDefined();
    expect(analysisState.results["SYMBOL4"]).toBeDefined();
    expect(analysisState.results["SYMBOL5"]).toBeDefined();
    expect(analysisState.results["SYMBOL6"]).toBeDefined();
  });

  it("should use LRU eviction (oldest updatedAt removed first)", () => {
    const now = Date.now();

    // Add 3 symbols
    analysisState.updateAnalysis("SYM1", {
      symbol: "SYM1",
      updatedAt: now,
      price: "100",
      change24h: "0",
      trend4h: "neutral",
      rsi1h: "50",
      confluenceScore: 50,
      condition: "neutral",
    });

    analysisState.updateAnalysis("SYM2", {
      symbol: "SYM2",
      updatedAt: now + 2000, // Newest
      price: "200",
      change24h: "0",
      trend4h: "neutral",
      rsi1h: "50",
      confluenceScore: 50,
      condition: "neutral",
    });

    analysisState.updateAnalysis("SYM3", {
      symbol: "SYM3",
      updatedAt: now + 1000, // Middle
      price: "300",
      change24h: "0",
      trend4h: "neutral",
      rsi1h: "50",
      confluenceScore: 50,
      condition: "neutral",
    });

    // Now set cache size to 2 and add a new symbol
    settingsState.marketCacheSize = 2;

    analysisState.updateAnalysis("SYM4", {
      symbol: "SYM4",
      updatedAt: now + 3000,
      price: "400",
      change24h: "0",
      trend4h: "neutral",
      rsi1h: "50",
      confluenceScore: 50,
      condition: "neutral",
    });

    // Should only have 2 entries now
    expect(Object.keys(analysisState.results).length).toBe(2);

    // SYM1 (oldest) and SYM3 should be evicted, keeping SYM2 and SYM4 (newest)
    expect(analysisState.results["SYM1"]).toBeUndefined();
    expect(analysisState.results["SYM3"]).toBeUndefined();
    expect(analysisState.results["SYM2"]).toBeDefined();
    expect(analysisState.results["SYM4"]).toBeDefined();
  });

  it("should not evict when under cache limit", () => {
    // Cache size is 5
    analysisState.updateAnalysis("SYM1", {
      symbol: "SYM1",
      updatedAt: Date.now(),
      price: "100",
      change24h: "0",
      trend4h: "neutral",
      rsi1h: "50",
      confluenceScore: 50,
      condition: "neutral",
    });

    analysisState.updateAnalysis("SYM2", {
      symbol: "SYM2",
      updatedAt: Date.now() + 1000,
      price: "200",
      change24h: "0",
      trend4h: "neutral",
      rsi1h: "50",
      confluenceScore: 50,
      condition: "neutral",
    });

    // Should have both entries
    expect(Object.keys(analysisState.results).length).toBe(2);
    expect(analysisState.results["SYM1"]).toBeDefined();
    expect(analysisState.results["SYM2"]).toBeDefined();
  });

  it("should reset all state correctly", () => {
    // Add some data
    analysisState.updateAnalysis("BTCUSDT", {
      symbol: "BTCUSDT",
      updatedAt: Date.now(),
      price: "50000",
      change24h: "2.5",
      trend4h: "bullish",
      rsi1h: "65",
      confluenceScore: 75,
      condition: "trending",
    });

    analysisState.isAnalyzing = true;

    // Reset
    analysisState.reset();

    // All state should be cleared
    expect(Object.keys(analysisState.results).length).toBe(0);
    expect(analysisState.isAnalyzing).toBe(false);
    expect(analysisState.lastUpdate).toBe(0);
    expect(analysisState.lastAnalysisTime).toBe(0);
  });

  it("should respect default cache size when settingsState.marketCacheSize is not set", () => {
    // Set cache size to undefined/null to test default
    settingsState.marketCacheSize = 0;
    
    const now = Date.now();

    // Add 25 symbols (more than default of 20)
    for (let i = 0; i < 25; i++) {
      analysisState.updateAnalysis(`SYM${i}`, {
        symbol: `SYM${i}`,
        updatedAt: now + i * 1000,
        price: String(1000 + i),
        change24h: "0",
        trend4h: "neutral",
        rsi1h: "50",
        confluenceScore: 50,
        condition: "neutral",
      });
    }

    // Should fall back to default of 20
    expect(Object.keys(analysisState.results).length).toBe(20);
  });

  it("should count bullish and bearish trends correctly", () => {
    analysisState.updateAnalysis("BTC", {
      symbol: "BTC",
      updatedAt: Date.now(),
      price: "50000",
      change24h: "2.5",
      trend4h: "bullish",
      rsi1h: "65",
      confluenceScore: 75,
      condition: "trending",
    });

    analysisState.updateAnalysis("ETH", {
      symbol: "ETH",
      updatedAt: Date.now(),
      price: "3000",
      change24h: "-1.5",
      trend4h: "bearish",
      rsi1h: "35",
      confluenceScore: 45,
      condition: "oversold",
    });

    analysisState.updateAnalysis("SOL", {
      symbol: "SOL",
      updatedAt: Date.now(),
      price: "100",
      change24h: "0.5",
      trend4h: "bullish",
      rsi1h: "55",
      confluenceScore: 60,
      condition: "neutral",
    });

    expect(analysisState.bullishCount).toBe(2);
    expect(analysisState.bearishCount).toBe(1);
  });

  it("should sort by confluence score correctly", () => {
    analysisState.updateAnalysis("LOW", {
      symbol: "LOW",
      updatedAt: Date.now(),
      price: "100",
      change24h: "0",
      trend4h: "neutral",
      rsi1h: "50",
      confluenceScore: 30,
      condition: "neutral",
    });

    analysisState.updateAnalysis("HIGH", {
      symbol: "HIGH",
      updatedAt: Date.now(),
      price: "200",
      change24h: "0",
      trend4h: "neutral",
      rsi1h: "50",
      confluenceScore: 90,
      condition: "neutral",
    });

    analysisState.updateAnalysis("MID", {
      symbol: "MID",
      updatedAt: Date.now(),
      price: "150",
      change24h: "0",
      trend4h: "neutral",
      rsi1h: "50",
      confluenceScore: 60,
      condition: "neutral",
    });

    const sorted = analysisState.sortedByScore;
    expect(sorted[0].symbol).toBe("HIGH");
    expect(sorted[1].symbol).toBe("MID");
    expect(sorted[2].symbol).toBe("LOW");
  });
});
