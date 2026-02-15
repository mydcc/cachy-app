import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchKlinesFromBitunix } from "./apiUtils";

// Mock global fetch
global.fetch = vi.fn();

describe("fetchKlinesFromBitunix", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should fetch and map klines correctly", async () => {
    const mockResponse = {
      code: 0,
      data: [
        { id: 1700000000, open: "50000", high: "51000", low: "49000", close: "50500", vol: "100" },
        { id: 1700000060, open: "50500", high: "51500", low: "50000", close: "51000", vol: "120" }
      ]
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponse)
    });

    const result = await fetchKlinesFromBitunix("BTCUSDT", "1m", 10);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      timestamp: 1700000000,
      open: "50000",
      high: "51000",
      low: "49000",
      close: "50500",
      volume: "100"
    });
    // Check order (Bitunix returns desc, function reverses to asc if needed)
    // Here our mock data is asc by time (id).
    // The utility reverses if desc. Let's see behavior.
    // If input is asc (170...00, 170...60), then result[0].timestamp < result[1].timestamp.
    // The utility checks: `if (mapped.length > 1 && Number(mapped[0].timestamp) > Number(mapped[mapped.length - 1].timestamp)) { mapped.reverse(); }`
    // So if input is ASC, it stays ASC. If input is DESC, it becomes ASC.
    // Result should be ASC.
    expect(Number(result[0].timestamp)).toBeLessThan(Number(result[1].timestamp));
  });

  it("should throw error on invalid JSON", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => "Invalid JSON"
    });

    await expect(fetchKlinesFromBitunix("BTCUSDT", "1m", 10)).rejects.toThrow("Invalid API response format");
  });

  it("should throw error on API error code", async () => {
    const mockResponse = {
      code: 1001,
      msg: "System Error"
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponse)
    });

    // The function might throw "Symbol not found" if code != 0 logic is broad,
    // but here we expect generic API error for unknown code.
    // Wait, the logic in apiUtils.ts:
    // if (data.code !== 0 ...) {
    //   if (data.code === 2 || data.code === "2" || (data.msg && data.msg.toLowerCase().includes("system error")))
    //     throw new Error("Symbol not found");
    // }
    // "System Error" in msg triggers "Symbol not found"!
    // Let's use a different error message to test generic error handling.

    const mockResponseGeneric = {
        code: 1001,
        msg: "Generic Failure"
    };
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponseGeneric)
    });

    await expect(fetchKlinesFromBitunix("BTCUSDT", "1m", 10)).rejects.toThrow("Bitunix API error: Generic Failure");
  });

  it("should throw 404 on specific Bitunix error code 2", async () => {
    const mockResponse = {
        code: 2,
        msg: "Symbol not found"
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponse)
    });

    try {
        await fetchKlinesFromBitunix("INVALID", "1m", 10);
        expect.fail("Should have thrown");
    } catch (e: any) {
        expect(e.status).toBe(404);
        expect(e.message).toBe("Symbol not found");
    }
  });
});
