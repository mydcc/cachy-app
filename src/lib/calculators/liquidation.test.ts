import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { projectLiquidation } from "./liquidation";

describe("projectLiquidation", () => {
  // Bitunix-calibrated test: entry 100, lev 10, liq 91 → MMR 0.01
  // At 20x: liq should be 96 (tighter, less room before liquidation)
  it("long position: calibrated against Bitunix numbers", () => {
    const entry = new Decimal("100");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("10");
    const newLeverage = new Decimal("20");

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage);

    expect(result).not.toBeNull();
    expect(result?.from.toString()).toBe("91");
    expect(result?.to.toString()).toBe("96");
    expect(result?.tighter).toBe(true);
  });

  // Short position: entry 100, lev 10, liq 110 → MMR 0.01
  // At 20x: liq should be 105 (tighter)
  it("short position: calibrated against Bitunix numbers", () => {
    const entry = new Decimal("100");
    const liquidation = new Decimal("110");
    const currentLeverage = new Decimal("10");
    const newLeverage = new Decimal("20");

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage);

    expect(result).not.toBeNull();
    expect(result?.from.toString()).toBe("110");
    expect(result?.to.toString()).toBe("105");
    expect(result?.tighter).toBe(true);
  });

  // Reducing leverage should loosen (move away from entry)
  it("reducing leverage loosens room", () => {
    const entry = new Decimal("100");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("20");
    const newLeverage = new Decimal("10");

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage);

    expect(result).not.toBeNull();
    expect(result?.from.toString()).toBe("91");
    expect(result?.tighter).toBe(false);
  });

  // Non-finite entry
  it("returns null if entry is non-finite", () => {
    const entry = new Decimal("NaN");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("10");
    const newLeverage = new Decimal("20");

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage);

    expect(result).toBeNull();
  });

  // Zero leverage
  it("returns null if current leverage is zero", () => {
    const entry = new Decimal("100");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("0");
    const newLeverage = new Decimal("20");

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage);

    expect(result).toBeNull();
  });

  // Negative entry
  it("returns null if entry is negative", () => {
    const entry = new Decimal("-100");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("10");
    const newLeverage = new Decimal("20");

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage);

    expect(result).toBeNull();
  });

  // Null inputs
  it("returns null if any parameter is undefined", () => {
    const entry = new Decimal("100");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("10");
    const newLeverage = new Decimal("20");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(projectLiquidation(undefined as any, liquidation, currentLeverage, newLeverage)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(projectLiquidation(entry, undefined as any, currentLeverage, newLeverage)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(projectLiquidation(entry, liquidation, undefined as any, newLeverage)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(projectLiquidation(entry, liquidation, currentLeverage, undefined as any)).toBeNull();
  });
});
