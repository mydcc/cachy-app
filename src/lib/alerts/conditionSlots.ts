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
 * BUG-0443 — which builder owns which condition in the draft.
 *
 * The panel's tabs are code-split, so switching tabs unmounts one builder and
 * mounts another, and each one's write-through effect runs once on mount before
 * the trader has touched anything. While every builder replaced the *whole*
 * condition group, that mount-time write threw away whatever another tab had
 * authored — the panel forgetting a rule the trader had already half built,
 * which is precisely what the shared draft store (FEAT-0389) exists to prevent.
 *
 * The slot is derived from the condition's own shape rather than recorded
 * beside it. That is deliberate: a parallel map of slot → condition would be a
 * second source of truth that can drift from the document, and the document is
 * what the core validates and what the trader reads back in the sentence. A
 * condition's subject operand already says which builder could have produced
 * it, so no bookkeeping is needed and none can go stale.
 *
 * This replaces `soleCondition()`, which unwrapped the group but could not tell
 * two builders' conditions apart: with more than one member it returned `null`,
 * and every reader then hydrated blank and wrote its blank over the draft.
 *
 * **A slot is claimed by `slotOf()` exactly when that builder's reader can
 * hydrate the condition.** Price and indicators ask their reader's own parser
 * (`priceReadingOf`, `indicatorFormOf`); candlesticks claim patterns. A volume
 * comparison, a window, a position or account condition, and a nested group are
 * unclaimed — no builder emits those shapes, so an unclaimed condition is one no
 * builder will ever replace or remove. Unknown means keep: a shape this module
 * doesn't recognise survives a tab switch untouched rather than being deleted by
 * the builder that came closest to owning it.
 *
 * An indicator id the panel does not offer — the fourteen BUG-0451 hides — is
 * unclaimed on purpose: `readIndicatorForm` cannot hydrate it, so claiming it
 * would mean the builder hydrates blank and its mount-time write deletes the
 * member. Unclaimed, an alert saved while it was still offered survives the tab
 * switch and stays listed as unevaluable.
 *
 * The same holds for every shape a reader cannot hydrate (BUG-0444): an
 * indicator against a window over another operand, a `percent_change` against
 * an operator the price form does not write, a price level the price builder
 * refuses. A claim used to be a list of operand kinds, so these were claimed,
 * hydrated blank, and deleted by the mount-time write.
 */

import { indicatorFormOf } from "./indicatorFormLeaf";
import { priceReadingOf } from "./priceFormLeaf";
import type { Condition, Operand } from "../rules/types";

/** The builder tabs that author conditions. `combo` (FEAT-0030) spans slots. */
export type BuilderSlot = "price" | "indicators" | "candlesticks";

/**
 * Which builder authored `condition`, or `null` when no builder can claim it.
 *
 * Claims match what each builder actually emits — see `buildPriceCondition()` in
 * `priceFormLeaf.ts`, `buildIndicatorCondition()` in `indicatorConditionForm.ts`
 * and the pattern condition in `CandlesticksTab.svelte`. A shape those three
 * cannot produce is unclaimed even when it looks close, because a builder that
 * claims a condition it cannot render would hydrate blank and then delete it.
 */
export function slotOf(condition: Condition): BuilderSlot | null {
  if (condition.kind === "pattern") return "candlesticks";
  if (condition.kind !== "compare" && condition.kind !== "cross") return null;

  const subject: Operand = condition.left;
  if (subject.kind === "indicator") {
    // Claim exactly what the reader can hydrate, by asking the reader's own
    // parser: a claim on anything else would wipe the member on mount.
    return indicatorFormOf(condition) !== null ? "indicators" : null;
  }

  // The same for the price builder, whose reader goes one step further: it
  // claims only what the builder writes back unchanged (BUG-0444).
  return priceReadingOf(condition) !== null ? "price" : null;
}

/** Every condition in a draft, whether or not the group wrapper is there. */
export function conditionMembers(
  conditions: Condition | null | undefined,
): readonly Condition[] {
  if (!conditions) return [];
  if (conditions.kind !== "group") return [conditions];
  return conditions.of;
}

/** Positions in the draft's member list that `slot` claims, in document order. */
export function slotIndices(
  conditions: Condition | null | undefined,
  slot: BuilderSlot,
): readonly number[] {
  const found: number[] = [];
  conditionMembers(conditions).forEach((member, index) => {
    if (slotOf(member) === slot) found.push(index);
  });
  return found;
}

/**
 * The condition `slot`'s builder authored, or `null` when it has none.
 *
 * This is what a builder hydrates from on mount. Two rules, and the second is
 * as load-bearing as the first:
 *
 * 1. It returns only that builder's own work, so a draft holding another tab's
 *    condition reads as empty here — correctly, because this builder authored
 *    nothing — and the builder's write-through then touches nothing but its own
 *    slot. That is the BUG-0443 fix.
 * 2. A slot holding *more than one* condition reads as empty too. Two price
 *    legs or two patterns in one rule are a combo (FEAT-0030), and a
 *    single-condition builder cannot represent one: showing the first leg as
 *    "the" rule would misdescribe what is armed. A builder must not write to an
 *    ambiguous slot either — see `setSlotCondition()` — or editing one leg
 *    would silently drop the other.
 */
export function conditionInSlot(
  conditions: Condition | null | undefined,
  slot: BuilderSlot,
): Condition | null {
  const indices = slotIndices(conditions, slot);
  if (indices.length !== 1) return null;
  return conditionMembers(conditions)[indices[0]];
}
