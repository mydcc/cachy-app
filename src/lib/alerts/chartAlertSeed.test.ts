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

import { describe, expect, it } from "vitest";

import { conditionFromChartClick, ruleTimeframeFor } from "./chartAlertSeed";
import type { ChartAlertSeedInput } from "./chartAlertSeed";

const base: ChartAlertSeedInput = {
  clickedPrice: 61234.5678,
  lastPrice: 60000,
  decimals: 2,
  timeframe: "4h",
  field: "close",
  source: "last",
};

describe("conditionFromChartClick", () => {
  it("crosses above when the clicked level is over the last price", () => {
    const condition = conditionFromChartClick(base);
    expect(condition).toMatchObject({
      kind: "cross",
      direction: "above",
      right: { kind: "constant", value: "61234.57" },
      timeframe: "4h",
    });
  });

  it("crosses below when the clicked level is under the last price", () => {
    const condition = conditionFromChartClick({ ...base, clickedPrice: 58000 });
    expect(condition).toMatchObject({ direction: "below" });
  });

  it("rounds to the decimals the price axis is showing", () => {
    const condition = conditionFromChartClick({ ...base, decimals: 0 });
    expect(condition).toMatchObject({ right: { value: "61235" } });
  });

  it("drops trailing zeros so the level has one spelling", () => {
    // Two documents that mean the same level must hash the same; "61000.00"
    // and "61000" would not.
    const condition = conditionFromChartClick({ ...base, clickedPrice: 61000 });
    expect(condition).toMatchObject({ right: { value: "61000" } });
  });

  it("omits the source for the last series and names it for mark", () => {
    expect(conditionFromChartClick(base)).toMatchObject({
      left: { kind: "price", field: "close" },
    });
    expect(conditionFromChartClick(base)?.left).not.toHaveProperty("source");

    expect(conditionFromChartClick({ ...base, source: "mark" })).toMatchObject({
      left: { source: "mark" },
    });
  });

  it("assumes above when there is no last price to compare against", () => {
    expect(conditionFromChartClick({ ...base, lastPrice: null })).toMatchObject({
      direction: "above",
    });
  });

  it("refuses a level that is not a positive number", () => {
    expect(conditionFromChartClick({ ...base, clickedPrice: 0 })).toBeNull();
    expect(conditionFromChartClick({ ...base, clickedPrice: -5 })).toBeNull();
    expect(conditionFromChartClick({ ...base, clickedPrice: Number.NaN })).toBeNull();
  });

  it("refuses a level that rounds onto zero", () => {
    // A click far below the smallest tick the axis shows is not a level.
    expect(
      conditionFromChartClick({ ...base, clickedPrice: 0.004, decimals: 2 }),
    ).toBeNull();
  });
});

describe("ruleTimeframeFor", () => {
  it("passes through the spellings a rule document accepts", () => {
    for (const tf of ["1m", "27m", "4h", "3d", "1w"]) {
      expect(ruleTimeframeFor(tf)).toBe(tf);
    }
  });

  it("refuses a monthly chart rather than seeding a rule the core rejects", () => {
    expect(ruleTimeframeFor("1M")).toBeNull();
    expect(ruleTimeframeFor("0h")).toBeNull();
    expect(ruleTimeframeFor("h")).toBeNull();
  });
});
