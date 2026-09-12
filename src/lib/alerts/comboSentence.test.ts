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
 * FEAT-0030 AC1 -- "Conditions combine with AND and OR, and the resulting
 * logic is displayed in plain language in both locales."
 *
 * The seam this pins down is builder -> document -> sentence. Each half has
 * its own tests; what nobody had exercised before this item is a group with
 * more than one member, which is the only shape that reaches the join word.
 */

import { describe, expect, it } from "vitest";
import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import { renderRuleSentence, type SentenceTranslator } from "../rules/ruleSentence";
import type { Condition, LogicOp, RuleDocument } from "../rules/types";
import {
    COMBO_OPS,
    addRow,
    buildComboCondition,
    emptyComboForm,
    setLogicOp,
} from "./comboConditionForm";

/**
 * Resolves against the real locale files, and throws on a missing key. A stub
 * dictionary would keep passing after someone drops a fragment from de.json,
 * and the sentence is what a trader arms an alarm from.
 */
function translatorFor(bundle: Record<string, unknown>): SentenceTranslator {
    return (key, values) => {
        const raw = key
            .split(".")
            .reduce<unknown>(
                (node, part) => (node as Record<string, unknown> | undefined)?.[part],
                bundle,
            );
        if (typeof raw !== "string") throw new Error(`missing locale key: ${key}`);
        if (!values) return raw;
        return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(values[name] ?? ""));
    };
}

const TRIGGER = "4h";
const dt = translatorFor(de as unknown as Record<string, unknown>);
const et = translatorFor(en as unknown as Record<string, unknown>);

function comboDocument(op: LogicOp, rows: number): RuleDocument {
    let form = setLogicOp(emptyComboForm(), op);
    for (let i = 0; i < rows; i += 1) form = addRow(form);
    const conditions = buildComboCondition(form, TRIGGER);
    if (!conditions) throw new Error("expected a condition group");
    return {
        schema_version: 1,
        id: "r1",
        name: "combo",
        symbol: "BTCUSDT",
        trigger_timeframe: TRIGGER,
        conditions: conditions as Condition,
        action: { consequence_level: "notify" },
        provenance: { source: "human", created_at_ms: 0 },
    };
}

describe("a combination renders as one sentence", () => {
    it("joins two conditions with `and` / `und`", () => {
        const document = comboDocument("all", 2);
        expect(renderRuleSentence(document, et)).toContain(" and ");
        expect(renderRuleSentence(document, dt)).toContain(" und ");
    });

    it("joins two conditions with `or` / `oder`", () => {
        const document = comboDocument("any", 2);
        expect(renderRuleSentence(document, et)).toContain(" or ");
        expect(renderRuleSentence(document, dt)).toContain(" oder ");
    });

    it("renders every offered operator in both locales without a missing key", () => {
        // renderRuleSentence never throws by contract; the translator above
        // does. So an untranslated fragment fails here rather than reaching a
        // trader as a raw dotted key.
        for (const op of COMBO_OPS) {
            for (const rows of [1, 3, 5]) {
                const document = comboDocument(op, rows);
                expect(() => renderRuleSentence(document, et)).not.toThrow();
                expect(() => renderRuleSentence(document, dt)).not.toThrow();
            }
        }
    });

    it("leaves no raw i18n key in the rendered sentence", () => {
        for (const op of COMBO_OPS) {
            for (const t of [et, dt]) {
                const sentence = renderRuleSentence(comboDocument(op, 3), t);
                expect(sentence).not.toContain("rules.sentence.");
                expect(sentence).not.toContain("undefined");
            }
        }
    });

    it("names every member of the group, not just the first", () => {
        const three = renderRuleSentence(comboDocument("all", 3), et);
        const one = renderRuleSentence(comboDocument("all", 1), et);
        expect(three.length).toBeGreaterThan(one.length);
        expect(three.split(" and ")).toHaveLength(3);
    });
});
