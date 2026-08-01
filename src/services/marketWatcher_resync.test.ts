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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { marketWatcher } from "./marketWatcher";
import { bitunixWs } from "./bitunixWs";

vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("./apiService", () => ({
  apiService: {
    fetchTicker24h: vi.fn(),
    fetchBitunixKlines: vi.fn(),
    fetchBitgetKlines: vi.fn(),
  },
}));

vi.mock("../stores/settings.svelte", () => ({
  settingsState: {
    apiProvider: "bitunix",
    capabilities: { marketData: true },
    chartHistoryLimit: 1000,
  },
}));

vi.mock("../stores/market.svelte", () => ({
  marketState: {
    data: {},
    connectionStatus: "connected",
    updateSymbol: vi.fn(),
    updateSymbolKlines: vi.fn(),
  },
}));

vi.mock("./bitunixWs", () => ({
  bitunixWs: {
    pendingSubscriptions: new Map<string, number>(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

interface MarketWatcherInternals {
  requests: Map<string, Map<string, Map<string, number>>>;
}

const watcher = marketWatcher as unknown as MarketWatcherInternals;
const pending = bitunixWs.pendingSubscriptions as Map<string, number>;

describe("MarketWatcher.resync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watcher.requests.clear();
    pending.clear();
  });

  it("restores a subscription the provider forgot across a destroy()/connect() cycle", () => {
    // A tile registers interest; the live socket records the subscription.
    marketWatcher.register("BTCUSDT", "price");
    expect(bitunixWs.subscribe).toHaveBeenCalledWith("BTCUSDT", "price");
    vi.mocked(bitunixWs.subscribe).mockClear();

    // Simulate ConnectionManager tearing the provider down and reconnecting
    // it (e.g. app.init()'s initial switchProvider race). destroy() wipes the
    // provider's own subscription buffer, but MarketWatcher never
    // unregistered BTCUSDT:price - a tile is still relying on this data.
    pending.clear();

    marketWatcher.resync();

    expect(bitunixWs.subscribe).toHaveBeenCalledWith("BTCUSDT", "price");
  });

  it("does not re-subscribe a channel the provider already has", () => {
    marketWatcher.register("BTCUSDT", "price");
    // Simulate the provider having actually recorded the subscription.
    pending.set("price:BTCUSDT", 1);
    vi.mocked(bitunixWs.subscribe).mockClear();

    marketWatcher.resync();

    expect(bitunixWs.subscribe).not.toHaveBeenCalled();
  });

  it("unsubscribes a channel the provider still has but nothing wants anymore", () => {
    pending.set("price:STALEUSDT", 1);

    marketWatcher.resync();

    expect(bitunixWs.unsubscribe).toHaveBeenCalledWith("STALEUSDT", "price");
  });
});
