// @vitest-environment jsdom

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
 * FEAT-0542 — loading an armed rule back into the builder.
 *
 * The store starts a new draft from `blankDraft()` (or a caller's seed); this
 * pins the opposite direction: the stored document has to arrive complete,
 * keep its identity so arming replaces instead of duplicating, and open the
 * builder that can actually render it. A drawing-bound rule has no condition
 * slot — its binding is side state — hence the separate tab.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// `safeLocalStorage` and the anchor ledger gate on `$app/env`'s `browser`.
// The unit project stubs it false even under jsdom, so the real storage path
// needs the flag on for this suite.
vi.mock("$app/env", () => ({
    browser: true,
    dev: true,
    building: false,
    version: "test",
}));

import type { Condition, RuleDocument } from "../lib/rules/types";
import { armRule, readRuleStore } from "../services/alertEngine/armRule";
import {
    RULE_DRAWING_STORAGE_KEY,
    recordDrawingAnchor,
} from "../services/alertEngine/drawingAnchors";
import { RULES_STORAGE_KEY } from "../services/alertEngine/migrateAlertsToRules";
import { alertPanelState } from "./alertPanel.svelte";

const PRICE_CONDITION: Condition = {
    kind: "cross",
    left: { kind: "price", field: "close" },
    direction: "above",
    right: { kind: "constant", value: "70000" },
    timeframe: "4h",
};

const INDICATOR_CONDITION: Condition = {
    kind: "compare",
    left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
    op: "gt",
    right: { kind: "constant", value: "70" },
    timeframe: "4h",
};

const PATTERN_CONDITION: Condition = {
    kind: "pattern",
    pattern: "hammer",
    timeframe: "4h",
};

function rule(overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 2,
        id: "rule-1",
        name: "BTC breakout",
        symbol: "BTCUSDT",
        trigger_timeframe: "4h",
        conditions: PRICE_CONDITION,
        action: { consequence_level: "notify" },
        enabled: true,
        provenance: { source: "human", created_at_ms: 123 },
        frequency: "every_time",
        valid_until_ms: 9_999_999_999_999,
        trigger_methods: ["sound"],
        note: "watch the line",
        ...overrides,
    };
}

function seed(rules: unknown[]): void {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

beforeEach(() => {
    localStorage.clear();
    alertPanelState.closePanel();
    alertPanelState.reset("BTCUSDT");
    alertPanelState.activeTab = "manage";
});

describe("FEAT-0542: loading a stored rule for editing", () => {
    it("loads the document complete, keeps its id and opens the price tab", () => {
        seed([rule()]);

        expect(alertPanelState.loadForEdit("rule-1")).toBe("loaded");

        expect(alertPanelState.draft.id).toBe("rule-1");
        expect(alertPanelState.draft.provenance).toEqual({
            source: "human",
            created_at_ms: 123,
        });
        expect(alertPanelState.draft.symbol).toBe("BTCUSDT");
        expect(alertPanelState.draft.trigger_timeframe).toBe("4h");
        expect(alertPanelState.draft.conditions).toEqual(PRICE_CONDITION);
        expect(alertPanelState.draft.frequency).toBe("every_time");
        expect(alertPanelState.draft.valid_until_ms).toBe(9_999_999_999_999);
        expect(alertPanelState.draft.trigger_methods).toEqual(["sound"]);
        expect(alertPanelState.draft.note).toBe("watch the line");
        expect(alertPanelState.activeTab).toBe("price");
        expect(alertPanelState.drawingDraft).toBeNull();
    });

    it("keeps fields the panel does not render, and writes them back on arm", () => {
        const veto: Condition = {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "lt",
            right: { kind: "constant", value: "40000" },
            timeframe: "4h",
        };
        seed([rule({ veto })]);

        alertPanelState.loadForEdit("rule-1");
        expect(alertPanelState.draft.veto).toEqual(veto);

        armRule(alertPanelState.draft);
        expect(readRuleStore()[0].veto).toEqual(veto);
    });

    it("opens the indicators tab for a single indicator condition", () => {
        seed([rule({ conditions: INDICATOR_CONDITION })]);

        expect(alertPanelState.loadForEdit("rule-1")).toBe("loaded");
        expect(alertPanelState.activeTab).toBe("indicators");
    });

    it("opens the candlesticks tab for a pattern condition", () => {
        seed([rule({ conditions: PATTERN_CONDITION })]);

        expect(alertPanelState.loadForEdit("rule-1")).toBe("loaded");
        expect(alertPanelState.activeTab).toBe("candlesticks");
    });

    it("opens the combo tab when the rule has more than one leg", () => {
        seed([
            rule({
                conditions: {
                    kind: "group",
                    op: "all",
                    of: [INDICATOR_CONDITION, { ...INDICATOR_CONDITION }],
                },
            }),
        ]);

        expect(alertPanelState.loadForEdit("rule-1")).toBe("loaded");
        expect(alertPanelState.activeTab).toBe("combo");
    });

    it("opens combo for a single condition no builder can render", () => {
        seed([
            rule({
                conditions: {
                    kind: "group",
                    op: "all",
                    of: [{ kind: "position", side: "long", open: true }],
                },
            }),
        ]);

        expect(alertPanelState.loadForEdit("rule-1")).toBe("loaded");
        expect(alertPanelState.activeTab).toBe("combo");
    });

    it("opens combo when a single leg is anchored to another timeframe", () => {
        // Each single-condition builder rewrites its leg with the rule's
        // timeframe; claiming this one would silently move it on mount.
        seed([
            rule({
                trigger_timeframe: "4h",
                conditions: { ...PRICE_CONDITION, timeframe: "1h" },
            }),
        ]);

        expect(alertPanelState.loadForEdit("rule-1")).toBe("loaded");
        expect(alertPanelState.activeTab).toBe("combo");
    });

    it("re-arms the same rule instead of leaving a duplicate", () => {
        seed([rule()]);
        alertPanelState.loadForEdit("rule-1");
        alertPanelState.draft.conditions = {
            ...PRICE_CONDITION,
            right: { kind: "constant", value: "71000" },
        };

        armRule(alertPanelState.draft);

        const stored = readRuleStore();
        expect(stored).toHaveLength(1);
        expect(stored[0].id).toBe("rule-1");
        expect((stored[0].conditions as { right: { value: string } }).right.value).toBe(
            "71000",
        );
    });

    it("starts a fired one-shot rule armed and marks its fire state for clearing", () => {
        seed([rule({ enabled: false, frequency: "once" })]);

        alertPanelState.loadForEdit("rule-1");

        expect(alertPanelState.draft.enabled).toBe(true);
        expect(alertPanelState.rearmedFromDisarmed).toBe(true);
    });

    it("does not mark a repeating rule for state clearing just because it fired", () => {
        // A repeating rule stays enabled when it fires; only a stored `false`
        // means the firing path disarmed it.
        seed([rule({ enabled: true, frequency: "every_time" })]);

        alertPanelState.loadForEdit("rule-1");

        expect(alertPanelState.rearmedFromDisarmed).toBe(false);
    });

    it("gives a migrated rule without an action a notify action", () => {
        const legacy = rule() as unknown as Record<string, unknown>;
        delete legacy.action;
        seed([legacy]);

        expect(alertPanelState.loadForEdit("rule-1")).toBe("loaded");
        expect(alertPanelState.draft.action).toEqual({ consequence_level: "notify" });
    });

    it("refuses a bot and leaves the draft alone", () => {
        seed([rule({ action: { consequence_level: "simulate" } })]);
        const before = alertPanelState.draft.id;

        expect(alertPanelState.loadForEdit("rule-1")).toBe("bot");
        expect(alertPanelState.draft.id).toBe(before);
        expect(alertPanelState.activeTab).toBe("manage");
    });

    it("refuses a send rule rather than loading it as a notification alert", () => {
        seed([rule({ action: { consequence_level: "send" } })]);
        const before = alertPanelState.draft.id;

        expect(alertPanelState.loadForEdit("rule-1")).toBe("bot");
        expect(alertPanelState.draft.id).toBe(before);
    });

    it("reports a missing rule instead of opening a blank builder, and keeps the draft", () => {
        alertPanelState.draft.name = "half-built";
        alertPanelState.activeTab = "price";

        expect(alertPanelState.loadForEdit("never-armed")).toBe("missing");

        expect(alertPanelState.draft.name).toBe("half-built");
        expect(alertPanelState.activeTab).toBe("price");
    });

    it("reports an unreadable rule store rather than guessing, and keeps the draft", () => {
        localStorage.setItem(RULES_STORAGE_KEY, "{not json");
        alertPanelState.draft.name = "half-built";

        expect(alertPanelState.loadForEdit("rule-1")).toBe("unreadable");
        expect(alertPanelState.draft.name).toBe("half-built");
    });

    it("refuses a malformed stored entry instead of crashing the shell", () => {
        // `alarmRows` tolerates a partial entry so it can be deleted; loading
        // it would dereference `conditions.kind` in a `$derived`.
        seed([{ id: "rule-1" }]);
        const before = alertPanelState.draft.id;

        expect(alertPanelState.loadForEdit("rule-1")).toBe("unreadable");
        expect(alertPanelState.draft.id).toBe(before);
    });

    it("clears the previous draft's refusal and validation state", () => {
        seed([rule()]);
        alertPanelState.refusals = [
            {
                code: "conditions_empty",
                field: "conditions",
                i18n_key: "rules.refusal.unknownField",
                detail: "empty",
            },
        ];
        alertPanelState.hasValidated = true;
        alertPanelState.coreUnavailable = true;

        alertPanelState.loadForEdit("rule-1");

        expect(alertPanelState.refusals).toEqual([]);
        expect(alertPanelState.hasValidated).toBe(false);
        expect(alertPanelState.coreUnavailable).toBe(false);
    });

    it("opens the drawing tab from the anchor ledger, not from a condition slot", () => {
        // The line's market wins over a drifted document: the arm press
        // rebuilds from the drawing, so the header must name the same market.
        seed([rule({ symbol: "ETHUSDT" })]);
        recordDrawingAnchor("rule-1", {
            drawingId: "draw-1",
            symbol: "BTCUSDT",
            createdAtMs: 1,
        });

        expect(alertPanelState.loadForEdit("rule-1")).toBe("loaded");
        expect(alertPanelState.activeTab).toBe("drawing");
        expect(alertPanelState.drawingDraft).toEqual({
            id: "draw-1",
            symbol: "BTCUSDT",
        });
        expect(alertPanelState.draft.symbol).toBe("BTCUSDT");
    });

    it("refuses when the drawing ledger cannot be read, because the binding is unknown", () => {
        seed([rule()]);
        localStorage.setItem(RULE_DRAWING_STORAGE_KEY, "{not json");

        expect(alertPanelState.loadForEdit("rule-1")).toBe("unreadable");
    });

    it("clears a drawing binding from the previous draft", () => {
        seed([
            rule({ id: "drawing-rule" }),
            rule({ id: "plain-rule", conditions: INDICATOR_CONDITION }),
        ]);
        recordDrawingAnchor("drawing-rule", {
            drawingId: "draw-1",
            symbol: "BTCUSDT",
            createdAtMs: 1,
        });

        alertPanelState.loadForEdit("drawing-rule");
        alertPanelState.loadForEdit("plain-rule");

        expect(alertPanelState.drawingDraft).toBeNull();
        expect(alertPanelState.activeTab).toBe("indicators");
    });
});
