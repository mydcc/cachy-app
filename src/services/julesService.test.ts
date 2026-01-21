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

import { describe, it, expect, vi } from "vitest";
import { julesService } from "./julesService";

// Mock Stores
vi.mock("../stores/settings.svelte", () => ({
  settingsState: {
    apiKeys: { bitunix: { apiKey: "123", apiSecret: "secret" } },
    isPro: true,
  },
}));

vi.mock("../stores/trade.svelte", () => ({
  tradeState: {
    symbol: "BTCUSDT",
    targets: [],
    subscribe: (fn: any) => {
      // Legacy compat mock if needed, or if julesService still subscribes
      fn({ symbol: "BTCUSDT", targets: [] });
      return () => {};
    },
  },
}));

vi.mock("../stores/account.svelte", () => ({
  accountState: {
    positions: [],
    openOrders: [],
    balance: "1000",
    availableBalance: "1000",
    isConnected: true,
  },
}));

vi.mock("../stores/market.svelte", () => ({
  marketState: {
    data: {},
    connectionStatus: "connected",
    subscribe: (fn: any) => {
      fn({});
      return () => {};
    },
  },
}));

// Mock Fetch
global.fetch = vi.fn();

describe("julesService", () => {
  it("should create a sanitized snapshot", () => {
    const snapshot = julesService.getSystemSnapshot();

    expect(snapshot.settings.apiKeys.bitunix.apiSecret).toBe("***REDACTED***");
    expect(snapshot.tradeState.symbol).toBe("BTCUSDT");
    expect(snapshot.accountSummary.isConnected).toBe(true);
  });

  it("should send a report to the API", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Success" }),
    });

    const result = await julesService.reportToJules(null, "MANUAL");
    expect(result).toBe("Success");
    expect(global.fetch).toHaveBeenCalledWith("/api/jules", expect.anything());
  });
});
