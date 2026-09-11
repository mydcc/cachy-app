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

/**
 * FEAT-0395 — reading the Price tab's form back out of a rule document.
 *
 * The tab writes the document (FEAT-0390) and, until now, only ever wrote it:
 * its radio group and its threshold lived in component state, so a draft that
 * arrived from anywhere but this tab's own inputs could not be shown. That is
 * the gap a pre-filled entry point falls into — and so does switching tabs and
 * back, which unmounts the component and takes the form with it.
 *
 * Making the document readable in both directions closes the class rather than
 * the instance: the document stays the single source of truth, and the tab
 * renders it instead of remembering it.
 */

import Decimal from "decimal.js";
import type { Condition } from "../rules/types";
import { soleCondition } from "./soleCondition";

export type PriceConditionKind =
  "rises_above" | "falls_below" | "rise_reaches" | "fall_reaches";

export interface PriceFormState {
  kind: PriceConditionKind;
  /** The threshold as typed, so a half-entered "60." is never mangled. */
  threshold: string;
  lookback: number;
}

/** What the tab shows when the draft holds nothing it recognises. */
export const BLANK_PRICE_FORM: PriceFormState = {
  kind: "rises_above",
  threshold: "",
  lookback: 1,
};

/**
 * A threshold string for display: plain digits, trailing zeros dropped.
 *
 * The document's own spelling is used where it parses, so what the trader sees
 * is what will be armed. An unparseable value is passed through untouched
 * rather than silently blanked — a rule the core refused should still show the
 * number that was refused.
 */
function displayThreshold(raw: string): string {
  try {
    const value = new Decimal(raw);
    return value.isFinite() ? value.toFixed() : raw;
  } catch {
    return raw;
  }
}

/**
 * The form state that would rebuild `conditions`, or the blank form.
 *
 * Only the four shapes this tab writes are recognised. Anything else — an
 * indicator comparison, a multi-condition group from the Combo tab — reads as
 * blank, because showing "rises above" for a rule that says nothing of the
 * sort is worse than showing an empty form.
 */
export function readPriceForm(conditions: Condition): PriceFormState {
  const condition = soleCondition(conditions);
  if (condition === null) return BLANK_PRICE_FORM;

  if (
    condition.kind === "cross" &&
    condition.left.kind === "price" &&
    condition.right.kind === "constant"
  ) {
    return {
      kind: condition.direction === "above" ? "rises_above" : "falls_below",
      threshold: displayThreshold(condition.right.value),
      lookback: BLANK_PRICE_FORM.lookback,
    };
  }

  if (
    condition.kind === "compare" &&
    condition.left.kind === "percent_change" &&
    condition.right.kind === "constant" &&
    (condition.op === "gte" || condition.op === "lte")
  ) {
    // A fall is written as the rise operand against a negative threshold, so
    // reading it back means taking the sign off again — the trader typed a
    // positive 5 and has to see a positive 5.
    const signed = displayThreshold(condition.right.value);
    const magnitude = signed.startsWith("-") ? signed.slice(1) : signed;
    return {
      kind: condition.op === "gte" ? "rise_reaches" : "fall_reaches",
      threshold: magnitude,
      lookback: condition.left.lookback,
    };
  }

  return BLANK_PRICE_FORM;
}
