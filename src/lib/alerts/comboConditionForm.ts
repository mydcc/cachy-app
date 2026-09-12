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
 * The form behind the Combo tab (FEAT-0030).
 *
 * The draft is always a group already: `blankDraft` starts at
 * `{ kind: "group", op: "all", of: [] }` and `setSingleCondition` wraps its
 * one condition in the same shape. So this module never rewrites the tree --
 * it adds and removes members of the group the panel already holds, which is
 * why arriving here from the Indicators tab keeps the condition built there.
 *
 * Every function is pure and returns a new `ComboForm`. The tab owns the
 * `$state`; this module owns the rules about what a legal combination is.
 */

import { generateId } from "../../utils/utils";
import {
    buildIndicatorCondition,
    defaultForm,
    readIndicatorForm,
    type IndicatorForm,
} from "./indicatorConditionForm";
import { INDICATOR_CATALOGUE, catalogueEntry } from "./indicatorCatalogue";
import type { Condition, LogicOp, TimeframeString } from "../rules/types";

/**
 * Five, stated by FEAT-0030: "Limit: five conditions per rule."
 *
 * Enforced in the builder and not only in the core, so a trader is never
 * offered a sixth row that the validator would refuse on arm. A refusal the
 * UI could have prevented reads as a bug, not as a guard.
 */
export const MAX_COMBO_CONDITIONS = 5;

/**
 * Which join operators the builder offers: AND and OR, never NOR.
 *
 * `LogicOp` is `all | any | none` and both the evaluator and the read-back
 * sentence handle all three, so this is a deliberate narrowing of the builder
 * and not a gap in the core.
 *
 * `none` is left out because of what it does to an alert. A crossing is an
 * event -- rare, which is why it carries signal. `none` is a state, and it is
 * the ordinary one: `none(rsi > 70, macd crosses above)` holds on almost
 * every candle of almost every symbol. Against a `cross` it is worse still,
 * since a cross is true only in the single evaluation where it happens, so
 * negating it is true on every candle except the interesting one.
 *
 * Nothing is taken away from the trader. `none(A, B)` is `all(not A, not B)`,
 * and a `compare` negates through its own operator -- "RSI not above 70" is
 * `rsi <= 70`, which also reads better in the sentence. The only leaf that
 * cannot be negated that way is `cross`, and that is exactly the case where
 * the resulting rule would be the permanently-true non-alert above.
 */
export const COMBO_OPS: readonly LogicOp[] = ["all", "any"];

/** Whether this builder is willing to present a group joined this way. */
export function isOfferedOp(op: LogicOp): boolean {
    return COMBO_OPS.includes(op);
}

export interface ComboRow {
    /**
     * Keeps `{#each}` keys stable when a row is removed from the middle of
     * the list. Deliberately never reaches the document: a row id inside the
     * rule would differ between two traders building the same combination and
     * break the content-hash equality FEAT-0391 depends on.
     */
    readonly id: string;
    readonly form: IndicatorForm;
    /**
     * The timeframe this condition reads, or `null` to read the rule's
     * trigger timeframe.
     *
     * Per FEAT-0303 every condition is evaluated at the same instant -- the
     * close of the trigger timeframe -- and each reads the last candle of its
     * own timeframe that had closed by then. That is what makes a coarser
     * condition hold across several finer triggers, and it is why a row may
     * name a coarser timeframe but never a finer one.
     */
    readonly timeframe: TimeframeString | null;
}

export interface ComboForm {
    readonly op: LogicOp;
    readonly rows: readonly ComboRow[];
}

/** A fresh row on the first catalogue indicator, reading the trigger timeframe. */
export function newComboRow(): ComboRow {
    return {
        id: generateId(),
        form: defaultForm(INDICATOR_CATALOGUE[0]),
        timeframe: null,
    };
}

export function emptyComboForm(op: LogicOp = "all"): ComboForm {
    return { op, rows: [] };
}

export function canAddRow(form: ComboForm): boolean {
    return form.rows.length < MAX_COMBO_CONDITIONS;
}

export function addRow(form: ComboForm): ComboForm {
    if (!canAddRow(form)) return form;
    return { ...form, rows: [...form.rows, newComboRow()] };
}

export function removeRow(form: ComboForm, id: string): ComboForm {
    return { ...form, rows: form.rows.filter((row) => row.id !== id) };
}

export function replaceRow(form: ComboForm, id: string, next: Partial<Omit<ComboRow, "id">>): ComboForm {
    return {
        ...form,
        rows: form.rows.map((row) => (row.id === id ? { ...row, ...next } : row)),
    };
}

export function setLogicOp(form: ComboForm, op: LogicOp): ComboForm {
    return { ...form, op };
}

/**
 * The condition tree this form describes, or `null` when it describes none.
 *
 * `null` rather than an empty group on purpose: an empty group is what
 * `setSingleCondition(null)` writes to disable the arm button, so returning
 * one here would arm a rule that can never fire.
 */
export function buildComboCondition(
    form: ComboForm,
    triggerTimeframe: TimeframeString,
): Condition | null {
    if (form.rows.length === 0) return null;
    return {
        kind: "group",
        op: form.op,
        of: form.rows.map((row) =>
            buildIndicatorCondition(row.form, row.timeframe ?? triggerTimeframe),
        ),
    };
}

/**
 * Read an existing document back into the form.
 *
 * Returns `null` for a tree this builder cannot represent -- a nested group,
 * or a leaf that is not an indicator comparison -- rather than dropping the
 * parts it does not understand. Silently editing away half a trader's rule is
 * worse than showing them that this tab cannot open it.
 */
export function readComboForm(
    conditions: Condition | null | undefined,
    triggerTimeframe: TimeframeString,
): ComboForm | null {
    if (!conditions || conditions.kind !== "group") return null;
    if (conditions.of.length > MAX_COMBO_CONDITIONS) return null;
    // A `none` group is legal in the core and may arrive from a template, an
    // import or a model proposal. The builder does not offer that operator,
    // so it says so by refusing to open the document -- rewriting it into an
    // `all` would hand the trader a different rule under the same name.
    if (!isOfferedOp(conditions.op)) return null;

    const rows: ComboRow[] = [];
    for (const child of conditions.of) {
        // `readIndicatorForm` takes the sole condition of a group, so each
        // leaf is handed over wrapped the way that reader expects.
        const form = readIndicatorForm({ kind: "group", op: "all", of: [child] });
        if (!form) return null;
        if (!catalogueEntry(form.subject.id)) return null;
        const timeframe =
            child.kind === "compare" || child.kind === "cross" ? child.timeframe : null;
        rows.push({
            id: generateId(),
            form,
            timeframe: timeframe === triggerTimeframe ? null : timeframe,
        });
    }
    return { op: conditions.op, rows };
}
