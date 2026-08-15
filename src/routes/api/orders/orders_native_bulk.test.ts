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
});

describe("FEAT-0071: Native Bitunix Bulk & Modify Endpoints (/api/orders)", () => {
  describe("cancel-all", () => {
    it("calls POST /api/v1/futures/trade/cancel_all_orders directly without fetching pending orders", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            code: 0,
            data: { successList: [{ orderId: "1111", clientId: "c1" }], failureList: [] },
            msg: "Success",
          }),
      });

      const response = await POST({
        request: makeRequest({
          exchange: "bitunix",
          type: "cancel-all",
          symbol: "BTCUSDT",
          apiKey: "validApiKey123",
          apiSecret: "validSecret123456",
        }),
        getClientAddress,
      } as unknown as Parameters<typeof POST>[0]);

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/trade/cancel_all_orders");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({ symbol: "BTCUSDT" });
    });

    it("surfaces errors from failureList if any order fails to cancel", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            code: 0,
            data: {
              successList: [],
              failureList: [{ orderId: "1112", clientId: "c2", errorMsg: "Order already filled", errorCode: 10013 }],
            },
            msg: "Success",
          }),
      });

      const response = await POST({
        request: makeRequest({
          exchange: "bitunix",
          type: "cancel-all",
          symbol: "BTCUSDT",
          apiKey: "validApiKey123",
          apiSecret: "validSecret123456",
        }),
        getClientAddress,
      } as unknown as Parameters<typeof POST>[0]);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("Order already filled");
    });
  });

  describe("close-all-positions", () => {
    it("calls POST /api/v1/futures/trade/close_all_position", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ code: 0, data: "", msg: "Success" }),
      });

      const response = await POST({
        request: makeRequest({
          exchange: "bitunix",
          type: "close-all-positions",
          symbol: "ETHUSDT",
          apiKey: "validApiKey123",
          apiSecret: "validSecret123456",
        }),
        getClientAddress,
      } as unknown as Parameters<typeof POST>[0]);

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/trade/close_all_position");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({ symbol: "ETHUSDT" });
    });
  });

  describe("flash-close-position", () => {
    it("calls POST /api/v1/futures/trade/flash_close_position with positionId", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({ code: 0, data: { positionId: "19848247723672" }, msg: "Success" }),
      });

      const response = await POST({
        request: makeRequest({
          exchange: "bitunix",
          type: "flash-close-position",
          positionId: "19848247723672",
          symbol: "BTCUSDT",
          apiKey: "validApiKey123",
          apiSecret: "validSecret123456",
        }),
        getClientAddress,
      } as unknown as Parameters<typeof POST>[0]);

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/trade/flash_close_position");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({ positionId: "19848247723672" });
    });
  });

  describe("order-detail", () => {
    it("calls GET /api/v1/futures/trade/get_order_detail and returns normalized order", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            code: 0,
            data: {
              orderId: "55555",
              clientId: "c555",
              symbol: "SOLUSDT",
              qty: "10",
              tradeQty: "0",
              price: "150.5",
              type: "LIMIT",
              side: "BUY",
              status: "NEW",
              positionMode: "HEDGE",
              marginMode: "ISOLATION",
              leverage: "20",
              tpPrice: "160",
              slPrice: "140",
              ctime: 1700000000000,
            },
            msg: "Success",
          }),
      });

      const response = await POST({
        request: makeRequest({
          exchange: "bitunix",
          type: "order-detail",
          orderId: "55555",
          apiKey: "validApiKey123",
          apiSecret: "validSecret123456",
        }),
        getClientAddress,
      } as unknown as Parameters<typeof POST>[0]);

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain("https://fapi.bitunix.com/api/v1/futures/trade/get_order_detail");
      expect(url).toContain("orderId=55555");
      expect(options.method).toBe("GET");

      const body = await response.json();
      expect(body.orderId).toBe("55555");
      expect(body.symbol).toBe("SOLUSDT");
      expect(body.price).toBe("150.5");
      expect(body.amount).toBe("10");
    });
  });

  describe("modify-order", () => {
    it("calls POST /api/v1/futures/trade/modify_order with parameters", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            code: 0,
            data: { orderId: "55555", clientId: "c555" },
            msg: "Success",
          }),
      });

      const response = await POST({
        request: makeRequest({
          exchange: "bitunix",
          type: "modify-order",
          orderId: "55555",
          symbol: "SOLUSDT",
          qty: "10",
          price: "152.0",
          tpPrice: "165.0",
          slPrice: "142.0",
          apiKey: "validApiKey123",
          apiSecret: "validSecret123456",
        }),
        getClientAddress,
      } as unknown as Parameters<typeof POST>[0]);

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://fapi.bitunix.com/api/v1/futures/trade/modify_order");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({
        orderId: "55555",
        symbol: "SOLUSDT",
        qty: "10",
        price: "152",
        tpPrice: "165",
        slPrice: "142",
      });
    });
  });
});
