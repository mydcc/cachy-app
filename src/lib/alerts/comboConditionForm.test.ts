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

import { describe, expect, it } from "vitest";
import {
    COMBO_OPS,
    MAX_COMBO_CONDITIONS,
    addRow,
    buildComboCondition,
    emptyComboForm,
    newComboRow,
    readComboForm,
    removeRow,
    replaceRow,
    isOfferedOp,
    setLogicOp,
    type ComboForm,
} from "./comboConditionForm";

const TRIGGER = "15m";

function formWith(count: number): ComboForm {
    let form = emptyComboForm();
    for (let i = 0; i < count; i += 1) form = addRow(form);
    return form;
}

describe("buildComboCondition", () => {
    it("returns null for a form with no rows", () => {
        // An empty group is what setSingleCondition(null) writes to disable
        // the arm button. Returning one here would arm a rule that can never
        // fire, which is the failure this project cannot ship.
        expect(buildComboCondition(emptyComboForm(), TRIGGER)).toBeNull();
    });

    it("produces one group member per row, under the chosen operator", () => {
        const built = buildComboCondition(setLogicOp(formWith(3), "any"), TRIGGER);
        expect(built).not.toBeNull();
        expect(built?.kind).toBe("group");
        if (built?.kind !== "group") return;
        expect(built.op).toBe("any");
        expect(built.of).toHaveLength(3);
    });

    it("reads the trigger timeframe for a row that names none", () => {
        const built = buildComboCondition(formWith(1), TRIGGER);
        if (built?.kind !== "group") throw new Error("expected a group");
        const leaf = built.of[0];
        if (leaf.kind !== "compare" && leaf.kind !== "cross") throw new Error("expected a leaf");
        expect(leaf.timeframe).toBe(TRIGGER);
    });

    it("keeps a coarser timeframe a row names for itself", () => {
        // FEAT-0303: each condition reads the last closed candle of its own
        // timeframe at the trigger instant, so a coarser row is the whole
        // point of a multi-timeframe combination.
        const one = formWith(1);
        const coarser = replaceRow(one, one.rows[0].id, { timeframe: "4h" });
        const built = buildComboCondition(coarser, TRIGGER);
        if (built?.kind !== "group") throw new Error("expected a group");
        const leaf = built.of[0];
        if (leaf.kind !== "compare" && leaf.kind !== "cross") throw new Error("expected a leaf");
        expect(leaf.timeframe).toBe("4h");
    });

    it("never writes a row id into the document", () => {
        // Two traders building the same combination must reach the same
        // content hash -- FEAT-0391's unedited-template check depends on it,
        // and a per-session row id in the tree would break it silently.
        const form = formWith(MAX_COMBO_CONDITIONS);
        const built = buildComboCondition(form, TRIGGER);
        const serialised = JSON.stringify(built);
        for (const row of form.rows) {
            expect(serialised).not.toContain(row.id);
        }
    });
});

describe("row editing", () => {
    it("refuses a row beyond the five FEAT-0030 allows", () => {
        const full = formWith(MAX_COMBO_CONDITIONS);
        expect(full.rows).toHaveLength(MAX_COMBO_CONDITIONS);
        expect(addRow(full).rows).toHaveLength(MAX_COMBO_CONDITIONS);
    });

    it("leaves the form it was given untouched", () => {
        const before = formWith(2);
        const ids = before.rows.map((row) => row.id);
        removeRow(before, ids[0]);
        addRow(before);
        setLogicOp(before, "any");
        expect(before.rows.map((row) => row.id)).toEqual(ids);
        expect(before.op).toBe("all");
    });

    it("removes only the row named", () => {
        const form = formWith(3);
        const next = removeRow(form, form.rows[1].id);
        expect(next.rows.map((row) => row.id)).toEqual([form.rows[0].id, form.rows[2].id]);
    });

    it("gives every new row its own id", () => {
        const ids = new Set([newComboRow().id, newComboRow().id, newComboRow().id]);
        expect(ids.size).toBe(3);
    });
});

describe("readComboForm", () => {
    it("round-trips a document this builder produced", () => {
        const form = setLogicOp(formWith(2), "any");
        const built = buildComboCondition(form, TRIGGER);
        const read = readComboForm(built, TRIGGER);
        expect(read).not.toBeNull();
        expect(read?.op).toBe("any");
        expect(read?.rows).toHaveLength(2);
        expect(read?.rows.map((row) => row.form)).toEqual(form.rows.map((row) => row.form));
    });

    it("reports a row's own timeframe as its own, not as the trigger's", () => {
        const one = formWith(1);
        const coarser = replaceRow(one, one.rows[0].id, { timeframe: "4h" });
        const read = readComboForm(buildComboCondition(coarser, TRIGGER), TRIGGER);
        expect(read?.rows[0].timeframe).toBe("4h");
    });

    it("normalises a row that names the trigger timeframe back to null", () => {
        const read = readComboForm(buildComboCondition(formWith(1), TRIGGER), TRIGGER);
        expect(read?.rows[0].timeframe).toBeNull();
    });

    it("refuses a nested group rather than dropping what it cannot show", () => {
        const nested = {
            kind: "group",
            op: "all",
            of: [{ kind: "group", op: "any", of: [] }],
        } as const;
        expect(readComboForm(nested, TRIGGER)).toBeNull();
    });

    it("refuses a group with more members than the builder can hold", () => {
        const tooMany = buildComboCondition(formWith(MAX_COMBO_CONDITIONS), TRIGGER);
        if (tooMany?.kind !== "group") throw new Error("expected a group");
        const oversized = { ...tooMany, of: [...tooMany.of, tooMany.of[0]] };
        expect(readComboForm(oversized, TRIGGER)).toBeNull();
    });

    it("refuses a `none` group rather than rewriting it into an `all`", () => {
        // NOR is legal in the core and can arrive from a template, an import
        // or a model proposal. Silently reinterpreting it would hand the
        // trader a different rule under the name they recognise.
        const nor = buildComboCondition(formWith(2), TRIGGER);
        if (nor?.kind !== "group") throw new Error("expected a group");
        expect(readComboForm({ ...nor, op: "none" }, TRIGGER)).toBeNull();
    });

    it("refuses anything that is not a group", () => {
        expect(readComboForm(null, TRIGGER)).toBeNull();
        expect(readComboForm(undefined, TRIGGER)).toBeNull();
    });
});

describe("COMBO_OPS", () => {
    it("offers AND and OR and withholds NOR", () => {
        expect([...COMBO_OPS]).toEqual(["all", "any"]);
        expect(isOfferedOp("all")).toBe(true);
        expect(isOfferedOp("any")).toBe(true);
        expect(isOfferedOp("none")).toBe(false);
    });

    it("round-trips every operator it does offer", () => {
        for (const op of COMBO_OPS) {
            const built = buildComboCondition(setLogicOp(formWith(2), op), TRIGGER);
            expect(readComboForm(built, TRIGGER)?.op).toBe(op);
        }
    });
});
