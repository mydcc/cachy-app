import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Decimal } from "decimal.js";

// Hoist mocks
vi.mock("./logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() }
}));

vi.mock("../stores/settings.svelte", () => ({
  settingsState: { apiProvider: "bitunix", ...migrateAccounts({ apiKeys: { bitunix: { key: "foo", secret: "bar" } } }) }
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
const signedFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../utils/exchange/browserSigning", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../utils/exchange/browserSigning")>();
    return { ...actual, exchangeSignedFetch: signedFetchMock };
});

/** "The venue reports no open position" — the state both stubs are asserting. */
function venueReportsNoPositions() {
    signedFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ code: "0", data: [], msg: "success" }),
        json: async () => ({ code: "0", data: { positions: [] }, msg: "success" }),
    });
}

import { tradeService, TRADE_ERRORS } from "./tradeService";
import { omsService } from "./omsService";

describe("TradeService - Error Constants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Implementations are set per test (`venueReportsNoPositions`), so a
    // stub must not survive into the next one: `clearAllMocks` wipes calls,
    // not implementations — a later test expecting a different venue payload
    // would silently inherit the empty-venue stub.
    signedFetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should throw TRADE_ERRORS.POSITION_NOT_FOUND when position is missing in closePosition", async () => {
    // Both cache check and fallback throw if no position exists
    vi.mocked(omsService.getPositions).mockReturnValue([]);
    // FEAT-0342: the venue read behind this fallback moved into
    // ./trade/positionLifecycle, and the module calls its own refresh rather
    // than the facade's delegate -- so stubbing a private method no longer
    // reaches it. Stub the transport instead, which is the seam the extraction
    // preserved and what "the venue reports no position" actually means.
    venueReportsNoPositions();

    await expect(tradeService.closePosition({ symbol: "BTCUSDT", positionSide: "long" }))
      .rejects.toThrow(TRADE_ERRORS.POSITION_NOT_FOUND);
  });

  it("should throw apiErrors.invalidAmount when amount is missing in closePosition", async () => {
    vi.mocked(omsService.getPositions).mockReturnValue([
      { symbol: "BTCUSDT", side: "long", amount: new Decimal(1), lastUpdated: Date.now() }
    ]);

    await expect(tradeService.closePosition({ symbol: "BTCUSDT", positionSide: "long", forceFullClose: false }))
      .rejects.toThrow("apiErrors.invalidAmount"); // Currently it's throwing this incorrectly
  });
});
