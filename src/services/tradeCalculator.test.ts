// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
}));

import { tradeCalculator } from "./tradeCalculator.svelte";
import { tradeState } from "../stores/trade.svelte";

/**
 * BUG-0360: the throttle used to hard-drop mutations inside the 250ms
 * window without scheduling a trailing execution, so the displayed
 * calculation could permanently lag the final typed value.
 */
describe("TradeCalculator throttle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Seed required fields so the validation gate in executeCalculation()
    // passes; riskPercentage is a string in tradeState.
    tradeState.accountSize = "1000";
    tradeState.entryPrice = "50000";
    tradeState.symbol = "BTCUSDT";
    tradeState.tradeType = "long";
    tradeState.targets = [{ price: null, percent: "100", isLocked: false }];
  });

  afterEach(() => {
    tradeCalculator.destroy();
    vi.useRealTimers();
  });

  it("executes a trailing calculation for the final state after rapid mutations", async () => {
    const captured: string[] = [];
    tradeCalculator.init(() => {
      captured.push(tradeState.riskPercentage);
    });

    tradeState.riskPercentage = "1"; // t=0 -> leading edge fires immediately
    await vi.advanceTimersByTimeAsync(0);

    tradeState.riskPercentage = "2"; // blocked -> trailing scheduled
    await vi.advanceTimersByTimeAsync(50);
    tradeState.riskPercentage = "3"; // blocked -> trailing rescheduled
    await vi.advanceTimersByTimeAsync(50);

    expect(captured).toEqual(["1"]);

    await vi.advanceTimersByTimeAsync(250); // trailing window elapses
    expect(captured).toEqual(["1", "3"]);
  });

  it("collapses rapid mutations into a single trailing calculation", async () => {
    const calc = vi.fn();
    tradeCalculator.init(calc);

    tradeState.riskPercentage = "1";
    await vi.advanceTimersByTimeAsync(0);
    for (const v of ["2", "3", "4", "5"]) {
      tradeState.riskPercentage = v;
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(250);

    expect(calc).toHaveBeenCalledTimes(2); // 1 leading + 1 trailing, not 5
  });

  it("destroy() cancels a pending trailing calculation", async () => {
    const calc = vi.fn();
    tradeCalculator.init(calc);

    tradeState.riskPercentage = "1";
    await vi.advanceTimersByTimeAsync(0);

    tradeState.riskPercentage = "2"; // blocked -> trailing pending
    tradeCalculator.destroy();

    await vi.advanceTimersByTimeAsync(500);
    expect(calc).toHaveBeenCalledTimes(1); // trailing never fired
  });
});
