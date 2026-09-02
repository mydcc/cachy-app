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

import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { tradeService } from "./tradeService";
import { omsService } from "./omsService";
import { Decimal } from "decimal.js";

// Regression coverage for a request body missing `exchange` (and, for
// place-order calls, `type`) — both required by the server-side Zod schemas
// (BaseRequestSchema.exchange, OrderRequestSchema's "type" discriminant).
// signedRequest sent credentials via headers only, so every one of these
// calls 400'd with "Validation Error" before ever reaching Bitunix,
// regardless of whether the endpoint path itself was correct.

vi.mock("../stores/settings.svelte", () => ({
  settingsState: {
    apiProvider: "bitunix",
    ...migrateAccounts({ apiKeys: {
      bitunix: { key: "test", secret: "test" },
    } }),
    appAccessToken: "test-token",
    secretsReady: Promise.resolve(),
  },
}));

vi.mock("./logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}));

vi.mock("../stores/trade.svelte", () => ({
  tradeState: {
    symbol: "BTCUSDT",
    update: vi.fn(),
  },
}));

vi.mock("./omsService", () => ({
  omsService: {
    getPositions: vi.fn().mockReturnValue([]),
    addOptimisticOrder: vi.fn(),
    updatePosition: vi.fn(),
  },
}));

vi.mock("../stores/market.svelte", () => ({
  marketState: { data: {} },
}));

describe("TradeService request bodies include exchange (and type for place-order)", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ code: "0", data: [] }),
      json: async () => ({ code: "0", data: [] }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function lastBody(): Record<string, unknown> {
    const call = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    return JSON.parse(call[1]?.body as string);
  }

  it("cancelOrder sends exchange", async () => {
    await tradeService.cancelOrder("BTCUSDT", "1");
    const body = lastBody();
    expect(body.exchange).toBe("bitunix");
    expect(body.type).toBe("cancel-order");
  });

  it("cancelAllOrders sends exchange", async () => {
    await tradeService.cancelAllOrders("BTCUSDT");
    const body = lastBody();
    expect(body.exchange).toBe("bitunix");
    expect(body.type).toBe("cancel-all");
  });

  it("closePosition sends exchange and the place-order type discriminant", async () => {
    vi.mocked(omsService.getPositions).mockReturnValue([
      {
        symbol: "BTCUSDT",
        side: "long",
        amount: new Decimal(1),
        lastUpdated: Date.now(),
      },
    ]);

    await tradeService.closePosition({
      symbol: "BTCUSDT",
      positionSide: "long",
      forceFullClose: true,
    });

    const body = lastBody();
    expect(body.exchange).toBe("bitunix");
    expect(body.type).toBe("place-order");
  });

  it("fetchTpSlOrders sends exchange on /api/tpsl", async () => {
    await tradeService.fetchTpSlOrders("pending");
    const call = fetchSpy.mock.calls.find((c) => c[0] === "/api/tpsl");
    expect(call).toBeDefined();
    const body = JSON.parse(call![1]?.body as string);
    expect(body.exchange).toBe("bitunix");
  });
});
