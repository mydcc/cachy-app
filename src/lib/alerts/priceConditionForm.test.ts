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

import { BLANK_PRICE_FORM, readPriceForm } from "./priceConditionForm";
import type { Condition } from "../rules/types";

function group(...of: Condition[]): Condition {
  return { kind: "group", op: "all", of };
}

describe("readPriceForm", () => {
  it("reads a cross above back as 'rises above' with its level", () => {
    expect(
      readPriceForm(
        group({
          kind: "cross",
          left: { kind: "price", field: "close" },
          direction: "above",
          right: { kind: "constant", value: "61234.57" },
          timeframe: "4h",
        }),
      ),
    ).toEqual({ kind: "rises_above", threshold: "61234.57", lookback: 1 });
  });

  it("reads a cross below back as 'falls below'", () => {
    expect(
      readPriceForm(
        group({
          kind: "cross",
          left: { kind: "price", field: "close" },
          direction: "below",
          right: { kind: "constant", value: "58000" },
          timeframe: "1h",
        }),
      ).kind,
    ).toBe("falls_below");
  });

  it("takes the sign off a fall, because the trader typed a positive number", () => {
    expect(
      readPriceForm(
        group({
          kind: "compare",
          left: { kind: "percent_change", field: "close", lookback: 3 },
          op: "lte",
          right: { kind: "constant", value: "-5" },
          timeframe: "1h",
        }),
      ),
    ).toEqual({ kind: "fall_reaches", threshold: "5", lookback: 3 });
  });

  it("keeps the lookback a percentage condition was built with", () => {
    expect(
      readPriceForm(
        group({
          kind: "compare",
          left: { kind: "percent_change", field: "close", lookback: 7 },
          op: "gte",
          right: { kind: "constant", value: "2.5" },
          timeframe: "1h",
        }),
      ),
    ).toEqual({ kind: "rise_reaches", threshold: "2.5", lookback: 7 });
  });

  it("shows a blank form for an empty draft", () => {
    expect(readPriceForm(group())).toEqual(BLANK_PRICE_FORM);
  });

  it("shows a blank form rather than misreading a condition it did not write", () => {
    // An indicator comparison is the Indicators tab's (FEAT-0028). Rendering
    // "rises above" for it would claim the rule says something it does not.
    expect(
      readPriceForm(
        group({
          kind: "compare",
          left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
          op: "gt",
          right: { kind: "constant", value: "70" },
          timeframe: "1h",
        }),
      ),
    ).toEqual(BLANK_PRICE_FORM);
  });

  it("shows a blank form for a multi-condition draft", () => {
    const one: Condition = {
      kind: "cross",
      left: { kind: "price", field: "close" },
      direction: "above",
      right: { kind: "constant", value: "1" },
      timeframe: "1h",
    };
    expect(readPriceForm(group(one, one))).toEqual(BLANK_PRICE_FORM);
  });
});
