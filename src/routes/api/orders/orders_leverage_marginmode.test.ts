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
import { POST } from "./+server";
import * as clientToken from "../../../lib/server/clientToken";

// Regression: Bitunix's get_pending_orders/get_history_orders responses
// carry leverage, marginMode, positionMode and TP/SL fields on every order
// (docs/bitunix-api/07_trade.md:294-325, "Analog zu Get History Orders" for
// pending), but the route never mapped them into NormalizedOrder — the
// order tooltip's Leverage/Margin Mode rows always rendered empty
// regardless of what the exchange returned.

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const getClientAddress = () => "127.0.0.1";

function makeRequest(body: unknown): Request {
  return {
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
});

const rawOrder = {
  orderId: "1", symbol: "XRPUSDT", type: "LIMIT", side: "BUY",
  price: "1.0349", qty: "9.5", tradeQty: "0", status: "NEW",
  ctime: 1700000000000, mtime: 1700000001000,
  leverage: 15, marginMode: "ISOLATION", positionMode: "HEDGE",
  tpPrice: "1.06", tpStopType: "MARK", tpOrderType: "MARKET",
  slPrice: "1.02", slStopType: "MARK", slOrderType: "MARKET",
};

describe("POST /api/orders maps leverage/marginMode/positionMode/TP-SL", () => {
  it("for pending orders", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ code: 0, data: { orderList: [rawOrder] }, msg: "Success" }),
    });

    const res = await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "pending",
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    const body = await res.json();
    const order = body.orders[0];
    expect(order.leverage).toBe(15);
    expect(order.marginMode).toBe("ISOLATION");
    expect(order.positionMode).toBe("HEDGE");
    expect(order.tpPrice).toBe("1.06");
    expect(order.slPrice).toBe("1.02");
    expect(order.mtime).toBe(1700000001000);
  });

  it("for history orders", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ code: 0, data: { orderList: [rawOrder] }, msg: "Success" }),
    });

    const res = await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "history",
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    const body = await res.json();
    const order = body.orders[0];
    expect(order.leverage).toBe(15);
    expect(order.marginMode).toBe("ISOLATION");
    expect(order.positionMode).toBe("HEDGE");
    expect(order.tpPrice).toBe("1.06");
    expect(order.slPrice).toBe("1.02");
    expect(order.mtime).toBe(1700000001000);
  });
});
