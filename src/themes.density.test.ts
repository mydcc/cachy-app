/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * FEAT-0614 — density is a token override on <html>, not a component branch.
 *
 * These cases pin the two things that would make the modes a lie: a mode that
 * does not reach a rendered control, and a mode that changes an output. The
 * first is measured through `getComputedStyle` (happy-dom resolves the var
 * chains); the second through the calculator, which never reads the setting.
 */

// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { Decimal } from "decimal.js";
import { beforeEach, describe, expect, it } from "vitest";
import { calculateBaseMetrics } from "./lib/calculators/core";
import type { TradeValues } from "./stores/types";
import { settingsState } from "./stores/settings.svelte";
import { defaultSettings } from "./stores/settings/settingsTypes";

const CSS = readFileSync("src/themes.css", "utf8");

function renderInput(): HTMLInputElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = `<input class="input-field" />`;
  return document.querySelector("input")!;
}

function setDensity(mode: "compact" | "default" | "wide" | null): void {
  if (mode === null) delete document.documentElement.dataset.density;
  else document.documentElement.dataset.density = mode;
}

const VALUES: TradeValues = {
  accountSize: new Decimal(10000),
  riskPercentage: new Decimal(1),
  entryPrice: new Decimal(100),
  leverage: new Decimal(10),
  fees: new Decimal(0.06),
  symbol: "BTCUSDT",
  useAtrSl: false,
  atrValue: new Decimal(0),
  atrMultiplier: new Decimal(0),
  stopLossPrice: new Decimal(95),
  targets: [{ price: new Decimal(110), percent: new Decimal(100), isLocked: false }],
  totalPercentSold: new Decimal(100),
};

beforeEach(() => {
  delete document.documentElement.dataset.density;
  settingsState.density = defaultSettings.density;
});

describe("density reaches a rendered control (FEAT-0614)", () => {
  it.each([
    ["compact", "32px"],
    ["default", "42px"],
    ["wide", "48px"],
  ] as const)("renders .input-field at %s's height", (mode, expected) => {
    const input = renderInput();
    setDensity(mode === "default" ? null : mode);

    expect(getComputedStyle(input).height).toBe(expected);
  });

  it("moves the section rhythm with the same attribute", () => {
    renderInput();

    setDensity("compact");
    const compact = getComputedStyle(document.documentElement)
      .getPropertyValue("--density-section-gap")
      .trim();

    setDensity("wide");
    const wide = getComputedStyle(document.documentElement)
      .getPropertyValue("--density-section-gap")
      .trim();

    expect(compact).toBe("0.5rem");
    expect(wide).toBe("1rem");
  });
});

describe("density changes no result (FEAT-0614)", () => {
  it("computes identical base metrics in all three modes", () => {
    const results = (["compact", "default", "wide"] as const).map((mode) => {
      settingsState.density = mode;
      const metrics = calculateBaseMetrics(VALUES, "long");
      return {
        positionSize: metrics?.positionSize.toString(),
        requiredMargin: metrics?.requiredMargin.toString(),
        netLoss: metrics?.netLoss.toString(),
        breakEven: metrics?.breakEvenPrice.toString(),
        liquidation: metrics?.liquidationPrice.toString(),
      };
    });

    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0].positionSize).toBe("20");
  });
});
