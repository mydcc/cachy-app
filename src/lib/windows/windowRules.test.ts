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

import { describe, expect, it } from "vitest";
import {
    WINDOW_RULE_TYPES,
    findWindowRule,
    isRuleTarget,
    sanitizeWindowRule,
    sanitizeWindowRules,
    windowRulePatch,
} from "./windowRules";
import { PERSISTENCE_SCHEMA, loadCustomValue } from "../../stores/settings/persistenceSchema";
import type { WindowRule } from "../../stores/settings/settingsTypes";
import { defaultSettings } from "../../stores/settings/settingsTypes";

const rule = (overrides: Partial<WindowRule> = {}): WindowRule => ({
    windowType: "journal",
    enabled: true,
    ...overrides,
});

describe("FEAT-0743 — rule matching", () => {
    it("matches only an enabled rule for the window's own type", () => {
        const rules = [rule({ windowType: "journal" }), rule({ windowType: "chart" })];
        expect(findWindowRule(rules, "journal")?.windowType).toBe("journal");
        expect(findWindowRule(rules, "chart")?.windowType).toBe("chart");
    });

    it("ignores a disabled rule and an empty list", () => {
        expect(findWindowRule([rule({ enabled: false })], "journal")).toBeUndefined();
        expect(findWindowRule([], "journal")).toBeUndefined();
        expect(findWindowRule(undefined, "journal")).toBeUndefined();
    });

    it("does not offer rules for modals, dialogs or the symbol picker", () => {
        for (const type of ["modal", "dialog", "symbolpicker"] as const) {
            expect(isRuleTarget(type)).toBe(false);
            expect(WINDOW_RULE_TYPES).not.toContain(type);
        }
    });
});

describe("FEAT-0743 — load sanitizer", () => {
    it("drops non-objects and unknown window types", () => {
        expect(
            sanitizeWindowRules([
                null,
                42,
                "journal",
                [],
                { windowType: "nope", enabled: true },
            ]),
        ).toEqual([]);
    });

    it("keeps the first valid rule per type and drops duplicates", () => {
        const sanitized = sanitizeWindowRules([
            { windowType: "journal", enabled: true, x: 10 },
            { windowType: "journal", enabled: false, x: 20 },
            { windowType: "chart", enabled: false },
        ]);
        expect(sanitized).toHaveLength(2);
        expect(sanitized[0].x).toBe(10);
        expect(sanitized[1].windowType).toBe("chart");
    });

    it("drops non-finite and non-positive geometry, keeps the rest", () => {
        const sanitized = sanitizeWindowRule({
            windowType: "journal",
            enabled: true,
            x: Number.NaN,
            y: 120,
            width: 0,
            height: -5,
        });
        expect(sanitized).toMatchObject({ windowType: "journal", y: 120 });
        expect(sanitized?.x).toBeUndefined();
        expect(sanitized?.width).toBeUndefined();
        expect(sanitized?.height).toBeUndefined();
    });

    it("defaults a missing enabled flag to true", () => {
        expect(sanitizeWindowRule({ windowType: "chart" })?.enabled).toBe(true);
    });

    it("is the schema's load path for the persisted list", () => {
        const row = PERSISTENCE_SCHEMA.find((field) => field.key === "windowRules");
        expect(row).toMatchObject({ save: "snapshot", load: "custom", section: "display" });

        const values: Record<string, unknown> = {};
        loadCustomValue(
            "windowRules",
            { set: (key, value) => { values[key] = value; }, entitlement: { isPro: false, isProLicenseActive: false } },
            { ...defaultSettings, windowRules: [{ windowType: "journal", enabled: true, x: 40 } as WindowRule] },
            defaultSettings,
        );
        expect(values.windowRules).toEqual([{ windowType: "journal", enabled: true, x: 40 }]);
    });
});

describe("FEAT-0743 — open patch", () => {
    it("carries only the fields the rule sets", () => {
        expect(windowRulePatch(rule({ width: 500, x: 30 }), false)).toEqual({
            width: 500,
            x: 30,
        });
    });

    it("returns an empty patch without a rule", () => {
        expect(windowRulePatch(undefined, false)).toEqual({});
    });

    it("drops keep-above for a close-on-blur target", () => {
        expect(windowRulePatch(rule({ isKeepAbove: true }), true)).toEqual({});
        expect(windowRulePatch(rule({ isKeepAbove: true }), false)).toEqual({
            isKeepAbove: true,
        });
    });

    it("keeps a maximized flag and the geometry the caller may fall back to", () => {
        expect(windowRulePatch(rule({ isMaximized: true, width: 500 }), false)).toEqual({
            isMaximized: true,
            width: 500,
        });
    });
});
