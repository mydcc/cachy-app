import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tradeService } from "../services/tradeService";
import { omsService } from "../services/omsService";
import { Decimal } from "decimal.js";

// Mock omsService
vi.mock("../services/omsService", () => ({
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
vi.mock("../services/logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("TradeService - Naked Stop Loss Protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should ABORT closing position if cancelling open orders fails", async () => {
    // 1. Setup Position
    const mockPosition = {
      symbol: "BTCUSDT",
      side: "long",
      amount: new Decimal("0.1"),
      entryPrice: new Decimal("50000"),
      lastUpdated: Date.now(),
    };
    (omsService.getPositions as any).mockReturnValue([mockPosition]);

    // 2. Mock 'cancelAllOrders' to FAIL (Network Error)
    const cancelSpy = vi.spyOn(tradeService, "cancelAllOrders").mockRejectedValue(new Error("Network Error on Cancel"));

    // 3. Mock 'signedRequest' (The Close Order)
    const requestSpy = vi.spyOn(tradeService as any, "signedRequest").mockResolvedValue({ code: 0 });

    // 4. Execute Flash Close
    // We expect it to THROW or at least NOT call the close order
    try {
        await tradeService.flashClosePosition("BTCUSDT", "long");
    } catch (e) {
        // Expected if we implement the fix to throw
    }

    // 5. Assert
    // Current behavior (Bug): It logs error and proceeds -> requestSpy called.
    // Desired behavior (Fix): It aborts -> requestSpy NOT called.
    expect(cancelSpy).toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
