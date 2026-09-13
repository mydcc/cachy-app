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
 * FEAT-0028 -- the shape the Indicators tab edits, and its two conversions.
 *
 * Separate from `indicatorCatalogue.ts` because that file is data the registry
 * test pins, and this is the logic that turns a form into a `Condition` and
 * back. Both directions exist for the same reason the Price tab has them
 * (FEAT-0395): the rule document is the single source of truth, so the tab
 * writes through on every edit and reads its form back out of the draft. A
 * condition seeded from the chart or carried over from another tab is then the
 * same document, not a second copy the tab keeps beside it.
 */

import type {
    CompareOp,
    Condition,
    CrossDirection,
    DecimalString,
    IndicatorRef,
    Operand,
    PriceField,
    TimeframeString,
    WindowAgg,
} from "../rules/types";
import {
    INDICATOR_CATALOGUE,
    catalogueEntry,
    defaultRef,
    dimensionOf,
    type CatalogueEntry,
    type OperandDimension,
} from "./indicatorCatalogue";
import { conditionInSlot } from "./conditionSlots";

/** How the two sides are related: a threshold, or a crossing. */
export type Relation =
    | { kind: "compare"; op: CompareOp }
    | { kind: "cross"; direction: CrossDirection };

/**
 * What the indicator is measured against.
 *
 * Four kinds and not the full `Operand` union: `percent_change` is the Price
 * tab's, and a tab that offers every operand offers mostly nonsense.
 *
 * `window` is always a window over the subject itself — "RSI at its 20-candle
 * high" (ADR-0016). A window over some other operand is a composition this tab
 * does not build and does not read back. For a cumulative indicator it is the
 * only reference the core accepts (FEAT-0446 group 4).
 */
export type Reference =
    | { kind: "constant"; value: DecimalString }
    | { kind: "price"; field: PriceField }
    | { kind: "indicator"; indicator: IndicatorRef }
    | { kind: "window"; agg: WindowAgg; lookback: number };

/**
 * The window spans the core accepts, `2..=500` closes (`InvalidWindowLookback`,
 * `MAX_WINDOW_LOOKBACK` in `condition.rs`). Pinned against the artefact by
 * `indicatorCatalogue.test.ts`, so the input's bounds cannot drift from the
 * refusal behind them.
 */
export const MIN_WINDOW_LOOKBACK = 2;
export const MAX_WINDOW_LOOKBACK = 500;

/**
 * The window a freshly chosen window reference starts from.
 *
 * A factory, not a shared constant: every form gets its own object, so an
 * in-place edit to one draft can never reach another.
 */
export function defaultWindowReference(): Reference {
    return { kind: "window", agg: "max", lookback: 20 };
}

/**
 * The lookback typed so far, when it is already a span the core accepts, else
 * `null`.
 *
 * For writing through on every keystroke. "1" on the way to "100", an emptied
 * field and a fraction are all states a trader passes through, so they leave
 * the draft on its last valid span instead of writing a refused one.
 */
export function exactWindowLookback(raw: string): number | null {
    if (raw.trim() === "") return null;
    const value = Number(raw);
    if (!Number.isInteger(value)) return null;
    if (value < MIN_WINDOW_LOOKBACK || value > MAX_WINDOW_LOOKBACK) return null;
    return value;
}

/**
 * The lookback a committed input settles on: truncated to a whole span and
 * clamped into the range the core accepts, or `previous` when the field holds
 * no number at all.
 */
export function committedWindowLookback(raw: string, previous: number): number {
    const value = raw.trim() === "" ? Number.NaN : Math.trunc(Number(raw));
    if (Number.isNaN(value)) return previous;
    return Math.min(MAX_WINDOW_LOOKBACK, Math.max(MIN_WINDOW_LOOKBACK, value));
}

const ALL_COMPARE_OPS: readonly CompareOp[] = ["gt", "gte", "lt", "lte", "eq", "neq"];

/**
 * The comparisons worth offering against `reference`.
 *
 * Against a window only the two that can be both true and false: the window
 * includes the candle being evaluated, so a value is never above its own
 * highest or below its own lowest, and "equal" to either is "at" it
 * (FEAT-0028, "A strict comparison against a window can never fire").
 */
export function compareOpsFor(reference: Reference): readonly CompareOp[] {
    if (reference.kind !== "window") return ALL_COMPARE_OPS;
    return reference.agg === "max" ? ["gte", "lt"] : ["lte", "gt"];
}

/**
 * The reference kinds a subject may be measured against, in the order the tab
 * lists them.
 *
 * A cumulative indicator gets only its own window: its level depends on how
 * much history is loaded, and the core refuses anything else. Every other
 * indicator keeps what it had — a number, a price where it is one, another
 * indicator in its unit — and gains its window.
 */
export function referenceKindsFor(
    entry: CatalogueEntry,
    dimension: OperandDimension,
): readonly Reference["kind"][] {
    if (entry.cumulative) return ["window"];
    const kinds: Reference["kind"][] = ["constant"];
    if (dimension === "price") kinds.push("price");
    if (compatibleIndicators(dimension, INDICATOR_CATALOGUE).length > 0) kinds.push("indicator");
    kinds.push("window");
    return kinds;
}

export interface IndicatorForm {
    readonly subject: IndicatorRef;
    readonly relation: Relation;
    readonly reference: Reference;
}

/**
 * Whether the core will accept this pairing, by the rule the core uses.
 *
 * Mirrors `Dimension::compatible_with`: identity, with `Constant` exempt
 * because it is dimensionless and is compared against a price, a percentage
 * and an RSI in turn. The tab asks this before offering a reference rather
 * than after building one, so an impossible pairing is never an option a
 * trader can pick and then be refused for.
 */
export function isReferenceCompatible(
    subject: OperandDimension,
    reference: Reference,
): boolean {
    // A window over the subject is in the subject's own unit by construction.
    if (reference.kind === "constant" || reference.kind === "window") return true;
    if (reference.kind === "price") return subject === "price";
    const entry = catalogueEntry(reference.indicator.id);
    if (!entry) return false;
    return dimensionOf(entry, reference.indicator.output ?? entry.outputs[0].name) === subject;
}

/** Every catalogued indicator whose chosen-by-default output matches `subject`. */
export function compatibleIndicators(
    subject: OperandDimension,
    catalogue: readonly CatalogueEntry[],
): readonly CatalogueEntry[] {
    return catalogue.filter((entry) =>
        entry.outputs.some((output) => output.dimension === subject),
    );
}

/** The form a freshly chosen indicator starts from: its defaults, above zero. */
export function defaultForm(entry: CatalogueEntry): IndicatorForm {
    // A cumulative indicator has no threshold to start from: the core takes
    // it only against its own window, so it starts at its 20-candle high.
    if (entry.cumulative) {
        return {
            subject: defaultRef(entry),
            relation: { kind: "compare", op: "gte" },
            reference: defaultWindowReference(),
        };
    }
    return {
        subject: defaultRef(entry),
        relation: { kind: "compare", op: "gt" },
        // Zero rather than a guessed level: a threshold is the one value only
        // the trader knows, and a plausible-looking default is the kind that
        // gets armed unread.
        reference: { kind: "constant", value: "0" },
    };
}

function operandFor(reference: Reference, subject: Operand): Operand {
    switch (reference.kind) {
        case "constant":
            return { kind: "constant", value: reference.value };
        case "price":
            return { kind: "price", field: reference.field };
        case "indicator":
            return { kind: "indicator", indicator: reference.indicator };
        case "window":
            return { kind: "window", of: subject, agg: reference.agg, lookback: reference.lookback };
    }
}

/** The condition a form becomes. */
export function buildIndicatorCondition(
    form: IndicatorForm,
    timeframe: TimeframeString,
): Condition {
    const left: Operand = { kind: "indicator", indicator: form.subject };
    const right = operandFor(form.reference, left);
    return form.relation.kind === "compare"
        ? { kind: "compare", left, op: form.relation.op, right, timeframe }
        : { kind: "cross", left, direction: form.relation.direction, right, timeframe };
}

function referenceFor(operand: Operand, subject: IndicatorRef): Reference | null {
    switch (operand.kind) {
        case "constant":
            return { kind: "constant", value: operand.value };
        case "price":
            // A price with a source (mark vs last) cannot be round-tripped through
            // this tab, so don't try.
            if (operand.source) return null;
            return { kind: "price", field: operand.field };
        case "indicator":
            return { kind: "indicator", indicator: operand.indicator };
        case "window":
            // Only a window over the subject itself is this tab's; compared as
            // documents, so a window over the same indicator with other
            // parameters or another line is not mistaken for it.
            if (operand.of.kind !== "indicator") return null;
            if (JSON.stringify(canonicalRef(operand.of.indicator)) !== JSON.stringify(canonicalRef(subject))) {
                return null;
            }
            return { kind: "window", agg: operand.agg, lookback: operand.lookback };
        default:
            // A volume or a percent change on the right is a document this tab
            // did not write and cannot render without lying about it.
            return null;
    }
}

/** A ref with sorted parameters and its output spelled, for comparison only. */
function canonicalRef(ref: IndicatorRef): unknown {
    const params = Object.entries(ref.params ?? {}).sort(([a], [b]) => a.localeCompare(b));
    return [ref.id, params, ref.output ?? "value"];
}

/**
 * The form a draft already carries, or `null` when the draft holds something
 * this tab does not edit.
 *
 * Read through `conditionInSlot`, never off `conditions.kind`: the panel hands
 * back a group, and reading the wrapper as "nothing here" is how a seeded
 * indicator condition would silently disappear. The slot argument is fixed
 * here rather than passed in — this reader returns only what the indicators
 * builder itself authored, so it can never hydrate from, and then overwrite,
 * another tab's condition (BUG-0443).
 */
export function readIndicatorForm(
    conditions: Condition | null | undefined,
): IndicatorForm | null {
    const condition = conditionInSlot(conditions, "indicators");
    if (!condition) return null;
    if (condition.kind !== "compare" && condition.kind !== "cross") return null;
    if (condition.left.kind !== "indicator") return null;
    // Only an indicator this build knows: a document naming something the
    // registry dropped would otherwise render as an empty picker that silently
    // rewrites the rule on the first edit.
    if (!catalogueEntry(condition.left.indicator.id)) return null;

    const reference = referenceFor(condition.right, condition.left.indicator);
    if (!reference) return null;

    return {
        subject: condition.left.indicator,
        relation:
            condition.kind === "compare"
                ? { kind: "compare", op: condition.op }
                : { kind: "cross", direction: condition.direction },
        reference,
    };
}
