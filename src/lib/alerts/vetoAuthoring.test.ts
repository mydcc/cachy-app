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
 * FEAT-0814 -- a feed is a veto leaf and never a trigger: the builder reads
 * it only where the call site allows it, and the real core accepts it in
 * `veto` and refuses it in `conditions` with a field-naming refusal.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import en from "../../locales/locales/en.json";
import { RuleRefusedError, ruleSchema } from "../rules/ruleSchema";
import { renderRuleSentence, renderVetoSentence, type SentenceTranslator } from "../rules/ruleSentence";
import type { Condition, RuleDocument } from "../rules/types";
import {
    addRow,
    buildComboCondition,
    changeLeafKind,
    comboLockReason,
    emptyComboForm,
    readComboForm,
    replaceRow,
    vetoAsGroup,
} from "./comboConditionForm";

const TF = "1h";
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

const t: SentenceTranslator = (key, values) => {
    const raw = key
        .split(".")
        .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
    if (typeof raw !== "string") throw new Error(`missing locale key: ${key}`);
    return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(values?.[name] ?? ""));
};

const funding: Condition = { kind: "external_feed", feed: "funding_rate", op: "gt", value: "0.01" };
const trigger: Condition = {
    kind: "cross",
    left: { kind: "price", field: "close" },
    direction: "above",
    right: { kind: "constant", value: "60000" },
    timeframe: TF,
};

function documentOf(conditions: Condition, veto?: Condition): RuleDocument {
    return {
        schema_version: 1,
        id: "veto-doc",
        name: "veto",
        symbol: "BTCUSDT",
        trigger_timeframe: TF,
        conditions,
        ...(veto ? { veto } : {}),
        action: { consequence_level: "notify" },
        provenance: { source: "human", created_at_ms: 0 },
    };
}

describe("the feed leaf", () => {
    it("is read where the veto allows it, and locks the trigger editor", () => {
        const group: Condition = { kind: "group", op: "all", of: [funding] };
        expect(readComboForm(group, TF, { allowFeed: true })?.rows[0].kind).toBe("feed");
        expect(readComboForm(group, TF)).toBeNull();
        expect(comboLockReason(group, TF)).toBe("unsupported");
    });

    it("round-trips a stored feed veto exactly", () => {
        const group: Condition = { kind: "group", op: "all", of: [funding] };
        const form = readComboForm(group, TF, { allowFeed: true });
        expect(buildComboCondition(form!, TF)).toEqual(group);
    });

    it("locks a threshold it would rewrite instead of normalising it", () => {
        const spelled: Condition = { ...funding, value: "0.010" } as Condition;
        expect(readComboForm({ kind: "group", op: "all", of: [spelled] }, TF, { allowFeed: true })).toBeNull();
    });

    it("builds nothing until the threshold is a number", () => {
        let form = addRow(emptyComboForm());
        const id = form.rows[0].id;
        form = changeLeafKind(form, id, "feed");
        expect(buildComboCondition(form, TF)).toBeNull();
        form = replaceRow(form, id, { value: "-0.0005" });
        expect(buildComboCondition(form, TF)).toEqual({
            kind: "group",
            op: "all",
            of: [{ kind: "external_feed", feed: "funding_rate", op: "gt", value: "-0.0005" }],
        });
    });

    it("reads a bare stored veto as a one-member group", () => {
        expect(vetoAsGroup(funding)).toEqual({ kind: "group", op: "all", of: [funding] });
        expect(vetoAsGroup(undefined)).toBeNull();
    });
});

describe("the core on a feed", () => {
    it("accepts it inside the veto", () => {
        expect(() => ruleSchema.validate(documentOf(trigger, funding))).not.toThrow();
    });

    it("refuses it inside the trigger, naming the field", () => {
        let refusal: RuleRefusedError | undefined;
        try {
            ruleSchema.validate(documentOf({ kind: "group", op: "all", of: [trigger, funding] }));
        } catch (e) {
            if (e instanceof RuleRefusedError) refusal = e;
        }
        expect(refusal?.refusals.map((r) => r.field)).toContain("conditions.of[1]");
    });
});

describe("the veto sentence", () => {
    it("names a known feed in words, and a veto clause once", () => {
        const document = documentOf(trigger, funding);
        expect(renderVetoSentence(document, t)).toContain("funding rate");
        const sentence = renderRuleSentence(document, t);
        expect(sentence.split("funding rate")).toHaveLength(2);
    });

    it("is null for a rule without a veto", () => {
        expect(renderVetoSentence(documentOf(trigger), t)).toBeNull();
    });
});
