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
} from "../rules/types";
import {
    catalogueEntry,
    defaultRef,
    dimensionOf,
    type CatalogueEntry,
    type OperandDimension,
} from "./indicatorCatalogue";
import { soleCondition } from "./soleCondition";

/** How the two sides are related: a threshold, or a crossing. */
export type Relation =
    | { kind: "compare"; op: CompareOp }
    | { kind: "cross"; direction: CrossDirection };

/**
 * What the indicator is measured against.
 *
 * Three kinds and not the full `Operand` union: a window aggregate is
 * ADR-0016's composition and belongs to the squeeze and divergence work, and
 * `percent_change` is the Price tab's. A tab that offers every operand offers
 * mostly nonsense.
 */
export type Reference =
    | { kind: "constant"; value: DecimalString }
    | { kind: "price"; field: PriceField }
    | { kind: "indicator"; indicator: IndicatorRef };

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
    if (reference.kind === "constant") return true;
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
    return {
        subject: defaultRef(entry),
        relation: { kind: "compare", op: "gt" },
        // Zero rather than a guessed level: a threshold is the one value only
        // the trader knows, and a plausible-looking default is the kind that
        // gets armed unread.
        reference: { kind: "constant", value: "0" },
    };
}

function operandFor(reference: Reference): Operand {
    switch (reference.kind) {
        case "constant":
            return { kind: "constant", value: reference.value };
        case "price":
            return { kind: "price", field: reference.field };
        case "indicator":
            return { kind: "indicator", indicator: reference.indicator };
    }
}

/** The condition a form becomes. */
export function buildIndicatorCondition(
    form: IndicatorForm,
    timeframe: TimeframeString,
): Condition {
    const left: Operand = { kind: "indicator", indicator: form.subject };
    const right = operandFor(form.reference);
    return form.relation.kind === "compare"
        ? { kind: "compare", left, op: form.relation.op, right, timeframe }
        : { kind: "cross", left, direction: form.relation.direction, right, timeframe };
}

function referenceFor(operand: Operand): Reference | null {
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
        default:
            // A window, a volume or a percent change on the right is a document
            // this tab did not write and cannot render without lying about it.
            return null;
    }
}

/**
 * The form a draft already carries, or `null` when the draft holds something
 * this tab does not edit.
 *
 * Read through `soleCondition`, never off `conditions.kind`: the panel may
 * hand back a one-element group, and reading the wrapper as "nothing here"
 * is how a seeded indicator condition would silently disappear.
 */
export function readIndicatorForm(
    conditions: Condition | null | undefined,
): IndicatorForm | null {
    const condition = soleCondition(conditions);
    if (!condition) return null;
    if (condition.kind !== "compare" && condition.kind !== "cross") return null;
    if (condition.left.kind !== "indicator") return null;
    // Only an indicator this build knows: a document naming something the
    // registry dropped would otherwise render as an empty picker that silently
    // rewrites the rule on the first edit.
    if (!catalogueEntry(condition.left.indicator.id)) return null;

    const reference = referenceFor(condition.right);
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
