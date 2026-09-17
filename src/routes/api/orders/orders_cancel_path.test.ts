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

// Regression test: order cancellation used to call the singular, DELETE-only
// /trade/cancel_order, which Bitunix does not expose (see
// docs/bitunix-api/07_trade.md "Cancel Orders" — POST, plural, orderList).

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

describe("POST /api/orders cancel-order uses the real Bitunix endpoint", () => {
  it("calls POST /api/v1/futures/trade/cancel_orders with an orderList", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ code: 0, data: { successList: [{ orderId: "42" }], failureList: [] }, msg: "Success" }),
    });

    const response = await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "cancel-order",
        symbol: "BTCUSDT",
        orderId: "42",
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/trade/cancel_orders");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      symbol: "BTCUSDT",
      orderList: [{ orderId: "42" }],
    });
  });

  it("surfaces a rejected order from failureList as an error", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          code: 0,
          data: { successList: [], failureList: [{ orderId: "42", errorMsg: "Order status error", errorCode: 10013 }] },
          msg: "Success",
        }),
    });

    const response = await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "cancel-order",
        symbol: "BTCUSDT",
        orderId: "42",
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Order status error");
  });
});
