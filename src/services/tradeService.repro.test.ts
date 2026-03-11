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
import { tradeService } from "./tradeService";
import { omsService } from "./omsService";
import { Decimal } from "decimal.js";

// Mock omsService
vi.mock("./omsService", () => ({
  omsService: {
    getPositions: vi.fn(),
    addOptimisticOrder: vi.fn(),
    removeOrder: vi.fn(),
    getOrder: vi.fn(),
    updateOrder: vi.fn(),
  },
}));

// Mock marketState
vi.mock("../stores/market.svelte", async () => {
  const { Decimal } = await import("decimal.js");
  return {
    marketState: {
      data: {
        "BTCUSDT": {
          lastPrice: new Decimal("52000")
        }
      }
    }
  };
});

// Mock logger to suppress noise
vi.mock("./logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock signedRequest to avoid network calls
vi.spyOn(tradeService as any, "signedRequest").mockResolvedValue({ code: 0 });

describe("TradeService - FlashClose Reproduction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create an optimistic order with 0 price (Bug Reproduction)", async () => {
    // Setup: Mock a position exists
    const mockPosition = {
      symbol: "BTCUSDT",
      side: "long",
      amount: new Decimal("0.1"),
      entryPrice: new Decimal("50000"),
      lastUpdated: Date.now(),
    };

    (omsService.getPositions as any).mockReturnValue([mockPosition]);

    // Execute
    await tradeService.flashClosePosition("BTCUSDT", "long");

    // Assert: Verify addOptimisticOrder was called
    expect(omsService.addOptimisticOrder).toHaveBeenCalled();

    const callArgs = (omsService.addOptimisticOrder as any).mock.calls[0][0];

    // THE FIX: Price should be the current market price (52000 from mock)
    expect(callArgs.price).toBeDefined();
    const price = new Decimal(callArgs.price);
    expect(price.isZero()).toBe(false);
    expect(price.toNumber()).toBe(52000);
  });
});
