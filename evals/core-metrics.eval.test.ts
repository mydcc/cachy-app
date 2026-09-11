/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Decimal } from "decimal.js";
import {
  calculateBaseMetrics,
  calculateTotalMetrics,
} from "../src/lib/calculators/core";
import { CONSTANTS } from "../src/lib/constants";
import type { TradeValues } from "../src/stores/types";

interface FixtureCase {
  name: string;
  fn: "calculateBaseMetrics" | "calculateTotalMetrics";
  tradeType: string;
  values: Record<string, unknown> & {
    targets?: Array<{ price: string; percent: string }>;
  };
  expected: Record<string, string> | null;
}

const fixtureUrl = new URL("./fixtures/core-metrics.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), "utf8")) as {
  cases: FixtureCase[];
};

function toValues(raw: FixtureCase["values"]): TradeValues {
  const dec = (key: string, fallback?: string) =>
    new Decimal((raw[key] as string | undefined) ?? fallback ?? "0");

  return {
    accountSize: dec("accountSize"),
    riskPercentage: dec("riskPercentage"),
    entryPrice: dec("entryPrice"),
    stopLossPrice: dec("stopLossPrice"),
    leverage: dec("leverage"),
    fees: dec("fees"),
    entryFees: raw.entryFees === undefined ? undefined : dec("entryFees"),
    exitFees: raw.exitFees === undefined ? undefined : dec("exitFees"),
    maintenanceMarginRate: dec("maintenanceMarginRate"),
    symbol: "BTCUSDT",
    useAtrSl: false,
    atrValue: new Decimal(0),
    atrMultiplier: new Decimal(0),
    targets: (raw.targets ?? []).map((t) => ({
      price: new Decimal(t.price),
      percent: new Decimal(t.percent),
      isLocked: false,
    })),
    totalPercentSold: dec("totalPercentSold"),
  };
}

const baseMetricKeys = [
  "positionSize",
  "requiredMargin",
  "netLoss",
  "breakEvenPrice",
  "liquidationPrice",
  "entryFee",
  "riskAmount",
] as const;

const totalMetricKeys = [
  "totalNetProfit",
  "totalRR",
  "totalFees",
  "maxPotentialProfit",
  "riskAmount",
] as const;

describe("evals: position sizing core (golden fixtures)", () => {
  for (const c of fixture.cases) {
    it(`${c.fn} — ${c.name}`, () => {
      const values = toValues(c.values);

      if (c.fn === "calculateBaseMetrics") {
        const result = calculateBaseMetrics(values, c.tradeType);

        if (c.expected === null) {
          expect(result).toBeNull();
          return;
        }
        expect(result).not.toBeNull();
        for (const key of baseMetricKeys) {
          expect(result![key].toString()).toBe(c.expected[key]);
        }
        return;
      }

      // calculateTotalMetrics needs the base metrics as its input.
      const base = calculateBaseMetrics(values, c.tradeType);
      expect(base).not.toBeNull();
      const targets = values.targets.map((t) => ({
        price: t.price,
        percent: t.percent,
      }));
      const result = calculateTotalMetrics(targets, base!, values, c.tradeType);

      expect(c.expected).not.toBeNull();
      for (const key of totalMetricKeys) {
        expect(result[key].toString()).toBe(c.expected![key]);
      }
    });
  }

  it("covers both trade directions and the per-leg fee path", () => {
    const names = fixture.cases.map((c) => c.name);
    expect(names).toContain("short-basic");
    expect(names).toContain("long-per-leg-maker-taker");
    expect(fixture.cases.some((c) => c.tradeType === CONSTANTS.TRADE_TYPE_SHORT)).toBe(true);
  });
});
