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
 *
 * BUG-0474: parsed AI actions must be validated against the declared tool
 * schema before they can reach `executeAction`. `parseAiValue` maps garbage
 * to Decimal(0), so the validator has to sit in front of it.
 */

import { describe, expect, it } from "vitest";
import { validateAiAction } from "./actionValidation";

describe("validateAiAction (BUG-0474)", () => {
  it("drops unknown action names", () => {
    expect(validateAiAction({ action: "doEvil", value: 1 })).toBeNull();
    expect(validateAiAction({ action: "setMoonPrice", value: 1 })).toBeNull();
    expect(validateAiAction({ action: "", value: 1 })).toBeNull();
  });

  it("drops non-object shapes", () => {
    expect(validateAiAction(null)).toBeNull();
    expect(validateAiAction("setLeverage")).toBeNull();
    expect(validateAiAction(42)).toBeNull();
    expect(validateAiAction({ value: 50 })).toBeNull();
    expect(validateAiAction([])).toBeNull();
  });

  it("drops setLeverage with a non-numeric value", () => {
    expect(validateAiAction({ action: "setLeverage", value: "high" })).toBeNull();
    // Booleans must not coerce (parseAiValue maps true -> 1).
    expect(validateAiAction({ action: "setLeverage", value: true })).toBeNull();
    expect(validateAiAction({ action: "setLeverage", value: [50] })).toBeNull();
    expect(validateAiAction({ action: "setLeverage" })).toBeNull();
  });

  it("keeps setLeverage with numeric values", () => {
    expect(validateAiAction({ action: "setLeverage", value: 50 })).not.toBeNull();
    expect(validateAiAction({ action: "setLeverage", value: "50" })).not.toBeNull();
    expect(validateAiAction({ action: "setLeverage", value: "2.5" })).not.toBeNull();
  });

  it("drops prices that are not number-like", () => {
    expect(
      validateAiAction({ action: "setEntryPrice", value: "around fifty" }),
    ).toBeNull();
    expect(
      validateAiAction({ action: "setStopLoss", value: Number.NaN }),
    ).toBeNull();
    expect(
      validateAiAction({ action: "setStopLoss", value: Number.POSITIVE_INFINITY }),
    ).toBeNull();
    expect(validateAiAction({ action: "setEntryPrice", value: 50000 })).not.toBeNull();
  });

  it("checks index and percent shapes on take-profit actions", () => {
    expect(
      validateAiAction({ action: "setTakeProfit", index: 0, value: 52000 }),
    ).not.toBeNull();
    expect(
      validateAiAction({ action: "setTakeProfit", value: 52000 }),
    ).toBeNull();
    expect(
      validateAiAction({ action: "setTakeProfit", index: -1, value: 52000 }),
    ).toBeNull();
    expect(
      validateAiAction({ action: "setTakeProfit", index: 0.5, value: 52000 }),
    ).toBeNull();
    expect(
      validateAiAction({ action: "addTakeProfit", value: 52000, percent: 150 }),
    ).toBeNull();
    expect(
      validateAiAction({ action: "addTakeProfit", value: 52000, percent: 50 }),
    ).not.toBeNull();
    expect(validateAiAction({ action: "removeTakeProfit", index: 1 })).not.toBeNull();
    expect(validateAiAction({ action: "removeTakeProfit" })).toBeNull();
  });

  it("enforces enums and booleans where the switch already does", () => {
    expect(validateAiAction({ action: "setTradeType", value: "long" })).not.toBeNull();
    expect(validateAiAction({ action: "setTradeType", value: "LONG" })).toBeNull();
    expect(validateAiAction({ action: "setTradeType", value: "sideways" })).toBeNull();
    expect(validateAiAction({ action: "setUseAtrSl", value: true })).not.toBeNull();
    expect(validateAiAction({ action: "setUseAtrSl", value: "yes" })).toBeNull();
    expect(validateAiAction({ action: "setAutoPrice", value: false })).not.toBeNull();
    expect(validateAiAction({ action: "setAutoPrice", value: 0 })).toBeNull();
  });

  it("rejects setSymbol strings outside the safe pattern", () => {
    expect(validateAiAction({ action: "setSymbol", value: "BTCUSDT" })).not.toBeNull();
    expect(validateAiAction({ action: "setSymbol", value: "../../etc/passwd" })).toBeNull();
    expect(validateAiAction({ action: "setSymbol", value: "btcusdt" })).toBeNull();
    expect(validateAiAction({ action: "setSymbol", value: "BTC USDT" })).toBeNull();
    expect(validateAiAction({ action: "setSymbol", value: "X" })).toBeNull();
    expect(
      validateAiAction({ action: "setSymbol", value: "A".repeat(21) }),
    ).toBeNull();
    expect(validateAiAction({ action: "setSymbol", value: 42 })).toBeNull();
  });

  it("bounds notes and tags", () => {
    expect(validateAiAction({ action: "setNotes", value: "watch the wick" })).not.toBeNull();
    expect(validateAiAction({ action: "setNotes", value: "x".repeat(501) })).toBeNull();
    expect(validateAiAction({ action: "setNotes", value: 42 })).toBeNull();
    expect(
      validateAiAction({ action: "setTags", value: ["scalp", "news"] }),
    ).not.toBeNull();
    expect(
      validateAiAction({ action: "setTags", tags: ["scalp"] }),
    ).not.toBeNull();
    expect(validateAiAction({ action: "setTags", value: "scalp" })).toBeNull();
  });
});
