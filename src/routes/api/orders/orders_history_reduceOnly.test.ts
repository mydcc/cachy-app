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
import { signedEnvelopeRequest } from "../../../tests/helpers/signedEnvelopeRequest";
import { buildOrdersHistoryQueryParams } from "../../../utils/exchange/venueQueries";

// Regression: Bitunix's get_history_orders response carries `reduceOnly`
// (docs/bitunix-api/07_trade.md), but the route dropped it when building
// NormalizedOrder — History never showed which orders were reduce-only
// (see FEAT-0057).

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const getClientAddress = () => "127.0.0.1";

async function historyRequest() {
  const payload = { exchange: "bitunix", type: "history" };
  return signedEnvelopeRequest(
    "/api/orders?action=history",
    payload,
    buildOrdersHistoryQueryParams("bitunix", payload),
    "bitunix",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
});

describe("POST /api/orders history maps reduceOnly", () => {
  it("carries reduceOnly through for a reduce-only order", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          code: 0,
          data: {
            orderList: [
              {
                orderId: "1", symbol: "BTCUSDT", type: "MARKET", side: "SELL",
                price: "0", qty: "1", tradeQty: "1", status: "FILLED",
                reduceOnly: true, ctime: 1700000000000,
              },
            ],
          },
          msg: "Success",
        }),
    });

    const { request, url } = await historyRequest();
    const res = await POST({
      request,
      url,
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    const body = await res.json();
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0].reduceOnly).toBe(true);
  });

  it("defaults reduceOnly to false when the exchange omits it", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          code: 0,
          data: {
            orderList: [
              {
                orderId: "2", symbol: "BTCUSDT", type: "LIMIT", side: "BUY",
                price: "50000", qty: "1", tradeQty: "1", status: "FILLED",
                ctime: 1700000000000,
              },
            ],
          },
          msg: "Success",
        }),
    });

    const { request, url } = await historyRequest();
    const res = await POST({
      request,
      url,
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    const body = await res.json();
    expect(body.orders[0].reduceOnly).toBe(false);
  });
});
