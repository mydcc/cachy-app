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


import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({ browser: true }));

import { armRule, disarmRule, removeRule, RuleStoreUnreadableError } from "./armRule";
import { deleteBot } from "./botStore";
import { ruleEvaluationLoop } from "./ruleEvaluationLoop";
import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import { readBotAnchors, saveBotAnchors } from "./ruleStateStore";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import type { RuleDocument } from "../../lib/rules/types";

function rule(id: string, threshold: string): RuleDocument {
    return {
        schema_version: 1,
        id,
        name: `rule ${id}`,
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: threshold },
            timeframe: "1h",
        },
        action: { consequence_level: "notify" },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
    };
}

function stored(): RuleDocument[] {
    return JSON.parse(localStorage.getItem(RULES_STORAGE_KEY) ?? "[]");
}

describe("armRule", () => {
    beforeEach(() => localStorage.clear());

    it("creates the store when nothing has been armed yet", () => {
        armRule(rule("a", "70000"));
        expect(stored().map((r) => r.id)).toEqual(["a"]);
    });

    it("appends beside a rule the migration already wrote", () => {
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([rule("migrated", "50000")]));
        armRule(rule("hand", "70000"));
        expect(stored().map((r) => r.id)).toEqual(["migrated", "hand"]);
    });

    it("replaces by id so an edited rule does not stay armed twice", () => {
        armRule(rule("a", "70000"));
        armRule(rule("a", "80000"));
        const rules = stored();
        expect(rules).toHaveLength(1);
        expect((rules[0].conditions as { right: { value: string } }).right.value).toBe("80000");
    });

    it("keeps a rule's position when it is replaced", () => {
        localStorage.setItem(
            RULES_STORAGE_KEY,
            JSON.stringify([rule("a", "1"), rule("b", "2"), rule("c", "3")]),
        );
        armRule(rule("b", "99"));
        expect(stored().map((r) => r.id)).toEqual(["a", "b", "c"]);
    });

    it("refuses rather than clobbering a store it cannot parse", () => {
        localStorage.setItem(RULES_STORAGE_KEY, "not json");
        expect(() => armRule(rule("a", "70000"))).toThrow(RuleStoreUnreadableError);
        expect(localStorage.getItem(RULES_STORAGE_KEY)).toBe("not json");
    });

    it("refuses a stored value that is not an array", () => {
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify({ rules: [] }));
        expect(() => armRule(rule("a", "70000"))).toThrow(RuleStoreUnreadableError);
    });
});

describe("forget wiring (BUG-0486)", () => {
    const SNAPSHOT = {
        evaluatedAnchorMs: 1_000,
        intrabarAnchorMs: 2_000,
        intrabarFiredAnchorMs: null,
    } as const;

    function bot(id: string): RuleDocument {
        return { ...rule(id, "70000"), action: { consequence_level: "simulate" } };
    }

    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
        vi.spyOn(ruleEvaluationGate, "forget");
    });

    it("forgets maps and stored anchors when a rule's content is edited", () => {
        armRule(rule("a", "70000"));
        saveBotAnchors("a", { ...SNAPSHOT });
        expect(readBotAnchors("a")).toEqual({ ...SNAPSHOT });

        armRule(rule("a", "80000"));

        expect(ruleEvaluationGate.forget).toHaveBeenCalledWith("a");
        expect(readBotAnchors("a")).toBeUndefined();
    });

    it("keeps anchors when only enabled flips (no toggle-to-refire)", () => {
        armRule(rule("a", "70000"));
        saveBotAnchors("a", { ...SNAPSHOT });

        armRule({ ...rule("a", "70000"), enabled: false });

        expect(ruleEvaluationGate.forget).not.toHaveBeenCalled();
        expect(readBotAnchors("a")).toEqual({ ...SNAPSHOT });

        armRule({ ...rule("a", "70000"), enabled: true });
        expect(ruleEvaluationGate.forget).not.toHaveBeenCalled();
        expect(readBotAnchors("a")).toEqual({ ...SNAPSHOT });
    });

    it("keeps anchors when only lifecycle fields change (note, frequency)", () => {
        // FEAT-0393 lifecycle is outside the content hash on purpose: a note
        // edit on a just-fired once rule must not make its already-seen
        // candle decidable again.
        armRule(rule("a", "70000"));
        saveBotAnchors("a", { ...SNAPSHOT });

        armRule({ ...rule("a", "70000"), note: "watched overnight" });
        expect(ruleEvaluationGate.forget).not.toHaveBeenCalled();
        expect(readBotAnchors("a")).toEqual({ ...SNAPSHOT });

        armRule({ ...rule("a", "70000"), frequency: "every_time" });
        expect(ruleEvaluationGate.forget).not.toHaveBeenCalled();
        expect(readBotAnchors("a")).toEqual({ ...SNAPSHOT });
    });

    it("does not forget a brand-new rule", () => {
        armRule(rule("fresh", "70000"));
        expect(ruleEvaluationGate.forget).not.toHaveBeenCalled();
    });

    it("forgets maps and stored anchors on removeRule", () => {
        armRule(rule("a", "70000"));
        saveBotAnchors("a", { ...SNAPSHOT });

        removeRule("a");

        expect(ruleEvaluationGate.forget).toHaveBeenCalledWith("a");
        expect(readBotAnchors("a")).toBeUndefined();
    });

    it("does not forget on disarmRule", () => {
        armRule(rule("a", "70000"));
        saveBotAnchors("a", { ...SNAPSHOT });

        expect(disarmRule("a")).toBe(true);
        expect(ruleEvaluationGate.forget).not.toHaveBeenCalled();
        expect(readBotAnchors("a")).toEqual({ ...SNAPSHOT });
    });

    it("forgets maps and stored anchors on deleteBot", () => {
        armRule(bot("bot-1"));
        saveBotAnchors("bot-1", { ...SNAPSHOT });

        expect(deleteBot("bot-1")).toBe(true);
        expect(ruleEvaluationGate.forget).toHaveBeenCalledWith("bot-1");
        expect(readBotAnchors("bot-1")).toBeUndefined();
    });

    it("leaves anchors alone when deleteBot refuses a non-bot", () => {
        armRule(rule("note-1", "70000"));
        saveBotAnchors("note-1", { ...SNAPSHOT });

        expect(deleteBot("note-1")).toBe(false);
        expect(ruleEvaluationGate.forget).not.toHaveBeenCalled();
        expect(readBotAnchors("note-1")).toEqual({ ...SNAPSHOT });
    });
});

/**
 * BUG-0485 — the three writers are the invalidation half of the broken-alert
 * record: a rule that is edited, re-armed, removed or disarmed must not stay
 * listed as "can never fire". The loop owns the record; the writers tell it
 * which entry died with the write.
 */
describe("broken-record invalidation (BUG-0485)", () => {
    beforeEach(() => {
        localStorage.clear();
        ruleEvaluationLoop.reset();
    });

    /** Parks one inert record for `doc` on the shared loop, the way a close would. */
    function reportBroken(doc: RuleDocument) {
        ruleEvaluationLoop.configure({
            readCandles: () => [],
            readRules: () => [doc],
            resolveThreshold: () => ({ unevaluable: "the drawing is gone" }),
        });
        ruleEvaluationLoop.observeCandles("BTCUSDT", "1h", [{ time: 1_000 }]);
        ruleEvaluationLoop.observeCandles("BTCUSDT", "1h", [{ time: 3_601_000 }]);
        expect(ruleEvaluationLoop.unevaluableRules().map((r) => r.ruleId)).toEqual([doc.id]);
    }

    it("clears the entry when the rule is edited and re-armed", () => {
        const doc = rule("a", "70000");
        armRule(doc);
        reportBroken(doc);

        armRule(rule("a", "80000"));

        expect(ruleEvaluationLoop.unevaluableRules()).toEqual([]);
    });

    it("clears the entry when the rule is removed, so a deleted rule does not stay listed", () => {
        const doc = rule("a", "70000");
        armRule(doc);
        reportBroken(doc);

        removeRule("a");

        expect(ruleEvaluationLoop.unevaluableRules()).toEqual([]);
    });

    it("clears the entry when the rule is disarmed", () => {
        const doc = rule("a", "70000");
        armRule(doc);
        reportBroken(doc);

        expect(disarmRule("a")).toBe(true);

        expect(ruleEvaluationLoop.unevaluableRules()).toEqual([]);
    });
});
