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

import { Decimal } from "decimal.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true, dev: true }));
vi.mock("./logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { paperState } from "../stores/paperTrading.svelte";
import { paperExchange, setPaperPriceFeed } from "./paperExchange";

const BOT_STAMP = {
  origin: "bot",
  botId: "grid-1",
  ruleId: "grid-1",
  strategyHash: "ab".repeat(32),
};

describe("paperExchange — resting grid counter-orders and clientId attribution", () => {
  let feedPrice = new Decimal("41000");

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("failureMode", "none");
    paperState.setConfig("slippageBps", "0");
    paperState.setConfig("takerFeeBps", "0");
    paperState.setConfig("startingBalance", "10000");
    paperState.resetBook();
    paperState.setEnabled(true);
    feedPrice = new Decimal("41000");
    setPaperPriceFeed(() => feedPrice);
  });

  it("preserves payload.clientId on resting orders and executed PaperFill records", async () => {
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "BUY",
      orderType: "LIMIT",
      qty: "0.01",
      price: "40000",
      tradeSide: "OPEN",
      clientId: "grid:grid-1:s0:open",
      ...BOT_STAMP,
    });

    expect(paperState.orders[0].clientOrderId).toBe("grid:grid-1:s0:open");

    paperExchange.settleRestingOrders("BTCUSDT", new Decimal("39900"));
    expect(paperState.fills).toHaveLength(1);
    expect(paperState.fills[0].clientOrderId).toBe("grid:grid-1:s0:open");
  });

  it("triggers long reduce-only LIMIT counter-orders at or above target price (never below)", async () => {
    // Open a long position at 40000.
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "BUY",
      orderType: "MARKET",
      qty: "0.02",
      tradeSide: "OPEN",
      ...BOT_STAMP,
    });
    const posId = paperState.positions[0].positionId;

    // Place a Bitunix-shaped reduce-only close limit at 42000.
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "BUY",
      orderType: "LIMIT",
      qty: "0.02",
      price: "42000",
      reduceOnly: true,
      tradeSide: "CLOSE",
      positionId: posId,
      clientId: "grid:grid-1:s0:close",
      ...BOT_STAMP,
    });

    // At 41500 (below 42000), counter-order MUST NOT fill.
    paperExchange.settleRestingOrders("BTCUSDT", new Decimal("41500"));
    expect(paperState.orders).toHaveLength(1);
    expect(paperState.positions).toHaveLength(1);

    // At 42000, counter-order fills and closes the long.
    paperExchange.settleRestingOrders("BTCUSDT", new Decimal("42000"));
    expect(paperState.orders).toHaveLength(0);
    expect(paperState.positions).toHaveLength(0);
    expect(paperState.fills.at(-1)?.clientOrderId).toBe("grid:grid-1:s0:close");
    expect(paperState.fills.at(-1)?.tradeSide).toBe("CLOSE");
  });

  it("triggers short reduce-only LIMIT counter-orders (Bitget UTA shape too) at or below target price", async () => {
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "SELL",
      orderType: "MARKET",
      qty: "0.02",
      tradeSide: "OPEN",
      ...BOT_STAMP,
    });
    const posId = paperState.positions[0].positionId;

    // Bitget-style close limit: transactional BUY, posSide: SHORT.
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "BUY",
      posSide: "SHORT",
      orderType: "LIMIT",
      qty: "0.02",
      price: "39000",
      reduceOnly: false,
      tradeSide: "CLOSE",
      positionId: posId,
      clientId: "grid:grid-1:s0:close",
      ...BOT_STAMP,
    });

    // At 40500 (above 39000), short counter-order MUST NOT fill.
    paperExchange.settleRestingOrders("BTCUSDT", new Decimal("40500"));
    expect(paperState.orders).toHaveLength(1);

    // At 39000, short counter-order fills and closes the short.
    paperExchange.settleRestingOrders("BTCUSDT", new Decimal("39000"));
    expect(paperState.orders).toHaveLength(0);
    expect(paperState.positions).toHaveLength(0);
    expect(paperState.fills.at(-1)?.realizedPnl).toBe("40");
  });

  it("cancelOpeningOrdersOwnedBy removes only unfilled openings and preserves counter-orders", async () => {
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "BUY",
      orderType: "LIMIT",
      qty: "0.01",
      price: "40000",
      tradeSide: "OPEN",
      clientId: "grid:grid-1:s0:open",
      ...BOT_STAMP,
    });
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "BUY",
      orderType: "LIMIT",
      qty: "0.01",
      price: "42000",
      reduceOnly: true,
      tradeSide: "CLOSE",
      clientId: "grid:grid-1:s1:close",
      ...BOT_STAMP,
    });

    const cancelled = paperExchange.cancelOpeningOrdersOwnedBy("grid-1");
    expect(cancelled).toBe(1);
    expect(paperState.orders.map((o) => o.clientOrderId)).toEqual(["grid:grid-1:s1:close"]);
  });

  it("stores reduceOnly: true on Bitget UTA close orders, bounds LIMIT fills without slippage, and stamps exitBy only for bot/plan closes", async () => {
    paperState.setConfig("slippageBps", "100"); // 1% slippage must not worsen resting LIMIT fills
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "BUY",
      orderType: "LIMIT",
      qty: "0.01",
      price: "40000",
      tradeSide: "OPEN",
      clientId: "grid:grid-1:s0:open",
      ...BOT_STAMP,
    });
    // Cross open limit at exact limit price -> fills at 40000 (not 40400)
    paperExchange.settleRestingOrders("BTCUSDT", new Decimal("40000"));
    expect(paperState.fills[0].price).toBe("40000");

    const posId = paperState.positions[0].positionId;
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "SELL",
      posSide: "LONG",
      orderType: "LIMIT",
      qty: "0.01",
      price: "42000",
      reduceOnly: false,
      tradeSide: "CLOSE",
      positionId: posId,
      clientId: "grid:grid-1:s0:close",
      ...BOT_STAMP,
    });

    expect(paperState.orders[0].reduceOnly).toBe(true);

    paperExchange.settleRestingOrders("BTCUSDT", new Decimal("42000"));
    expect(paperState.fills[1].price).toBe("42000");
    // Autonomous bot reduce-only counter-order closes count as bot exits in journal.
    expect(paperState.fills[1].exitBy).toBe("plan");

    // Manual reduce-only LIMIT close still leaves exitBy undefined.
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "ETHUSDT",
      side: "BUY",
      orderType: "MARKET",
      qty: "0.1",
      tradeSide: "OPEN",
      origin: "manual",
    });
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "ETHUSDT",
      side: "BUY",
      orderType: "LIMIT",
      qty: "0.1",
      price: "2500",
      reduceOnly: true,
      tradeSide: "CLOSE",
      origin: "manual",
    });
    paperExchange.settleRestingOrders("ETHUSDT", new Decimal("2500"));
    expect(paperState.fills.at(-1)?.exitBy).toBeUndefined();
  });

  it("settles bot short opening LIMIT at its resting limit level on upward price gaps (preserving quote budget)", async () => {
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "SELL",
      orderType: "LIMIT",
      qty: "0.01",
      price: "40000",
      tradeSide: "OPEN",
      clientId: "grid:grid-1:s0:open",
      ...BOT_STAMP,
    });
    paperExchange.settleRestingOrders("BTCUSDT", new Decimal("45000"));
    expect(paperState.fills).toHaveLength(1);
    expect(paperState.fills[0].price).toBe("40000");
    expect(paperState.positions[0].entryPrice).toBe("40000");
  });
});
