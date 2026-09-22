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

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage, "long");

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

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage, "short");

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

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage, "long");

    expect(result).not.toBeNull();
    expect(result?.from.toString()).toBe("91");
    expect(result?.tighter).toBe(false);
  });

  // BUG-0504: liquidation === entry. The old geometry inference
  // (`liquidation.lt(entry)`) read this as a short and took the opposite
  // branch (→ 95). The explicit side takes the long branch (→ 105).
  it("liquidation equal to entry follows the explicit side, not the geometry", () => {
    const entry = new Decimal("100");
    const liquidation = new Decimal("100");
    const currentLeverage = new Decimal("10");
    const newLeverage = new Decimal("20");

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage, "long");

    expect(result).not.toBeNull();
    expect(result?.to.toString()).toBe("105");
  });

  // BUG-0504: cross margin. Same triple as the passing long case — every
  // number is valid, yet the isolated formula does not describe cross
  // margin, so no projected price is produced.
  it("returns null for a cross-margin position", () => {
    const entry = new Decimal("100");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("10");
    const newLeverage = new Decimal("20");

    expect(projectLiquidation(entry, liquidation, currentLeverage, newLeverage, "long", "CROSS")).toBeNull();
    expect(projectLiquidation(entry, liquidation, currentLeverage, newLeverage, "long", "cross")).toBeNull();
  });

  // BUG-0504: an unknown side refuses rather than guessing short.
  it("returns null for an unknown side", () => {
    const entry = new Decimal("100");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("10");
    const newLeverage = new Decimal("20");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(projectLiquidation(entry, liquidation, currentLeverage, newLeverage, undefined as any)).toBeNull();
  });

  // Non-finite entry
  it("returns null if entry is non-finite", () => {
    const entry = new Decimal("NaN");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("10");
    const newLeverage = new Decimal("20");

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage, "long");

    expect(result).toBeNull();
  });

  // Zero leverage
  it("returns null if current leverage is zero", () => {
    const entry = new Decimal("100");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("0");
    const newLeverage = new Decimal("20");

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage, "long");

    expect(result).toBeNull();
  });

  // Negative entry
  it("returns null if entry is negative", () => {
    const entry = new Decimal("-100");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("10");
    const newLeverage = new Decimal("20");

    const result = projectLiquidation(entry, liquidation, currentLeverage, newLeverage, "long");

    expect(result).toBeNull();
  });

  // Null inputs
  it("returns null if any parameter is undefined", () => {
    const entry = new Decimal("100");
    const liquidation = new Decimal("91");
    const currentLeverage = new Decimal("10");
    const newLeverage = new Decimal("20");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(projectLiquidation(undefined as any, liquidation, currentLeverage, newLeverage, "long")).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(projectLiquidation(entry, undefined as any, currentLeverage, newLeverage, "long")).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(projectLiquidation(entry, liquidation, undefined as any, newLeverage, "long")).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(projectLiquidation(entry, liquidation, currentLeverage, undefined as any, "long")).toBeNull();
  });
});
