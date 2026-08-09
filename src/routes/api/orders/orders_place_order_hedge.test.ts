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

// Regression (BUG-0062): PlaceOrderSchema didn't declare tradeSide/
// positionId, so the route silently dropped them from the request body
// before forwarding to Bitunix — a HEDGE-mode close order was always
// missing both fields, which Bitunix requires (docs/bitunix-api/
// 07_trade.md:583-584) and rejects the order without them.

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
  fetchMock.mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ code: 0, data: { orderId: "1" }, msg: "Success" }),
  });
});

describe("POST /api/orders place-order forwards tradeSide/positionId", () => {
  it("includes tradeSide and positionId in the outbound Bitunix request when provided", async () => {
    await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "place-order",
        symbol: "XRPUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty: "9.1",
        reduceOnly: true,
        tradeSide: "CLOSE",
        positionId: "662491704776252252",
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    const [, options] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(options.body as string);
    expect(sentBody.tradeSide).toBe("CLOSE");
    expect(sentBody.positionId).toBe("662491704776252252");
  });

  it("omits tradeSide/positionId entirely when not provided (ONE_WAY mode)", async () => {
    await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "place-order",
        symbol: "XRPUSDT",
        side: "SELL",
        orderType: "MARKET",
        qty: "9.1",
        reduceOnly: true,
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    const [, options] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(options.body as string);
    expect(sentBody.tradeSide).toBeUndefined();
    expect(sentBody.positionId).toBeUndefined();
  });
});
