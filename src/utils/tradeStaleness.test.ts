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

/*
 * BUG-0648 — pins `describeStaleness` directly: the order panel and the
 * journal path share this predicate, so its arms are pinned here once
 * instead of once per consumer.
 */

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import {
  describeStaleness,
  type StatedCalculation,
  type StatedForm,
} from "./tradeStaleness";

function calculated(overrides: Partial<StatedCalculation> = {}): StatedCalculation {
  return {
    stopLossPrice: new Decimal("58000"),
    entryPrice: new Decimal("60000"),
    leverage: new Decimal("10"),
    accountSize: new Decimal("10000"),
    riskPercentage: new Decimal("1"),
    targets: [],
    symbol: "BTCUSDT",
    tradeType: "long",
    ...overrides,
  };
}

function form(overrides: Partial<StatedForm> = {}): StatedForm {
  return {
    stopLossPrice: "58000",
    entryPrice: "60000",
    leverage: "10",
    accountSize: "10000",
    riskPercentage: "1",
    targets: [],
    symbol: "BTCUSDT",
    tradeType: "long",
    useAtrSl: false,
    ...overrides,
  };
}

describe("describeStaleness", () => {
  it("reports nothing stale when the calculation matches the form", () => {
    expect(describeStaleness(calculated(), form())).toEqual({
      stale: false,
      stopDisagrees: false,
      restDisagrees: false,
      stopCleared: false,
    });
  });

  it("reports nothing stale without a calculation", () => {
    expect(describeStaleness(null, form())).toEqual({
      stale: false,
      stopDisagrees: false,
      restDisagrees: false,
      stopCleared: false,
    });
  });

  it("names the cleared stop when it is the sole disagreement", () => {
    const result = describeStaleness(calculated(), form({ stopLossPrice: "" }));
    expect(result.stale).toBe(true);
    expect(result.stopDisagrees).toBe(true);
    expect(result.restDisagrees).toBe(false);
    expect(result.stopCleared).toBe(true);
  });

  it("names the zeroed stop like the emptied one", () => {
    const result = describeStaleness(calculated(), form({ stopLossPrice: "0" }));
    expect(result.stale).toBe(true);
    expect(result.stopCleared).toBe(true);
  });

  it("stays generic when the stop moved to a different positive value", () => {
    const result = describeStaleness(calculated(), form({ stopLossPrice: "57000" }));
    expect(result.stale).toBe(true);
    expect(result.stopDisagrees).toBe(true);
    expect(result.restDisagrees).toBe(false);
    expect(result.stopCleared).toBe(false);
  });

  it("stays generic when the stop was cleared but the entry moved too", () => {
    const result = describeStaleness(
      calculated(),
      form({ stopLossPrice: "", entryPrice: "61000" }),
    );
    expect(result.stale).toBe(true);
    expect(result.stopCleared).toBe(false);
  });

  it("stays generic for a cleared stop in ATR mode", () => {
    const result = describeStaleness(
      calculated(),
      form({ stopLossPrice: "", useAtrSl: true }),
    );
    expect(result.stale).toBe(true);
    expect(result.stopCleared).toBe(false);
  });

  it("treats a missing form field as no claim, not as cleared", () => {
    const result = describeStaleness(calculated(), form({ stopLossPrice: undefined }));
    expect(result.stale).toBe(false);
    expect(result.stopCleared).toBe(false);
  });

  it("tolerates the delta the calculator itself ignores", () => {
    const result = describeStaleness(calculated(), form({ stopLossPrice: "58000.0000005" }));
    expect(result.stale).toBe(false);
  });

  it("flags a stop beyond that delta", () => {
    const result = describeStaleness(calculated(), form({ stopLossPrice: "58000.00001" }));
    expect(result.stale).toBe(true);
    expect(result.stopCleared).toBe(false);
  });

  it("flags non-stop arms without naming the stop", () => {
    for (const change of [
      form({ entryPrice: "61000" }),
      form({ leverage: "20" }),
      form({ accountSize: "20000" }),
      form({ riskPercentage: "2" }),
      form({ symbol: "ETHUSDT" }),
      form({ tradeType: "short" }),
    ]) {
      const result = describeStaleness(calculated(), change);
      expect(result.stale).toBe(true);
      expect(result.stopDisagrees).toBe(false);
      expect(result.restDisagrees).toBe(true);
      expect(result.stopCleared).toBe(false);
    }
  });

  it("flags a deleted take-profit leg", () => {
    const result = describeStaleness(
      calculated({ targets: [{ price: new Decimal("65000") }] }),
      form({ targets: [] }),
    );
    expect(result.stale).toBe(true);
    expect(result.stopCleared).toBe(false);
  });

  it("flags reordered take-profit legs", () => {
    const result = describeStaleness(
      calculated({
        targets: [{ price: new Decimal("65000") }, { price: new Decimal("70000") }],
      }),
      form({ targets: [{ price: "70000" }, { price: "65000" }] }),
    );
    expect(result.stale).toBe(true);
    expect(result.stopCleared).toBe(false);
  });
});
