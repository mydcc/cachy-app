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
    findDialogKeyLiterals,
    findInterpolationViolations,
    TRANSLATION_KEY,
    translationCallees,
} from "./i18n-key-usage.mjs";

describe("translationCallees", () => {
    it("picks up an alias captured from get(_)", () => {
        expect(translationCallees("let t = get(_);")).toContain("t");
        expect(translationCallees("const other = get(otherStore);")).not.toContain(
            "other",
        );
    });

    it("recognises the const, let and var forms", () => {
        for (const keyword of ["const", "let", "var"]) {
            const source = `${keyword} tr = get(_);`;
            expect(translationCallees(source)).toContain("tr");
        }
    });
});

describe("findInterpolationViolations", () => {
    it("flags a flat options object on the component store", () => {
        const found = findInterpolationViolations(
            '$_("positionsList.confirmClose", { symbol })',
        );
        expect(found).toHaveLength(1);
        expect(found[0].line).toBe(1);
    });

    it("accepts the values wrapper and its shorthand", () => {
        expect(
            findInterpolationViolations(
                '$_("positionsList.confirmClose", { values: { symbol } })',
            ),
        ).toEqual([]);
        expect(
            findInterpolationViolations('t("a.b", { values })'),
        ).toEqual([]);
        expect(
            findInterpolationViolations('t("a.b", { values, extra: 1 })'),
        ).toEqual([]);
    });

    it("flags a captured service alias", () => {
        const source = [
            "const t = get(_);",
            'const text = t("modals.import.message", { count: rows });',
        ].join("\n");
        const found = findInterpolationViolations(source);
        expect(found).toHaveLength(1);
        expect(found[0].line).toBe(2);
    });

    it("flags the inline service form", () => {
        const found = findInterpolationViolations(
            'get(_)("modals.import.message", { count: rows })',
        );
        expect(found).toHaveLength(1);
    });

    it("ignores a call without a second argument", () => {
        expect(findInterpolationViolations('t("common.apply")')).toEqual([]);
        expect(findInterpolationViolations('$_(`dash.${x}`)')).toEqual([]);
    });

    it("does not fire inside a longer identifier", () => {
        // The alias has to be bound, otherwise `t(` is not a callee at all and
        // these assertions would hold even without the left boundary.
        const withAlias = (body) => `const t = get(_);\n${body}`;

        expect(
            findInterpolationViolations(
                withAlias("csv.parseCSVContent(text, { parse: 1 })"),
            ),
        ).toEqual([]);
        expect(
            findInterpolationViolations(
                withAlias("buildDirectRequest(streamFlavor, {})"),
            ),
        ).toEqual([]);
        expect(
            findInterpolationViolations(withAlias("pendingActions.set(id, {})")),
        ).toEqual([]);

        // Control: the alias itself must still fire, so the boundary is not
        // swallowing every call.
        expect(
            findInterpolationViolations(withAlias('t("a.b", { a })')),
        ).toHaveLength(1);
    });

    it("reports every match, not just the first", () => {
        const source = [
            '$_(providers[0].label, { a })',
            '$_(providers[1].label, { b })',
        ].join("\n");
        expect(findInterpolationViolations(source).map((v) => v.line)).toEqual([
            1, 2,
        ]);
    });
});

describe("TRANSLATION_KEY", () => {
    it("accepts underscore segments", () => {
        expect(
            TRANSLATION_KEY.test(
                "dashboard.alerts.templates.name.golden_cross_volume",
            ),
        ).toBe(true);
    });
});

describe("findDialogKeyLiterals", () => {
    it("flags a raw key passed as the dialog title", () => {
        const found = findDialogKeyLiterals(
            'modalState.show("modals.clearJournal.title", "Delete journal?", "confirm")',
        );
        expect(found).toHaveLength(1);
        expect(found[0].value).toBe("modals.clearJournal.title");
        expect(found[0].line).toBe(1);
    });

    it("flags a raw key in the message argument too", () => {
        const found = findDialogKeyLiterals(
            'modalState.show("Delete journal?", "modals.clearJournal.message", "confirm")',
        );
        expect(found).toHaveLength(1);
        expect(found[0].value).toBe("modals.clearJournal.message");
    });

    it("flags underscore keys and template literals", () => {
        expect(
            findDialogKeyLiterals(
                'modalState.show("dashboard.alerts.templates.name.golden_cross_volume", "m", "alert")',
            ),
        ).toHaveLength(1);
        expect(
            findDialogKeyLiterals(
                "modalState.show(`modals.clearJournal.title`, `Delete?`, `confirm`)",
            ),
        ).toHaveLength(1);
    });

    it("accepts translated copy", () => {
        const source = [
            "const t = get(_);",
            'modalState.show(t("modals.clearJournal.title"), t("modals.clearJournal.message"), "confirm");',
        ].join("\n");
        expect(findDialogKeyLiterals(source)).toEqual([]);
    });

    it("accepts literal copy that is not key-shaped", () => {
        expect(
            findDialogKeyLiterals(
                'modalState.show("Delete journal?", "All entries are removed.", "confirm")',
            ),
        ).toEqual([]);
        expect(
            findDialogKeyLiterals(
                'modalState.show("example.com", "v1.2.3", "report.csv")',
            ),
        ).toEqual([]);
    });

    it("does not split on a comma inside the copy", () => {
        const source = [
            'modalState.show("Delete journal?", "This removes it, permanently.", "confirm");',
            'modalState.show("modals.clearJournal.title", "Copy", "confirm");',
        ].join("\n");
        const found = findDialogKeyLiterals(source);
        expect(found).toHaveLength(1);
        expect(found[0].line).toBe(2);
    });

    it("reports the line of the key, not the line of the call", () => {
        const source = [
            "function clearJournal() {",
            "    const confirmed = await modalState.show(",
            '        "modals.clearJournal.title",',
            '        "modals.clearJournal.message",',
            '        "confirm",',
            "    );",
            "}",
        ].join("\n");
        expect(findDialogKeyLiterals(source).map((v) => v.line)).toEqual([
            3, 4,
        ]);
    });
});
