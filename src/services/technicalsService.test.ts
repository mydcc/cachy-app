import { describe, it, expect, vi } from "vitest";
import { Decimal } from "decimal.js";

// Mock talib-web before importing service
vi.mock("talib-web", () => {
  return {
    init: vi.fn().mockResolvedValue(true),
    RSI: vi.fn().mockResolvedValue({ output: Array(100).fill(50) }),
    STOCH: vi.fn().mockResolvedValue({
      slowK: Array(100).fill(50),
      slowD: Array(100).fill(50),
    }),
    CCI: vi.fn().mockResolvedValue({ output: Array(100).fill(100) }),
    ADX: vi.fn().mockResolvedValue({ output: Array(100).fill(25) }),
    PLUS_DI: vi.fn().mockResolvedValue({ output: Array(100).fill(20) }),
    MINUS_DI: vi.fn().mockResolvedValue({ output: Array(100).fill(10) }),
    MOM: vi.fn().mockResolvedValue({ output: Array(100).fill(10) }),
    MACD: vi.fn().mockResolvedValue({
      MACD: Array(100).fill(1),
      MACDSignal: Array(100).fill(0.5),
      MACDHist: Array(100).fill(0.5),
    }),
    EMA: vi.fn().mockResolvedValue({ output: Array(100).fill(100) }),
    SMA: vi.fn().mockResolvedValue({ output: Array(100).fill(100) }),
  };
});

import { technicalsService } from "./technicalsService";

function generateKlines(count: number) {
  const klines = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    if (i < 20) price += 1;
    else if (i < 30) price -= 2;
    else price += 2;

    klines.push({
      open: new Decimal(price - 1),
      high: new Decimal(price + 2),
      low: new Decimal(price - 2),
      close: new Decimal(price),
      volume: new Decimal(1000),
      time: Date.now() + i * 60000,
    });
  }
  return klines;
}

describe("technicalsService", () => {
  it("should calculate new oscillators correctly", async () => {
    const klines = generateKlines(250);
    // Force talibReady true to use JS fallbacks in test environment
    technicalsService.setTalibReady(true);
    const result = await technicalsService.calculateTechnicals(klines);

    expect(result).toBeDefined();
    expect(result.oscillators).toBeDefined();

    const cci = result.oscillators.find((o) => o.name === "CCI");
    expect(cci).toBeDefined();
    expect(Decimal.isDecimal(cci?.value)).toBe(true);

    const adx = result.oscillators.find((o) => o.name === "ADX");
    expect(adx).toBeDefined();
    expect(Decimal.isDecimal(adx?.value)).toBe(true);

    const ao = result.oscillators.find((o) => o.name === "Awesome Osc.");
    expect(ao).toBeDefined();
    expect(Decimal.isDecimal(ao?.value)).toBe(true);

    const mom = result.oscillators.find((o) => o.name === "Momentum");
    expect(mom).toBeDefined();
    expect(Decimal.isDecimal(mom?.value)).toBe(true);
  });

  it("should respect custom settings", async () => {
    const klines = generateKlines(250);
    // Note: 'length' in ADX is mapped to 'adxSmoothing' in our migration logic in store,
    // but here we pass raw object. TechnicalsService expects 'adxSmoothing' now.
    // We simulate the migrated object here.
    const settings: any = {
      cci: { length: 10, threshold: 50 },
      adx: { adxSmoothing: 10, diLength: 10, threshold: 20 },
      ao: { fastLength: 2, slowLength: 5 },
      momentum: { length: 5, source: "close" },
    };

    // Force talibReady true to use JS fallbacks in test environment
    technicalsService.setTalibReady(true);

    const result = await technicalsService.calculateTechnicals(
      klines,
      settings,
    );

    // Verify CCI params
    const cci = result.oscillators.find((o) => o.name === "CCI");
    expect(cci).toBeDefined();
    expect(cci?.params).toBe("10");

    // Verify ADX params
    const adx = result.oscillators.find((o) => o.name === "ADX");
    expect(adx).toBeDefined();
    expect(adx?.params).toBe("10");

    // Verify Momentum params
    const mom = result.oscillators.find((o) => o.name === "Momentum");
    expect(mom).toBeDefined();
    expect(mom?.params).toBe("5");

    // Verify Awesome Osc params
    const ao = result.oscillators.find((o) => o.name === "Awesome Osc.");
    expect(ao).toBeDefined();
    expect(ao?.params).toBe("2, 5");
  });
});
