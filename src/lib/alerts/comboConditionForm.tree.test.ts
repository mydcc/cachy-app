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
 * FEAT-0813: the combo builder as a tree -- sixteen leaves, one level of
 * groups, mixed leaf kinds, and documents it must open read-only.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import { ruleSchema } from "../rules/ruleSchema";
import { renderRuleSentence, type SentenceTranslator } from "../rules/ruleSentence";
import type { Condition, RuleDocument } from "../rules/types";
import {
    MAX_COMBO_CONDITIONS,
    addGroup,
    addRow,
    buildComboCondition,
    buildComboDraft,
    changeLeafKind,
    comboLockReason,
    emptyComboForm,
    leafCount,
    leafPaths,
    readComboForm,
    refusalPath,
    removeRow,
    replaceRow,
    setLogicOp,
    type ComboForm,
    type ComboGroupNode,
} from "./comboConditionForm";

const TRIGGER = "1h";

// The real core, not a stub: "the core accepts it" is the claim under test.
const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

beforeAll(async () => {
    const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
        default: (binary: BufferSource) => Promise<unknown>;
    };
    await mod.default(readFileSync(WASM_BINARY));
    ruleSchema.setLoader(async () => mod as never);
    await ruleSchema.load();
});

function translatorFor(bundle: Record<string, unknown>): SentenceTranslator {
    return (key, values) => {
        const raw = key
            .split(".")
            .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
        if (typeof raw !== "string") throw new Error(`missing locale key: ${key}`);
        if (!values) return raw;
        return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(values[name] ?? ""));
    };
}
const dt = translatorFor(de as unknown as Record<string, unknown>);
const et = translatorFor(en as unknown as Record<string, unknown>);

function documentOf(conditions: Condition): RuleDocument {
    return {
        schema_version: 1,
        id: "r1",
        name: "tree",
        symbol: "BTCUSDT",
        trigger_timeframe: TRIGGER,
        conditions,
        action: { consequence_level: "notify" },
        provenance: { source: "human", created_at_ms: 0 },
    };
}

function groupAt(form: ComboForm, index: number): ComboGroupNode {
    const node = form.rows[index];
    if (node.kind !== "group") throw new Error(`row ${index} is a ${node.kind}`);
    return node;
}

/** all(indicator, price > 60000, any(indicator, hammer)) */
function mixedNested(): ComboForm {
    let form = addRow(emptyComboForm("all"));
    form = addRow(form, "price");
    const priceId = form.rows[1].id;
    form = replaceRow(form, priceId, {
        reading: {
            form: { kind: "rises_above", threshold: "60000", lookback: 1 },
            field: "close",
            source: "last",
        },
    });
    form = addGroup(form);
    const group = groupAt(form, 2);
    form = addRow(form, "pattern", group.id);
    return form;
}

describe("the cap", () => {
    it("builds, reads back and rebuilds a rule with twelve conditions without losing a row", () => {
        let form = emptyComboForm();
        for (let i = 0; i < 12; i += 1) form = addRow(form);
        const built = buildComboCondition(form, TRIGGER);
        const read = readComboForm(built, TRIGGER);
        expect(read && leafCount(read)).toBe(12);
        expect(buildComboCondition(read!, TRIGGER)).toEqual(built);
    });

    it("counts leaves inside groups against the cap", () => {
        let form = addGroup(emptyComboForm());
        const groupId = form.rows[0].id;
        while (leafCount(form) < MAX_COMBO_CONDITIONS) form = addRow(form, "indicator", groupId);
        expect(leafCount(form)).toBe(MAX_COMBO_CONDITIONS);
        expect(addRow(form)).toBe(form);
        expect(addGroup(form)).toBe(form);
        expect(addRow(form, "indicator", groupId)).toBe(form);
    });

    it("locks a document with more conditions than the cap and names why, instead of truncating it", () => {
        let form = emptyComboForm();
        for (let i = 0; i < MAX_COMBO_CONDITIONS; i += 1) form = addRow(form);
        const full = buildComboCondition(form, TRIGGER);
        if (full?.kind !== "group") throw new Error("expected a group");
        const oversized: Condition = { ...full, of: [...full.of, full.of[0]] };
        expect(readComboForm(oversized, TRIGGER)).toBeNull();
        expect(comboLockReason(oversized, TRIGGER)).toBe("too_many");
    });
});

describe("nested groups", () => {
    it("round-trips build -> document -> read back -> the identical sentence, in both locales", () => {
        const form = mixedNested();
        const built = buildComboCondition(form, TRIGGER);
        expect(built).not.toBeNull();
        const read = readComboForm(built, TRIGGER);
        expect(read).not.toBeNull();
        const rebuilt = buildComboCondition(read!, TRIGGER);
        expect(rebuilt).toEqual(built);
        for (const t of [et, dt]) {
            const sentence = renderRuleSentence(documentOf(built!), t);
            expect(renderRuleSentence(documentOf(rebuilt!), t)).toBe(sentence);
            expect(sentence).toContain("(");
            expect(sentence).not.toContain("rules.sentence.");
        }
    });

    it("writes the nested group under its own operator, opposite the root's by default", () => {
        const built = buildComboCondition(mixedNested(), TRIGGER);
        if (built?.kind !== "group") throw new Error("expected a group");
        const inner = built.of[2];
        expect(inner.kind).toBe("group");
        if (inner.kind !== "group") return;
        expect(built.op).toBe("all");
        expect(inner.op).toBe("any");
        expect(inner.of).toHaveLength(2);
    });

    it("sets a nested group's operator without touching the root's", () => {
        const form = mixedNested();
        const group = groupAt(form, 2);
        const next = setLogicOp(form, "all", group.id);
        expect(next.op).toBe("all");
        expect(groupAt(next, 2).op).toBe("all");
        expect(groupAt(form, 2).op).toBe("any");
    });

    it("removes a nested group with its last leaf, so no empty group reaches the core", () => {
        const form = addGroup(emptyComboForm());
        const group = groupAt(form, 0);
        const next = removeRow(form, group.members[0].id);
        expect(next.rows).toHaveLength(0);
        expect(buildComboCondition(next, TRIGGER)).toBeNull();
    });

    it("locks a third level of nesting instead of flattening it", () => {
        const deep: Condition = {
            kind: "group",
            op: "all",
            of: [
                {
                    kind: "group",
                    op: "any",
                    of: [{ kind: "group", op: "all", of: [{ kind: "pattern", pattern: "hammer", timeframe: TRIGGER }] }],
                },
            ],
        };
        expect(readComboForm(deep, TRIGGER)).toBeNull();
        expect(comboLockReason(deep, TRIGGER)).toBe("unsupported");
    });

    it("locks a NOR group nested inside, like one at the root", () => {
        const nor: Condition = {
            kind: "group",
            op: "all",
            of: [{ kind: "group", op: "none", of: [{ kind: "pattern", pattern: "hammer", timeframe: TRIGGER }] }],
        };
        expect(readComboForm(nor, TRIGGER)).toBeNull();
    });
});

describe("mixed leaves", () => {
    it("puts a price comparison, an indicator comparison and a pattern in one tree and names each", () => {
        const built = buildComboCondition(mixedNested(), TRIGGER);
        if (built?.kind !== "group") throw new Error("expected a group");
        const kinds = JSON.stringify(built);
        expect(kinds).toContain('"kind":"price"');
        expect(kinds).toContain('"kind":"indicator"');
        expect(kinds).toContain('"kind":"pattern"');
        const sentence = renderRuleSentence(documentOf(built), et);
        expect(sentence).toContain("60000");
        expect(sentence.toLowerCase()).toContain("hammer");
    });

    it("is a document the core validates, and whose warmup the core can state", () => {
        const built = buildComboCondition(mixedNested(), TRIGGER);
        const document = documentOf(built!);
        expect(() => ruleSchema.validate(document)).not.toThrow();
        expect(ruleSchema.warmupCandles(document)).toBeGreaterThan(0);
    });

    it("keeps a rule unarmable while a price leaf has no threshold yet", () => {
        const form = addRow(addRow(emptyComboForm()), "price");
        expect(buildComboCondition(form, TRIGGER)).toBeNull();
    });

    it("opens a rule the Price and Candlesticks tabs wrote, instead of locking it", () => {
        const fromOtherTabs: Condition = {
            kind: "group",
            op: "all",
            of: [
                {
                    kind: "cross",
                    left: { kind: "price", field: "close" },
                    direction: "above",
                    right: { kind: "constant", value: "60000" },
                    timeframe: TRIGGER,
                },
                { kind: "pattern", pattern: "bullish_engulfing", timeframe: "4h" },
            ],
        };
        const read = readComboForm(fromOtherTabs, TRIGGER);
        expect(read?.rows.map((row) => row.kind)).toEqual(["price", "pattern"]);
        expect(buildComboCondition(read!, TRIGGER)).toEqual(fromOtherTabs);
    });

    it("swaps a leaf's kind in place, keeping its position and timeframe", () => {
        let form = addRow(addRow(emptyComboForm()));
        const second = form.rows[1].id;
        form = replaceRow(form, second, { timeframe: "4h" });
        const next = changeLeafKind(form, second, "pattern");
        expect(next.rows[1].id).toBe(second);
        expect(next.rows[1].kind).toBe("pattern");
        if (next.rows[1].kind === "group") return;
        expect(next.rows[1].timeframe).toBe("4h");
        expect(next.rows[0]).toBe(form.rows[0]);
    });
});

describe("the draft while a leaf is unfinished", () => {
    it("keeps every leaf that builds and flags the one that does not", () => {
        let form = addRow(addRow(emptyComboForm()));
        form = addRow(form, "price");
        const draft = buildComboDraft(form, TRIGGER);
        expect(draft.incomplete).toBe(true);
        if (draft.condition?.kind !== "group") throw new Error("expected a group");
        expect(draft.condition.of).toHaveLength(2);
        expect(draft.condition.of.every((c) => c.kind !== "group")).toBe(true);
    });

    it("drops a group whose only leaf is unfinished instead of writing an empty group", () => {
        let form = addRow(emptyComboForm());
        form = addGroup(form);
        const group = groupAt(form, 1);
        form = changeLeafKind(form, group.members[0].id, "price");
        const draft = buildComboDraft(form, TRIGGER);
        expect(draft.incomplete).toBe(true);
        if (draft.condition?.kind !== "group") throw new Error("expected a group");
        expect(draft.condition.of).toHaveLength(1);
    });

    it("equals the strict build once every leaf is complete", () => {
        const form = mixedNested();
        expect(buildComboDraft(form, TRIGGER)).toEqual({
            condition: buildComboCondition(form, TRIGGER),
            incomplete: false,
        });
    });
});

describe("refusal anchoring", () => {
    it("names each leaf by the path the core refuses it under", () => {
        expect(refusalPath(0)).toBe("conditions.of[0]");
        expect(refusalPath(2, 1)).toBe("conditions.of[2].of[1]");
        expect(refusalPath(2, 1, "veto")).toBe("veto.of[2].of[1]");
        expect(leafPaths(mixedNested())).toEqual([
            "conditions.of[0]",
            "conditions.of[1]",
            "conditions.of[2].of[0]",
            "conditions.of[2].of[1]",
        ]);
    });

    it("lists paths in the order buildComboCondition writes the members", () => {
        const form = mixedNested();
        const built = buildComboCondition(form, TRIGGER);
        if (built?.kind !== "group") throw new Error("expected a group");
        const inner = built.of[2];
        if (inner.kind !== "group") throw new Error("expected the nested group third");
        expect(inner.of[1].kind).toBe("pattern");
        expect(groupAt(form, 2).members[1].kind).toBe("pattern");
    });
});
