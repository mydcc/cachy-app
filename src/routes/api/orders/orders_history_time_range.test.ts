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
    text: async () => JSON.stringify({ code: 0, data: { orderList: [] }, msg: "Success" }),
  });
});

describe("FEAT-0201: POST /api/orders history time range and pagination", () => {
  it("forwards startTime and endTime to Bitunix query params", async () => {
    const startTime = 1700000000000;
    const endTime = 1700500000000;

    await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "history",
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
        startTime,
        endTime,
        limit: 50,
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain(`startTime=${startTime}`);
    expect(url).toContain(`endTime=${endTime}`);
    expect(url).toContain("limit=50");
  });

  it("filters returned orders strictly within [startTime, endTime]", async () => {
    const startTime = 1700000000000;
    const endTime = 1700500000000;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          code: 0,
          data: {
            orderList: [
              { orderId: "1", symbol: "BTCUSDT", ctime: "1700600000000", qty: "1", price: "50000" }, // After endTime
              { orderId: "2", symbol: "BTCUSDT", ctime: "1700400000000", qty: "1", price: "50000" }, // In range
              { orderId: "3", symbol: "BTCUSDT", ctime: "1700100000000", qty: "1", price: "50000" }, // In range
              { orderId: "4", symbol: "BTCUSDT", ctime: "1699999999999", qty: "1", price: "50000" }, // Before startTime
            ],
          },
          msg: "Success",
        }),
    });

    const response = await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "history",
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
        startTime,
        endTime,
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    const json = await response.json();
    expect(json.orders).toHaveLength(2);
    expect(json.orders[0].id).toBe("2");
    expect(json.orders[1].id).toBe("3");
  });

  it("retrieves a multi-page range completely by cursor-based pagination", async () => {
    // Page 1: orders at 1700500000000 and 1700400000000 (limit 2)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          code: 0,
          data: {
            orderList: [
              { orderId: "ord-1", symbol: "BTCUSDT", ctime: "1700500000000", qty: "1", price: "50000" },
              { orderId: "ord-2", symbol: "BTCUSDT", ctime: "1700400000000", qty: "1", price: "50000" },
            ],
          },
          msg: "Success",
        }),
    });

    const page1Res = await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "history",
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
        startTime: 1700000000000,
        endTime: 1700500000000,
        limit: 2,
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    const page1Json = await page1Res.json();
    expect(page1Json.orders).toHaveLength(2);
    const oldestTime = page1Json.orders[page1Json.orders.length - 1].time; // 1700400000000

    // Page 2: requests with cursor endTime = oldestTime - 1
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          code: 0,
          data: {
            orderList: [
              { orderId: "ord-3", symbol: "BTCUSDT", ctime: "1700300000000", qty: "1", price: "50000" },
              { orderId: "ord-4", symbol: "BTCUSDT", ctime: "1700100000000", qty: "1", price: "50000" },
            ],
          },
          msg: "Success",
        }),
    });

    const page2Res = await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "history",
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
        startTime: 1700000000000,
        endTime: oldestTime - 1,
        limit: 2,
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    const page2Json = await page2Res.json();
    expect(page2Json.orders).toHaveLength(2);

    const allOrders = [...page1Json.orders, ...page2Json.orders];
    expect(allOrders).toHaveLength(4);
    expect(allOrders.map((o) => o.id)).toEqual(["ord-1", "ord-2", "ord-3", "ord-4"]);
  });

  it("works with default parameters when no time range is specified", async () => {
    await POST({
      request: makeRequest({
        exchange: "bitunix",
        type: "history",
        apiKey: "validApiKey123",
        apiSecret: "validSecret123456",
      }),
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).not.toContain("startTime");
    expect(url).not.toContain("endTime");
    expect(url).toContain("limit=50");
  });
});
