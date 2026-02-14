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


import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tradeService, TradeError, BitunixApiError } from "./tradeService";
import { omsService } from "./omsService";
import { settingsState } from "../stores/settings.svelte";
import { Decimal } from "decimal.js";

// Mock localStorage
const localStorageMock = (function() {
  let store: Record<string, string> = {};
  return {
    getItem: function(key: string) {
      return store[key] || null;
    },
    setItem: function(key: string, value: string) {
      store[key] = value.toString();
    },
    clear: function() {
      store = {};
    },
    removeItem: function(key: string) {
      delete store[key];
    }
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

vi.mock('$app/environment', () => ({
  browser: true,
  dev: true
}));

// Mock settingsState
vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitunix",
        apiKeys: {
            bitunix: { key: "test", secret: "test" }
        }
    }
}));

// Mock Logger to reduce noise
vi.mock("./logger", () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

describe("TradeService Safety - Flash Close", () => {
    beforeEach(() => {
        // Reset OMS
        omsService.reset();
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should retain optimistic order when network failure occurs (Two Generals Problem)", async () => {
        // 1. Setup Position
        const symbol = "BTCUSDT";
        const side = "long";
        const position = {
            symbol,
            side: "long" as const,
            amount: new Decimal("1.5"),
            entryPrice: new Decimal("50000"),
            unrealizedPnl: new Decimal("100"),
            leverage: new Decimal("10"),
            marginMode: "cross" as const,
            lastUpdated: Date.now()
        };
        omsService.updatePosition(position);

        // 2. Mock signedRequest to throw Network Error
        // This simulates a timeout where we don't know if the server got the request
        const spy = vi.spyOn(tradeService as any, "signedRequest").mockRejectedValue(new Error("Network Timeout"));

        // 3. Mock cancelAllOrders (Best Effort) to succeed so we reach the close logic
        // tradeService.cancelAllOrders calls signedRequest too, so we need to handle that.
        // We can mock cancelAllOrders directly to isolate the close logic.
        vi.spyOn(tradeService, "cancelAllOrders").mockResolvedValue(undefined);

        // 4. Execute Flash Close
        try {
            await tradeService.flashClosePosition(symbol, side);
        } catch (e) {
            // Expected error
            expect((e as Error).message).toBe("Network Timeout");
        }

        // 5. Assertions
        const orders = omsService.getAllOrders();
        const optimisticOrder = orders.find(o => o.symbol === symbol && o._isOptimistic);

        expect(optimisticOrder).toBeDefined();
        expect(optimisticOrder?.amount.toString()).toBe("1.5");
        expect(optimisticOrder?._isUnconfirmed).toBe(true); // Should be marked unconfirmed
    });

    it("should remove optimistic order when terminal error occurs (e.g. 400 Bad Request)", async () => {
        // 1. Setup Position
        const symbol = "ETHUSDT";
        const side = "short";
        omsService.updatePosition({
            symbol,
            side,
            amount: new Decimal("10"),
            entryPrice: new Decimal("3000"),
            unrealizedPnl: new Decimal("0"),
            leverage: new Decimal("10"),
            marginMode: "cross",
            lastUpdated: Date.now()
        });

        // 2. Mock signedRequest to throw Terminal Error (BitunixApiError)
        // Simulate "Invalid Qty" or similar
        const apiError = new BitunixApiError(400, "Invalid Quantity");
        vi.spyOn(tradeService as any, "signedRequest").mockRejectedValue(apiError);
        vi.spyOn(tradeService, "cancelAllOrders").mockResolvedValue(undefined);

        // 3. Execute
        try {
            await tradeService.flashClosePosition(symbol, side);
        } catch (e) {
            // Expected
        }

        // 4. Assertions
        const orders = omsService.getAllOrders();
        const optimisticOrder = orders.find(o => o.symbol === symbol && o._isOptimistic);

        // Should be removed because we KNOW it failed
        expect(optimisticOrder).toBeUndefined();
    });

    it("should abort flash close if cancelAllOrders fails", async () => {
        // 1. Setup Position
        const symbol = "BTCUSDT";
        const side = "long";
        const position = {
            symbol,
            side: "long" as const,
            amount: new Decimal("1.0"),
            entryPrice: new Decimal("50000"),
            unrealizedPnl: new Decimal("100"),
            leverage: new Decimal("10"),
            marginMode: "cross" as const,
            lastUpdated: Date.now()
        };
        omsService.updatePosition(position);

        // 2. Mock cancelAllOrders to fail
        vi.spyOn(tradeService, "cancelAllOrders").mockRejectedValue(new Error("API Error"));

        // 3. Spy on signedRequest to ensure it is NOT called
        const requestSpy = vi.spyOn(tradeService as any, "signedRequest");

        // 4. Execute and Expect Error
        await expect(tradeService.flashClosePosition(symbol, side)).rejects.toThrow("trade.closeAbortedSafety");

        // 5. Assert close request was NOT sent
        // Note: spy might be called for cancelAllOrders itself depending on implementation,
        // but here we mocked cancelAllOrders so signedRequest inside it won't be called.
        // We want to ensure the CLOSE request (POST /api/orders with side=SELL) wasn't sent.
        // However, signedRequest is generic.
        // Let's check call count. cancelAllOrders is mocked so it won't call signedRequest.
        expect(requestSpy).not.toHaveBeenCalled();
    });
});
