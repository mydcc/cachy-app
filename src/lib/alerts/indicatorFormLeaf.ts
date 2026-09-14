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
 * One condition read as the Indicators builder's form, or `null`.
 *
 * Its own module because two readers must agree on it exactly:
 *
 * - `conditionSlots.slotOf` decides whether the indicators builder claims a
 *   condition, and
 * - `readIndicatorForm` hydrates the builder from the claimed one.
 *
 * A claim on a condition the reader cannot hydrate makes the tab start blank
 * and its mount-time write delete what the trader saved (BUG-0443, BUG-0451).
 * They used to decide separately: the claim looked only at the left operand, so
 * an indicator against a window over some other operand was claimed and could
 * not be read. Both now call this, which imports neither of them.
 */

import { catalogueEntry } from "./indicatorCatalogue";
import type { IndicatorForm, Reference } from "./indicatorConditionForm";
import { effectiveFieldOf } from "../rules/alertPathIndicators";
import type { Condition, IndicatorRef, Operand } from "../rules/types";

export function indicatorFormOf(condition: Condition): IndicatorForm | null {
    if (condition.kind !== "compare" && condition.kind !== "cross") return null;
    if (condition.left.kind !== "indicator") return null;
    // Only an indicator this build offers: a document naming something the
    // panel does not would otherwise render as an empty picker that silently
    // rewrites the rule on the first edit.
    const entry = catalogueEntry(condition.left.indicator.id);
    if (!entry) return null;
    // The tab offers no price to compute an indicator over yet and rebuilds each
    // one from id, params and output, so claiming RSI over hl2 would rewrite it
    // as RSI over the close (FEAT-0454). Unclaimed, it stays as armed.
    if (namesAPrice(condition.left) || namesAPrice(condition.right)) return null;

    const reference = referenceFor(condition.right, condition.left.indicator);
    if (!reference) return null;
    // A cumulative indicator against anything but its window is a document the
    // core refuses (FEAT-0446 group 4) — saved before that rule, or from
    // elsewhere. The builder cannot offer it, so it does not claim it: the rule
    // stays as it is, and the evaluation loop reports it (BUG-0468).
    if (entry.cumulative && reference.kind !== "window") return null;

    return {
        subject: condition.left.indicator,
        relation:
            condition.kind === "compare"
                ? { kind: "compare", op: condition.op }
                : { kind: "cross", direction: condition.direction },
        reference,
    };
}

/** Whether an operand, or the operand a window is over, is an indicator naming a price. */
function namesAPrice(operand: Operand): boolean {
    if (operand.kind === "window") return namesAPrice(operand.of);
    return operand.kind === "indicator" && operand.indicator.field !== undefined;
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

/**
 * A ref with sorted parameters, its output spelled and its effective price, for
 * comparison only.
 *
 * The price is part of the identity (FEAT-0454): RSI over hl2 and RSI over the
 * close are two lines, so a window over one must not read as a window over the
 * other. It is the *effective* price, so a rule that spells the default and one
 * that omits it still compare equal, as the core canonicalises them to one
 * document. Unreachable today — `indicatorFormOf` leaves any condition naming a
 * price unclaimed before this runs — but the comparison is already correct for
 * when slice 2 lifts that.
 */
function canonicalRef(ref: IndicatorRef): unknown {
    const params = Object.entries(ref.params ?? {}).sort(([a], [b]) => a.localeCompare(b));
    return [ref.id, params, ref.output ?? "value", effectiveFieldOf(ref)];
}
