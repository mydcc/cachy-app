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

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";

describe("MarketStore Limits", () => {
  let settingsState: any;
  let MarketManager: any;
  let marketState: any;
  let originalCacheSize: number;

  beforeAll(async () => {
    // Mock browser globals before imports
    const localStorageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    vi.stubGlobal("localStorage", localStorageMock);

    const windowMock = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
      location: { href: "" },
    };
    vi.stubGlobal("window", windowMock);

    // Mock browser environment
    vi.mock("$app/environment", () => ({
      browser: true,
      dev: true
    }));

    // Dynamic imports
    const settingsModule = await import("./settings.svelte");
    settingsState = settingsModule.settingsState;

    const marketModule = await import("./market.svelte");
    MarketManager = marketModule.MarketManager;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    if (MarketManager) {
        marketState = new MarketManager();
        originalCacheSize = settingsState.marketCacheSize || 20;
    }
  });

  afterEach(() => {
    if (marketState) {
        marketState.destroy();
        // Restore settings
        settingsState.update((s: any) => ({ ...s, marketCacheSize: originalCacheSize }));
    }
    vi.useRealTimers();
  });

  it("should enforce market data cache limit based on settings", async () => {
    // Set low limit
    settingsState.update((s: any) => ({ ...s, marketCacheSize: 2 }));

    // Add 3 symbols
    marketState.updateTicker("BTCUSDT", { lastPrice: "50000" });
    await vi.advanceTimersByTimeAsync(300);

    marketState.updateTicker("ETHUSDT", { lastPrice: "3000" });
    await vi.advanceTimersByTimeAsync(300);

    marketState.updateTicker("SOLUSDT", { lastPrice: "100" });
    await vi.advanceTimersByTimeAsync(300);

    // Check size
    const keys = Object.keys(marketState.data);
    expect(keys.length).toBeLessThanOrEqual(2);

    // Expect BTCUSDT (oldest) to be evicted
    expect(marketState.data["BTCUSDT"]).toBeUndefined();
    expect(marketState.data["ETHUSDT"]).toBeDefined();
    expect(marketState.data["SOLUSDT"]).toBeDefined();
  });

  it("should respect updated cache limit", async () => {
    // Start with limit 2
    settingsState.update((s: any) => ({ ...s, marketCacheSize: 2 }));

    marketState.updateTicker("A", { lastPrice: "1" });
    await vi.advanceTimersByTimeAsync(300);
    marketState.updateTicker("B", { lastPrice: "2" });
    await vi.advanceTimersByTimeAsync(300);

    expect(Object.keys(marketState.data).length).toBe(2);

    // Increase limit to 3
    settingsState.update((s: any) => ({ ...s, marketCacheSize: 3 }));

    marketState.updateTicker("C", { lastPrice: "3" });
    await vi.advanceTimersByTimeAsync(300);

    expect(Object.keys(marketState.data).length).toBe(3);

    expect(marketState.data["A"]).toBeDefined();
    expect(marketState.data["B"]).toBeDefined();
    expect(marketState.data["C"]).toBeDefined();
  });
});
