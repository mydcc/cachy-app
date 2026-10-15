// @vitest-environment happy-dom
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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("$app/env", () => ({
  browser: true,
  dev: true,
}));

import { tradeCalculator } from "./tradeCalculator.svelte";
import { tradeState } from "../stores/trade.svelte";

/**
 * The watcher no longer throttles on time. It reacts to a change of the
 * *input surface* (`inputKey`) and coalesces changes within one task into a
 * single microtask calculation. The cases below pin the three properties that
 * replaced the timer:
 *
 * 1. a separate input change recalculates immediately (no 250 ms wait),
 * 2. several changes in one task collapse into one calculation of the final
 *    state,
 * 3. the calculation cannot re-trigger itself through its own write-backs,
 *    because the derived side of a two-way field is not part of the key.
 */
async function flush() {
  // Two turns: one for Svelte's effect flush, one for the queued calculation.
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

describe("TradeCalculator trigger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Seed required fields so the validation gate in runCalculation() passes.
    tradeState.accountSize = "1000";
    tradeState.entryPrice = "50000";
    tradeState.symbol = "BTCUSDT";
    tradeState.tradeType = "long";
    tradeState.riskPercentage = "1";
    tradeState.riskAmount = "10";
    tradeState.isRiskAmountLocked = false;
    tradeState.isPositionSizeLocked = false;
    tradeState.useAtrSl = false;
    tradeState.targets = [{ price: null, percent: "100", isLocked: false }];
    tradeCalculator.destroy();
  });

  afterEach(() => {
    tradeCalculator.destroy();
    vi.useRealTimers();
  });

  it("recalculates on each separate input change without a timer", async () => {
    const calc = vi.fn();
    tradeCalculator.init(calc);
    await flush();
    calc.mockClear();

    tradeState.riskPercentage = "2";
    await flush();
    expect(calc).toHaveBeenCalledTimes(1);

    tradeState.riskPercentage = "3";
    await flush();
    expect(calc).toHaveBeenCalledTimes(2);
  });

  it("collapses changes within one task into a single calculation of the final state", async () => {
    const captured: string[] = [];
    tradeCalculator.init(() => captured.push(tradeState.riskPercentage));
    await flush();
    captured.length = 0;

    tradeState.riskPercentage = "2";
    tradeState.riskPercentage = "3";
    tradeState.riskPercentage = "4";
    await flush();

    expect(captured).toEqual(["4"]);
  });

  it("does not recalculate from its own write-back to the derived risk amount", async () => {
    const calc = vi.fn(() => {
      // The calculation writes the derived side of the pair back to the store.
      tradeState.riskAmount = String(Number(tradeState.riskAmount) + 5);
    });
    tradeCalculator.init(calc);
    await flush();
    calc.mockClear();

    tradeState.riskPercentage = "2";
    await flush();
    await flush();

    expect(calc).toHaveBeenCalledTimes(1);
  });

  it("does not recalculate from a write-back to the derived risk percentage", async () => {
    tradeState.isRiskAmountLocked = true;
    const calc = vi.fn(() => {
      tradeState.riskPercentage = String(Number(tradeState.riskPercentage) + 1);
    });
    tradeCalculator.init(calc);
    await flush();
    calc.mockClear();

    tradeState.riskAmount = "25";
    await flush();
    await flush();

    expect(calc).toHaveBeenCalledTimes(1);
  });

  it("treats the stop loss as an input only outside ATR mode", async () => {
    const calc = vi.fn();
    tradeCalculator.init(calc);
    await flush();
    calc.mockClear();

    tradeState.stopLossPrice = "49000";
    await flush();
    expect(calc).toHaveBeenCalledTimes(1);

    tradeState.useAtrSl = true;
    tradeState.atrValue = "100";
    tradeState.atrMultiplier = "1.5";
    await flush();
    calc.mockClear();

    // In ATR mode the stop is a result, so a derived write must not re-trigger.
    tradeState.stopLossPrice = "48000";
    await flush();
    await flush();
    expect(calc).not.toHaveBeenCalled();

    // ...but the ATR inputs themselves still are inputs.
    tradeState.atrValue = "200";
    await flush();
    expect(calc).toHaveBeenCalledTimes(1);
  });

  it("does not recalculate when the input surface is unchanged", async () => {
    const calc = vi.fn();
    tradeCalculator.init(calc);
    await flush();
    calc.mockClear();

    tradeState.riskPercentage = "2";
    await flush();
    expect(calc).toHaveBeenCalledTimes(1);

    tradeState.riskPercentage = "2"; // same value, same key
    await flush();
    expect(calc).toHaveBeenCalledTimes(1);
  });

  it("destroy() drops a calculation queued for the current task", async () => {
    const calc = vi.fn();
    tradeCalculator.init(calc);
    await flush();
    calc.mockClear();

    tradeState.riskPercentage = "2";
    tradeCalculator.destroy();
    await flush();

    expect(calc).not.toHaveBeenCalled();
  });
});
