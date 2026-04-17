import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Decimal } from "decimal.js";

// Hoist mocks
vi.mock("./logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() }
}));

vi.mock("../stores/settings.svelte", () => ({
  settingsState: { apiProvider: "bitunix", apiKeys: { bitunix: { key: "foo", secret: "bar" } } }
}));

vi.mock("./omsService", () => {
  return {
    omsService: {
      getPositions: vi.fn()
    }
  };
});

vi.mock("./toastService.svelte", () => ({
    toastService: {
        error: vi.fn(),
        add: vi.fn()
    }
}));


// Import module under test after defining mocks
import { tradeService, TRADE_ERRORS } from "./tradeService";
import { omsService } from "./omsService";

describe("TradeService - Error Constants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should throw TRADE_ERRORS.POSITION_NOT_FOUND when position is missing in closePosition", async () => {
    // Both cache check and fallback throw if no position exists
    (omsService.getPositions as any).mockReturnValue([]);
    // Mock the API fallback to also return empty positions
    vi.spyOn(tradeService as any, "fetchOpenPositionsFromApi").mockResolvedValue(undefined);

    await expect(tradeService.closePosition({ symbol: "BTCUSDT", positionSide: "long" }))
      .rejects.toThrow(TRADE_ERRORS.POSITION_NOT_FOUND);
  });

  it("should throw apiErrors.invalidAmount when amount is missing in closePosition", async () => {
    (omsService.getPositions as any).mockReturnValue([
      { symbol: "BTCUSDT", side: "long", amount: new Decimal(1), lastUpdated: Date.now() }
    ]);

    await expect(tradeService.closePosition({ symbol: "BTCUSDT", positionSide: "long", forceFullClose: false }))
      .rejects.toThrow("apiErrors.invalidAmount"); // Currently it's throwing this incorrectly
  });
});
