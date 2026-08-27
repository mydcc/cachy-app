// @vitest-environment happy-dom
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
 * The behaviour under test is unchanged: interest registered here must survive
 * a provider's destroy()/connect() cycle, and a channel nothing wants any more
 * must be dropped.
 *
 * What changed with FEAT-0227 is who is asked. This file used to mock
 * `./bitunixWs` and drive the scenario by writing into that service's internal
 * `pendingSubscriptions` map — the arrangement the item exists to remove, and
 * one that could only ever have tested Bitunix. It now mocks the adapter
 * boundary, and the "the provider forgot" step is `forgetSubscriptions()`,
 * which is what ConnectionManager calls after tearing every provider down.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { marketWatcher } from "./marketWatcher";

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
    entitlement: { capabilities: { marketData: true } },
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

const subscribe = vi.fn();
const unsubscribe = vi.fn();

vi.mock("./exchange", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./exchange")>();
  return {
    ...actual,
    activeExchange: () => ({
      id: "bitunix",
      marketData: {
        subscribe,
        unsubscribe,
        // The one venue-shaped fact this test needs: which channels a
        // requirement expands to. Kept minimal on purpose — the real mapping
        // is covered in `exchange/channelVocabulary.test.ts`.
        channelsForRequirement: (requirement: string) =>
          requirement.startsWith("kline_") ? [requirement] : [requirement],
      },
    }),
  };
});

interface MarketWatcherInternals {
  requests: Map<string, Map<string, Map<string, number>>>;
}

const watcher = marketWatcher as unknown as MarketWatcherInternals;

describe("MarketWatcher.resync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watcher.requests.clear();
    marketWatcher.forgetSubscriptions();
  });

  it("restores a subscription the provider forgot across a destroy()/connect() cycle", () => {
    // A tile registers interest; the adapter is told to subscribe.
    marketWatcher.register("BTCUSDT", "price");
    expect(subscribe).toHaveBeenCalledWith("BTCUSDT", "price");
    subscribe.mockClear();

    // ConnectionManager tears the provider down and reconnects it (e.g.
    // app.init()'s initial switchProvider race). destroy() wipes the
    // provider's own subscription buffer, but MarketWatcher never
    // unregistered BTCUSDT:price — a tile is still relying on this data.
    marketWatcher.forgetSubscriptions();

    marketWatcher.resync();

    expect(subscribe).toHaveBeenCalledWith("BTCUSDT", "price");
  });

  it("does not re-subscribe a channel the provider already has", () => {
    marketWatcher.register("BTCUSDT", "price");
    subscribe.mockClear();

    // No teardown happened, so the socket still holds what it was told. A
    // plain reconnect keeps its subscription buffer; re-issuing here would
    // drive the venue's own count up with nothing to bring it back down.
    marketWatcher.resync();

    expect(subscribe).not.toHaveBeenCalled();
  });

  it("unsubscribes a channel the provider still has but nothing wants anymore", () => {
    marketWatcher.register("STALEUSDT", "price");
    subscribe.mockClear();

    // Every tile showing it goes away.
    marketWatcher.unregister("STALEUSDT", "price");
    marketWatcher.resync();

    expect(unsubscribe).toHaveBeenCalledWith("STALEUSDT", "price");
  });

  it("does not unsubscribe a channel the socket was never told about", () => {
    marketWatcher.register("BTCUSDT", "price");
    marketWatcher.forgetSubscriptions();
    unsubscribe.mockClear();

    // The provider was destroyed and everything unregistered before it came
    // back. Sending an unsubscribe for a channel no live socket holds is
    // noise at best and a wire error at worst.
    watcher.requests.clear();
    marketWatcher.resync();

    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
