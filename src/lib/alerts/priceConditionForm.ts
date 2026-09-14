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

import type { Condition } from "../rules/types";
import { conditionInSlot } from "./conditionSlots";
import { priceReadingOf, type PriceFormState, type PriceReading } from "./priceFormLeaf";

export type { PriceConditionKind, PriceFormState, PriceReading } from "./priceFormLeaf";

/** What the tab shows when the draft holds nothing it recognises. */
export const BLANK_PRICE_FORM: PriceFormState = {
  kind: "rises_above",
  threshold: "",
  lookback: 1,
};

/**
 * The price builder's own condition read back, field and series included, or
 * `null` when the builder authored nothing (BUG-0444).
 *
 * A claimed condition is exactly one the builder rebuilds unchanged — see
 * `priceReadingOf` — so hydrating from this and writing straight back leaves
 * the document as it was.
 */
export function readPriceReading(
  conditions: Condition | null | undefined,
): PriceReading | null {
  const condition = conditionInSlot(conditions, "price");
  return condition === null ? null : priceReadingOf(condition);
}

/**
 * The form state that would rebuild `conditions`, or the blank form.
 *
 * Only the four shapes this tab writes are recognised. Anything else — an
 * indicator comparison, a multi-condition group from the Combo tab — reads as
 * blank, because showing "rises above" for a rule that says nothing of the
 * sort is worse than showing an empty form.
 *
 * Blank here means "this builder has authored nothing", not "the draft is
 * empty": `conditionInSlot` returns only the price builder's own member, so a
 * draft that also holds an indicator condition still reads blank in this form
 * and the write-through leaves that indicator alone (BUG-0443).
 */
export function readPriceForm(
  conditions: Condition | null | undefined,
): PriceFormState {
  return readPriceReading(conditions)?.form ?? BLANK_PRICE_FORM;
}
