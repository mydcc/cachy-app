import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './+server';
// Mock fetch
global.fetch = vi.fn();
describe('GET /api/klines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should return klines with string properties from Bitunix', async () => {
    const mockKlines = {
      code: 0,
      msg: "success",
      data: [
        {
          id: 1600000000,
          open: "100.5",
          high: "101.0",
          low: "99.0",
          close: "100.0",
          vol: "1000",
        },
        {
          id: 1600000060,
          open: "100.0",
          high: "100.5",
          low: "99.5",
          close: "99.8",
          vol: "500",
        }
      ]
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockKlines),
    });
    const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix');
    const response = await GET({ url } as any);
    const json = await response.json();
    expect(json).toHaveLength(2);
    expect(json[0].open).toBe("100.5");
    expect(json[0].high).toBe("101.0");
    expect(json[0].low).toBe("99.0");
    expect(json[0].close).toBe("100.0");
    expect(json[0].volume).toBe("1000");
    expect(json[0].timestamp).toBe(1600000000);
  });
  it('should handle numeric inputs from Bitunix correctly', async () => {
     const mockKlines = {
      code: 0,
      msg: "success",
      data: [
        {
          id: 1600000000,
          open: 100.5,
          high: 101.0,
          low: 99.0,
          close: 100.0,
          vol: 1000,
        }
      ]
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockKlines),
    });
    const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix');
    const response = await GET({ url } as any);
    const json = await response.json();
    expect(json[0].open).toBe("100.5");
    expect(json[0].high).toBe("101"); // Number(101.0).toString() is "101"
    expect(json[0].low).toBe("99");
    expect(json[0].close).toBe("100");
    expect(json[0].volume).toBe("1000");
  });
  it('should preserve small numbers without scientific notation if string provided', async () => {
    const mockKlines = {
      code: 0,
      msg: "success",
      data: [
        {
          id: 1600000000,
          open: "0.0000001",
          high: "0.0000002",
          low: "0.0000001",
          close: "0.0000001",
          vol: "1000",
        }
      ]
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockKlines),
    });
    const url = new URL('http://localhost/api/klines?symbol=PEPEUSDT&provider=bitunix');
    const response = await GET({ url } as any);
    const json = await response.json();
    expect(json[0].open).toBe("0.0000001");
    // If it was Decimal(x).toString(), it would likely be "1e-7"
  });
  it('should handle Bitget array format', async () => {
    // [[timestamp, open, high, low, close, volume, quoteVol], ...]
    const mockKlines = [
      ["1600000000000", "100.5", "101.0", "99.0", "100.0", "1000", "100000"],
      ["1600000060000", "100.0", "100.5", "99.5", "99.8", "500", "50000"]
    ];
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockKlines),
    });
    const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&provider=bitget');
    const response = await GET({ url } as any);
    const json = await response.json();
    expect(json).toHaveLength(2);
    expect(json[0].open).toBe("100.5");
    expect(json[0].timestamp).toBe(1600000000000);
  });
});
