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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The stores only arm their persistence effects when `browser` is true;
// without this mock they silently no-op (same trick as
// app_bitgetSymbolKey.test.ts).
vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("./connectionManager", () => ({
  connectionManager: {
    registerProvider: vi.fn(),
    registerPolling: vi.fn(),
    switchProvider: vi.fn(),
    onProviderConnected: vi.fn(),
    onProviderDisconnected: vi.fn(),
  },
}));

vi.mock("./marketWatcher", () => ({
  marketWatcher: {
    register: vi.fn(),
    unregister: vi.fn(),
  },
}));

vi.mock("./fundingRateService.svelte", () => ({
  fundingRateService: {
    start: vi.fn(),
    stop: vi.fn(),
    applyCachedRateFor: vi.fn(),
  },
}));

vi.mock("./paperTradingService", () => ({
  paperTradingService: {
    onPrice: vi.fn(),
  },
}));

import { tick } from "svelte";
import { setupRealtimeUpdatesEffect } from "./appEffects.svelte";
import { marketWatcher } from "./marketWatcher";
import { settingsState } from "../stores/settings.svelte";
import { tradeState } from "../stores/trade.svelte";

const DEBOUNCE_MS = 500;

// Let pending effects re-run (rootless effects flush on microtasks), then let
// one debounce window elapse so a symbol change settles into a registration.
const settleSymbol = async () => {
  await tick();
  vi.advanceTimersByTime(DEBOUNCE_MS);
};

describe("setupRealtimeUpdatesEffect - symbol debounce cleanup (BUG-0289)", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    settingsState.apiProvider = "bitunix";
    tradeState.symbol = "";
    await settleSymbol();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("registers watchers once per settled symbol and collapses rapid changes (debounce unchanged)", async () => {
    const stop = setupRealtimeUpdatesEffect({});

    tradeState.symbol = "BTCUSDT";
    await settleSymbol();

    expect(marketWatcher.register).toHaveBeenCalledTimes(2);
    expect(marketWatcher.register).toHaveBeenNthCalledWith(1, "BTCUSDT", "price");
    expect(marketWatcher.register).toHaveBeenNthCalledWith(2, "BTCUSDT", "ticker");

    // Rapid changes within one debounce window collapse into a single
    // registration for the last settled symbol.
    tradeState.symbol = "ETHUSDT";
    await tick();
    tradeState.symbol = "SOLUSDT";
    await settleSymbol();

    // + SOLUSDT price/ticker; ETHUSDT never settled long enough to register.
    expect(marketWatcher.register).toHaveBeenCalledTimes(4);
    expect(marketWatcher.register).toHaveBeenNthCalledWith(3, "SOLUSDT", "price");
    expect(marketWatcher.register).toHaveBeenNthCalledWith(4, "SOLUSDT", "ticker");
    expect(marketWatcher.register).not.toHaveBeenCalledWith(
      "ETHUSDT",
      expect.anything()
    );
    // Switching from BTCUSDT to SOLUSDT unregisters exactly the old symbol.
    expect(marketWatcher.unregister).toHaveBeenCalledTimes(2);
    expect(marketWatcher.unregister).toHaveBeenCalledWith("BTCUSDT", "price");
    expect(marketWatcher.unregister).toHaveBeenCalledWith("BTCUSDT", "ticker");

    stop();
  });

  it("never fires a pending debounce callback after the effect root is disposed", async () => {
    const stop = setupRealtimeUpdatesEffect({});

    tradeState.symbol = "BTCUSDT";
    await settleSymbol();

    tradeState.symbol = "ETHUSDT";
    await settleSymbol();

    // A new symbol arrives but disposal happens INSIDE its debounce window.
    tradeState.symbol = "ADAUSDT";
    await tick();
    vi.advanceTimersByTime(DEBOUNCE_MS - 200);

    stop();

    marketWatcher.register.mockClear();
    marketWatcher.unregister.mockClear();

    // Well past every deadline: nothing may fire anymore.
    vi.advanceTimersByTime(DEBOUNCE_MS * 20);

    expect(marketWatcher.register).not.toHaveBeenCalled();
    expect(marketWatcher.unregister).not.toHaveBeenCalled();
  });
});
