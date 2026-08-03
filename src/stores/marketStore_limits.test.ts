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
import type { Settings } from "./settings.svelte";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true
}));

describe("MarketStore Limits", () => {
  let settingsState: typeof import("./settings.svelte")["settingsState"];
  let MarketManager: typeof import("./market.svelte")["MarketManager"];
  let marketState: InstanceType<typeof import("./market.svelte")["MarketManager"]> | undefined;
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
        settingsState.update((s: Settings) => ({ ...s, marketCacheSize: originalCacheSize }));
    }
    vi.useRealTimers();
  });

  it("should enforce market data cache limit based on settings", async () => {
    // beforeEach always sets marketState once MarketManager has loaded.
    const market = marketState!;

    // Set low limit
    settingsState.update((s: Settings) => ({ ...s, marketCacheSize: 2 }));

    // Add 3 symbols
    market.updateTicker("BTCUSDT", { lastPrice: "50000" });
    await vi.advanceTimersByTimeAsync(300);

    market.updateTicker("ETHUSDT", { lastPrice: "3000" });
    await vi.advanceTimersByTimeAsync(300);

    market.updateTicker("SOLUSDT", { lastPrice: "100" });
    await vi.advanceTimersByTimeAsync(300);

    // Check size
    const keys = Object.keys(market.data);
    expect(keys.length).toBeLessThanOrEqual(2);

    // Expect BTCUSDT (oldest) to be evicted
    expect(market.data["BTCUSDT"]).toBeUndefined();
    expect(market.data["ETHUSDT"]).toBeDefined();
    expect(market.data["SOLUSDT"]).toBeDefined();
  });

  it("should respect updated cache limit", async () => {
    // beforeEach always sets marketState once MarketManager has loaded.
    const market = marketState!;

    // Start with limit 2
    settingsState.update((s: Settings) => ({ ...s, marketCacheSize: 2 }));

    market.updateTicker("A", { lastPrice: "1" });
    await vi.advanceTimersByTimeAsync(300);
    market.updateTicker("B", { lastPrice: "2" });
    await vi.advanceTimersByTimeAsync(300);

    expect(Object.keys(market.data).length).toBe(2);

    // Increase limit to 3
    settingsState.update((s: Settings) => ({ ...s, marketCacheSize: 3 }));

    market.updateTicker("C", { lastPrice: "3" });
    await vi.advanceTimersByTimeAsync(300);

    expect(Object.keys(market.data).length).toBe(3);

    expect(market.data["A"]).toBeDefined();
    expect(market.data["B"]).toBeDefined();
    expect(market.data["C"]).toBeDefined();
  });
});
