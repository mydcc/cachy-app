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
    hasSymbolRule,
    isRuleTarget,
    normalizeRuleSymbol,
    ruleKey,
    sanitizeWindowRule,
    sanitizeWindowRules,
    supportsSymbolScope,
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
    it("ships an empty default list", () => {
        expect(defaultSettings.windowRules).toEqual([]);
    });

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

    it("does not offer rules for modals, dialogs, the symbol picker or the unused generic type", () => {
        for (const type of ["modal", "dialog", "symbolpicker", "window"] as const) {
            expect(isRuleTarget(type)).toBe(false);
            expect(WINDOW_RULE_TYPES).not.toContain(type);
        }
    });

    it("preselects a type that a real window is constructed with", () => {
        expect(WINDOW_RULE_TYPES[0]).toBe("journal");
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

    it("fails closed when the enabled flag is missing or not a literal true", () => {
        expect(sanitizeWindowRule({ windowType: "chart" })?.enabled).toBe(false);
        expect(
            sanitizeWindowRule({ windowType: "chart", enabled: "true" })?.enabled,
        ).toBe(false);
    });

    it("prefers an enabled duplicate over a disabled one", () => {
        const sanitized = sanitizeWindowRules([
            { windowType: "journal", enabled: false, x: 10 },
            { windowType: "journal", enabled: true, x: 20 },
        ]);
        expect(sanitized).toHaveLength(1);
        expect(sanitized[0]).toMatchObject({ enabled: true, x: 20 });
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

    it("treats a cleared or hand-edited null field as absent", () => {
        const cleared = rule({ x: null, width: null } as unknown as Partial<WindowRule>);
        expect(windowRulePatch(cleared, false)).toEqual({});
    });
});

/**
 * FEAT-0769 — a chart rule may be narrowed to one symbol, and the instance a
 * rule is matched against is the symbol the window was opened with.
 */
const chartRule = (
    symbol: string | undefined,
    overrides: Partial<WindowRule> = {},
): WindowRule => ({
    windowType: "chart",
    enabled: true,
    ...(symbol ? { match: { kind: "symbol" as const, value: symbol } } : {}),
    ...overrides,
});

describe("FEAT-0769 — per-instance matching", () => {
    it("applies the symbol rule to its own chart and the type rule to the others", () => {
        const rules = [
            chartRule(undefined, { x: 10 }),
            chartRule("BTCUSDT", { x: 400 }),
        ];

        expect(findWindowRule(rules, "chart", { symbol: "BTCUSDT" })?.x).toBe(400);
        expect(findWindowRule(rules, "chart", { symbol: "ETHUSDT" })?.x).toBe(10);
    });

    it("falls back to the type rule when no symbol rule applies", () => {
        expect(
            findWindowRule([chartRule("BTCUSDT", { x: 400 })], "chart", {
                symbol: "ETHUSDT",
            }),
        ).toBeUndefined();
    });

    it("ignores a scoped rule when the window has no symbol", () => {
        expect(
            findWindowRule([chartRule("BTCUSDT")], "chart"),
        ).toBeUndefined();
    });

    it("lets a disabled symbol rule fall back to the type rule", () => {
        const rules = [
            chartRule("BTCUSDT", { enabled: false, x: 400 }),
            chartRule("ETHUSDT", { x: 500 }),
            chartRule(undefined, { x: 10 }),
        ];

        // Ordering is load-bearing: a first-enabled-wins lookup would answer
        // 500 here, so this only passes when the scope is actually honoured.
        expect(findWindowRule(rules, "chart", { symbol: "BTCUSDT" })?.x).toBe(10);
        expect(findWindowRule(rules, "chart", { symbol: "ETHUSDT" })?.x).toBe(500);
    });

    it("matches the symbol regardless of the case it was typed in", () => {
        const rules = [chartRule("BTCUSDT", { x: 400 })];

        expect(
            findWindowRule(rules, "chart", { symbol: " btcusdt " })?.x,
        ).toBe(400);
        // First-enabled-wins would hand the BTC rule to every chart.
        expect(
            findWindowRule(rules, "chart", { symbol: "ETHUSDT" }),
        ).toBeUndefined();
    });

    it("canonicalises the match side, so a short form reaches its chart", () => {
        // Charts are constructed as "BTCUSDT"; a rule opened for "btc" must
        // still select it, or it is stored and never applied.
        expect(
            findWindowRule([chartRule("BTCUSDT", { x: 400 })], "chart", {
                symbol: "btc",
            })?.x,
        ).toBe(400);
    });

    it("never applies a chart rule to another window type", () => {
        expect(
            findWindowRule([chartRule("BTCUSDT")], "journal", {
                symbol: "BTCUSDT",
            }),
        ).toBeUndefined();
    });
});

describe("FEAT-0769 — scope validation on the load path", () => {
    it("keeps a well-formed scope and normalises it", () => {
        expect(
            sanitizeWindowRule({
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: " btcusdt " },
            })?.match,
        ).toEqual({ kind: "symbol", value: "BTCUSDT" });
    });

    it("rejects the whole rule when a scope sits on a type that cannot have one", () => {
        // Dropping only the scope would silently widen the rule to every
        // journal window, which is worse than losing it.
        expect(
            sanitizeWindowRule({
                windowType: "journal",
                enabled: true,
                match: { kind: "symbol", value: "BTCUSDT" },
            }),
        ).toBeNull();
    });

    it("rejects an unusable symbol instead of storing it", () => {
        for (const match of [
            { kind: "symbol", value: "" },
            { kind: "symbol", value: "B" },
            { kind: "symbol", value: "BTC USDT" },
            { kind: "symbol", value: 42 },
            { kind: "url", value: "BTCUSDT" },
            {},
            "BTCUSDT",
        ]) {
            expect(
                sanitizeWindowRule({ windowType: "chart", enabled: true, match }),
                JSON.stringify(match),
            ).toBeNull();
        }
    });

    it("rejects an over-long symbol and keeps a punctuation form", () => {
        expect(
            sanitizeWindowRule({
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "A".repeat(31) },
            }),
        ).toBeNull();
        expect(
            sanitizeWindowRule({
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "btc.usdt" },
            })?.match,
        ).toEqual({ kind: "symbol", value: "BTC.USDT" });
    });

    it("stores the canonical form the exchange layer would use", () => {
        // Without this the editor would accept "BTC", show it, and store a
        // rule that can never match a chart.
        expect(normalizeRuleSymbol("BTC")).toBe("BTCUSDT");
        expect(normalizeRuleSymbol(" btcusdt.p ")).toBe("BTCUSDT");
        expect(normalizeRuleSymbol("BTC-USDT")).toBe("BTCUSDT");
        expect(normalizeRuleSymbol(undefined)).toBe("");
        expect(normalizeRuleSymbol(42 as unknown as string)).toBe("");
        expect(
            sanitizeWindowRule({
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "btc" },
            })?.match,
        ).toEqual({ kind: "symbol", value: "BTCUSDT" });
    });

    it("still accepts rules stored before scopes existed", () => {
        expect(
            sanitizeWindowRule({ windowType: "chart", enabled: true, x: 5 }),
        ).toEqual({ windowType: "chart", enabled: true, x: 5 });
    });

    it("keeps a type-wide and a symbol rule side by side", () => {
        const sanitized = sanitizeWindowRules([
            { windowType: "chart", enabled: true, x: 10 },
            {
                windowType: "chart",
                enabled: true,
                x: 400,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
        ]);

        expect(sanitized).toHaveLength(2);
        expect(sanitized.map((entry) => entry.x)).toEqual([10, 400]);
    });

    it("coalesces duplicates of the same scope, casing included", () => {
        const sanitized = sanitizeWindowRules([
            {
                windowType: "chart",
                enabled: false,
                x: 1,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
            {
                windowType: "chart",
                enabled: true,
                x: 2,
                match: { kind: "symbol", value: "btcusdt" },
            },
        ]);

        expect(sanitized).toHaveLength(1);
        expect(sanitized[0]).toMatchObject({
            enabled: true,
            x: 2,
            match: { kind: "symbol", value: "BTCUSDT" },
        });
    });
});

describe("FEAT-0769 — rule identity helpers", () => {
    it("gives the type rule and each symbol rule their own key", () => {
        const generic = chartRule(undefined);
        const btc = chartRule("BTCUSDT");

        expect(ruleKey(generic)).toBe("chart|");
        expect(ruleKey(btc)).toBe("chart|symbol:BTCUSDT");
        expect(ruleKey(generic)).not.toBe(ruleKey(btc));
    });

    it("reports a taken symbol but ignores the rule being renamed", () => {
        const rules = [chartRule("BTCUSDT"), chartRule("ETHUSDT")];

        expect(hasSymbolRule(rules, "chart", "btcusdt")).toBe(true);
        expect(
            hasSymbolRule(rules, "chart", "BTCUSDT", ruleKey(chartRule("BTCUSDT"))),
        ).toBe(false);
        expect(hasSymbolRule(rules, "chart", "SOLUSDT")).toBe(false);
        expect(hasSymbolRule(rules, "chart", "")).toBe(false);
        // A symbol is only unique within its own window type.
        expect(hasSymbolRule(rules, "journal", "BTCUSDT")).toBe(false);
    });

    it("only offers a scope for chart windows", () => {
        expect(supportsSymbolScope("chart")).toBe(true);
        for (const type of WINDOW_RULE_TYPES.filter((entry) => entry !== "chart")) {
            expect(supportsSymbolScope(type), type).toBe(false);
        }
    });
});
