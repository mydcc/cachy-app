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

import { describe, it, expect, vi, afterEach } from "vitest";

// setupRealtimeUpdates() is gated behind `if (!browser) return`. Vitest's
// default test environment resolves $app/environment's `browser` to false,
// so without this mock the function under test would silently no-op.
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

import { app } from "./app";
import { settingsState } from "../stores/settings.svelte";
import { tradeState } from "../stores/trade.svelte";
import { marketState } from "../stores/market.svelte";
import { Decimal } from "decimal.js";

describe("app.setupRealtimeUpdates - Bitget symbol-key parity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates the price input from live market data, keyed canonically, while Bitget is active", () => {
    settingsState.apiProvider = "bitget";
    settingsState.autoUpdatePriceInput = true;
    tradeState.update((s) => ({ ...s, symbol: "BTCUSDT", entryPrice: "0" }));

    const subscribeSpy = vi.spyOn(marketState, "subscribe");
    app.setupRealtimeUpdates();

    const marketListener = subscribeSpy.mock.calls[0]?.[0];
    expect(marketListener).toBeTypeOf("function");

    // Regression test: every writer (MarketWatcher's REST polling via
    // apiService, which is the only live data path for Bitget market data
    // today) keys marketState.data by normalizeSymbol(symbol, "bitunix")
    // regardless of the active provider. Before the fix, this callback
    // looked the price up under normalizeSymbol(symbol, "bitget")
    // ("BTCUSDT_UMCBL") instead, which nothing ever writes to - so the price
    // input silently never updated while Bitget was the active provider.
    marketListener!({
      BTCUSDT: { lastPrice: new Decimal("65000") },
    });

    expect(tradeState.entryPrice).toBe("65000");
  });
});
