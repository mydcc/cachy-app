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
import { tradeService } from "./tradeService";
import { omsService } from "./omsService";
import { Decimal } from "decimal.js";
import type { NormalizedOrder } from "./types";

vi.mock("./omsService", () => ({
  omsService: {
    getPositions: vi.fn(),
    updatePosition: vi.fn(),
    addOptimisticOrder: vi.fn(),
    removeOrder: vi.fn(),
    getOrder: vi.fn(),
    updateOrder: vi.fn(),
  },
}));

vi.mock("../stores/settings.svelte", () => ({
  settingsState: {
    apiProvider: "bitunix",
    apiKeys: {
      bitunix: { key: "test-key", secret: "test-secret" },
    },
    appAccessToken: "test-token",
    secretsReady: Promise.resolve(),
  },
}));

vi.mock("../stores/market.svelte", async () => {
  const { Decimal } = await import("decimal.js");
  return {
    marketState: {
      data: {
        BTCUSDT: { lastPrice: new Decimal(60000) },
        SOLUSDT: { lastPrice: new Decimal(150) },
      },
    },
  };
});

vi.mock("./logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}));

vi.mock("./toastService.svelte", () => ({
  toastService: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

describe("FEAT-0071: TradeService Native Endpoints & Safe Modify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("cancelAllOrders", () => {
    it("issues a single request with type=cancel-all and symbol", async () => {
      const signedRequestSpy = vi
        .spyOn(tradeService, "signedRequest")
        .mockResolvedValue({ successList: [], failureList: [] });

      await tradeService.cancelAllOrders("BTCUSDT");

      expect(signedRequestSpy).toHaveBeenCalledTimes(1);
      expect(signedRequestSpy).toHaveBeenCalledWith("POST", "/api/orders", {
        symbol: "BTCUSDT",
        type: "cancel-all",
      });
    });

    it("issues a single request with type=cancel-all without symbol", async () => {
      const signedRequestSpy = vi
        .spyOn(tradeService, "signedRequest")
        .mockResolvedValue({ successList: [], failureList: [] });

      await tradeService.cancelAllOrders();

      expect(signedRequestSpy).toHaveBeenCalledTimes(1);
      expect(signedRequestSpy).toHaveBeenCalledWith("POST", "/api/orders", {
        symbol: undefined,
        type: "cancel-all",
      });
    });
  });

  describe("closeAllPositions", () => {
    it("issues a single request with type=close-all-positions without client-side position loops", async () => {
      const signedRequestSpy = vi
        .spyOn(tradeService, "signedRequest")
        .mockResolvedValue({ success: true });

      await tradeService.closeAllPositions("BTCUSDT");

      expect(signedRequestSpy).toHaveBeenCalledTimes(1);
      expect(signedRequestSpy).toHaveBeenCalledWith("POST", "/api/orders", {
        type: "close-all-positions",
        symbol: "BTCUSDT",
      });
      // Verify no OMS iteration occurred
      expect(omsService.getPositions).not.toHaveBeenCalled();
    });
  });

  describe("flashClosePosition", () => {
    it("targets positionId natively using flash-close-position", async () => {
      vi.mocked(omsService.getPositions).mockReturnValue([
        {
          symbol: "BTCUSDT",
          side: "long",
          amount: new Decimal(1.5),
          lastUpdated: Date.now(),
          positionId: "pos-123456",
          positionMode: "hedge",
        },
      ]);

      const signedRequestSpy = vi
        .spyOn(tradeService, "signedRequest")
        .mockImplementation(async (_method, _url, body) => {
          if (body.type === "cancel-all") return { successList: [], failureList: [] };
          if (body.type === "flash-close-position") return { positionId: "pos-123456" };
          return {};
        });

      const result = await tradeService.flashClosePosition("BTCUSDT", "long");

      expect(result.success).toBe(true);
      expect(signedRequestSpy).toHaveBeenCalledWith("POST", "/api/orders", {
        type: "flash-close-position",
        symbol: "BTCUSDT",
        positionId: "pos-123456",
      });
    });
  });

  describe("getOrderDetail & modifyOrder (Safe Modify)", () => {
    it("getOrderDetail calls /api/orders with type=order-detail", async () => {
      const mockOrder = {
        id: "order-999",
        orderId: "order-999",
        symbol: "SOLUSDT",
        price: "150",
        amount: "5",
        status: "NEW",
      };

      const signedRequestSpy = vi
        .spyOn(tradeService, "signedRequest")
        .mockResolvedValue(mockOrder);

      const res = await tradeService.getOrderDetail("order-999");
      expect(res).toEqual(mockOrder);
      expect(signedRequestSpy).toHaveBeenCalledWith("POST", "/api/orders", {
        type: "order-detail",
        orderId: "order-999",
        clientId: undefined,
      });
    });

    it("modifyOrder uses Safe Modify pattern: fetches live order first, merges parameters, and sends modify-order preserving order ID", async () => {
      const liveOrder = {
        id: "order-999",
        orderId: "order-999",
        clientId: "client-abc",
        symbol: "SOLUSDT",
        price: "150.0",
        amount: "5.0",
        type: "LIMIT",
        side: "BUY",
        status: "NEW",
        tpPrice: "160.0",
        tpStopType: "MARK_PRICE",
        tpOrderType: "LIMIT",
        slPrice: "140.0",
        slStopType: "MARK_PRICE",
        slOrderType: "MARKET",
      };

      const getOrderDetailSpy = vi
        .spyOn(tradeService, "getOrderDetail")
        .mockResolvedValue(liveOrder as unknown as NormalizedOrder);

      const signedRequestSpy = vi
        .spyOn(tradeService, "signedRequest")
        .mockResolvedValue({ orderId: "order-999", clientId: "client-abc" });

      // Modify only TP/SL — qty and price must be merged from live order
      const result = await tradeService.modifyOrder({
        orderId: "order-999",
        tpPrice: "165.0",
        slPrice: "142.0",
      });

      expect(getOrderDetailSpy).toHaveBeenCalledWith("order-999", undefined);
      expect(signedRequestSpy).toHaveBeenCalledWith("POST", "/api/orders", {
        type: "modify-order",
        orderId: "order-999",
        clientId: "client-abc",
        symbol: "SOLUSDT",
        qty: "5.0", // from live order
        price: "150.0", // from live order
        tpPrice: "165", // updated (formatApiNum strips trailing zero)
        tpStopType: "MARK_PRICE", // preserved
        tpOrderType: "LIMIT", // preserved
        slPrice: "142", // updated (formatApiNum strips trailing zero)
        slStopType: "MARK_PRICE", // preserved
        slOrderType: "MARKET", // preserved
      });
      expect(result).toEqual({ orderId: "order-999", clientId: "client-abc" });
    });

    it("modifyOrder allows modifying price and quantity without losing order ID", async () => {
      const liveOrder = {
        id: "order-999",
        orderId: "order-999",
        clientId: "client-abc",
        symbol: "SOLUSDT",
        price: "150.0",
        amount: "5.0",
        status: "NEW",
      };

      vi.spyOn(tradeService, "getOrderDetail").mockResolvedValue(liveOrder as unknown as NormalizedOrder);

      const signedRequestSpy = vi
        .spyOn(tradeService, "signedRequest")
        .mockResolvedValue({ orderId: "order-999", clientId: "client-abc" });

      await tradeService.modifyOrder({
        orderId: "order-999",
        qty: new Decimal(10),
        price: new Decimal(148.5),
      });

      expect(signedRequestSpy).toHaveBeenCalledWith(
        "POST",
        "/api/orders",
        expect.objectContaining({
          type: "modify-order",
          orderId: "order-999",
          clientId: "client-abc",
          symbol: "SOLUSDT",
          qty: "10",
          price: "148.5",
        })
      );
    });
  });
});
