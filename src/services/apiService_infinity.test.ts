import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks
vi.mock("./logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// Mock RequestManager to immediately invoke tasks and bypass fetch queue latency/retries
vi.mock("./requestManager", () => ({
  requestManager: {
      schedule: vi.fn().mockImplementation((key, fn) => fn())
  }
}));

// We also need to mock apiService.safeJson if we mock fetch natively, or we can just let safeJson process
// Actually, fetch was returning {ok: true, text: ...}. safeJson calls text() and parses.

vi.mock("../utils/utils", async () => {
    const original = await vi.importActual("../utils/utils") as any;
    return {
        ...original,
        // Optional: mock anything needed
    }
});

// Import module under test after defining mocks
import { apiService } from "./apiService";

describe("ApiService - Kline Infinity Issue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("should silently drop klines with Infinity", async () => {
    const mockResponse = [
        ["1700000000000", "50000", "50100", "49900", "50050", "1.5"],
        ["1700000060000", "Infinity", "50200", "50000", "50100", "1.0"],
        ["1700000120000", "50100", "50300", "50050", "50200", "2.0"],
    ];

    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify(mockResponse),
    });

    const klines = await apiService.fetchBitgetKlines("BTCUSDT", "1m", 15, undefined, undefined, "normal", 10000);

    expect(klines.length).toBe(2);
    expect(klines[0].time).toBe(1700000000000);
    expect(klines[1].time).toBe(1700000120000);
  });
});
