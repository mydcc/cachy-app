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
    translationCallees,
} from "./i18n-key-usage.mjs";

describe("translationCallees", () => {
    it("knows the component store and the service accessor", () => {
        expect(translationCallees("")).toEqual(["\\$_", "get\\(_\\)"]);
    });

    it("picks up an alias captured from get(_)", () => {
        const source = [
            "const t = get(_);",
            "let other = get(otherStore);",
        ].join("\n");
        expect(translationCallees(source)).toContain("t");
        expect(translationCallees(source)).not.toContain("other");
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

    it("accepts the values wrapper", () => {
        expect(
            findInterpolationViolations(
                '$_("positionsList.confirmClose", { values: { symbol } })',
            ),
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

    it("ignores an unrelated two-argument call", () => {
        expect(
            findInterpolationViolations("format(value, { locale })"),
        ).toEqual([]);
    });

    it("does not fire inside a longer identifier", () => {
        // `…t(` at the end of a method name is not the translation alias.
        expect(
            findInterpolationViolations("csv.parseCSVContent(text, { parse: 1 })"),
        ).toEqual([]);
        expect(
            findInterpolationViolations("buildDirectRequest(streamFlavor, {})"),
        ).toEqual([]);
        expect(
            findInterpolationViolations("pendingActions.set(id, {})"),
        ).toEqual([]);
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

    it("flags single quotes too", () => {
        const found = findDialogKeyLiterals(
            "modalState.show('modals.savePreset.title', 'Enter name:', 'prompt')",
        );
        expect(found).toHaveLength(1);
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
    });

    it("reports the line of the call, not of the file", () => {
        const source = [
            "function clearJournal() {",
            "    const confirmed = await modalState.show(",
            '        "modals.clearJournal.title",',
            '        "modals.clearJournal.message",',
            '        "confirm",',
            "    );",
            "}",
        ].join("\n");
        expect(findDialogKeyLiterals(source)[0].line).toBe(2);
    });
});
