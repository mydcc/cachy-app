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
 * FEAT-0391 -- the template library, held against the real rule core.
 *
 * Every assertion iterates the whole library, so a template added later is
 * covered by the same checks without anyone remembering to add a case: it
 * validates, it opens in the Combo builder unchanged, it hashes the same for
 * every trader who loads it, it cannot arrive above `notify`, and its strings
 * exist in both locales.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";

import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import { ruleSchema } from "../rules/ruleSchema";
import type { RuleDocument } from "../rules/types";
import { buildComboCondition, readComboForm } from "./comboConditionForm";
import { catalogueEntry, nameKey } from "./indicatorCatalogue";
import {
    ALERT_TEMPLATES,
    TEMPLATE_CATEGORY_ORDER,
    offeredCategories,
    templateCategoryKey,
    templateDescriptionKey,
    templateDocument,
    templateIndicators,
    templateNameKey,
    templatesIn,
} from "./templateLibrary";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

/** A blank draft the way the panel starts one, with fixed local identity. */
function base(overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 1,
        id: "draft-1",
        name: "",
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: { kind: "group", op: "all", of: [] },
        action: { consequence_level: "notify" },
        enabled: true,
        provenance: { source: "human", created_at_ms: 1_757_030_400_000 },
        frequency: "once",
        trigger_methods: [],
        ...overrides,
    };
}

function lookup(dictionary: unknown, key: string): unknown {
    let current: unknown = dictionary;
    for (const part of key.split(".")) {
        if (!current || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

beforeAll(async () => {
    const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
        default: (binary: BufferSource) => Promise<unknown>;
    };
    await mod.default(readFileSync(WASM_BINARY));
    ruleSchema.setLoader(async () => mod as never);
    await ruleSchema.load();
});

describe("the shipped template library", () => {
    it("has unique ids", () => {
        const ids = ALERT_TEMPLATES.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it.each(ALERT_TEMPLATES.map((entry) => [entry.id, entry] as const))(
        "%s passes validate()",
        (_id, entry) => {
            expect(() => ruleSchema.validate(templateDocument(entry, base(), "t"))).not.toThrow();
        },
    );

    it.each(ALERT_TEMPLATES.map((entry) => [entry.id, entry] as const))(
        "%s opens in the Combo builder and is written back unchanged",
        (_id, entry) => {
            // The builder rewrites the draft from its form on mount. A template
            // it cannot read loads into a locked tab; one it reads lossily is
            // no longer the template the moment the tab opens.
            const form = readComboForm(entry.conditions, entry.timeframe);
            expect(form).not.toBeNull();
            expect(buildComboCondition(form!, entry.timeframe)).toEqual(entry.conditions);
        },
    );

    it("names only indicators the alert path can compute", () => {
        for (const entry of ALERT_TEMPLATES) {
            for (const id of templateIndicators(entry)) {
                expect(catalogueEntry(id), `${entry.id} reads ${id}`).not.toBeNull();
            }
        }
    });
});

describe("the document a template becomes", () => {
    it("hashes the same for two traders' unedited copies", () => {
        for (const entry of ALERT_TEMPLATES) {
            const mine = templateDocument(entry, base(), "MACD golden cross");
            const theirs = templateDocument(
                entry,
                base({ id: "other-draft", provenance: { source: "human", created_at_ms: 42 } }),
                "MACD-Golden-Cross",
            );
            expect(ruleSchema.contentHash(theirs), entry.id).toBe(ruleSchema.contentHash(mine));
        }
    });

    it("hashes differently once a trader edits a threshold", () => {
        const entry = ALERT_TEMPLATES.find((candidate) => candidate.id === "macd_golden_cross_rsi_oversold")!;
        const unedited = templateDocument(entry, base(), "t");
        const edited = structuredClone(unedited);
        const group = edited.conditions;
        if (group.kind !== "group" || group.of[1].kind !== "compare") throw new Error("unexpected shape");
        group.of[1].right = { kind: "constant", value: "25" };
        expect(ruleSchema.contentHash(edited)).not.toBe(ruleSchema.contentHash(unedited));
    });

    it("arrives at notify, authored by a human, whatever the draft it replaced carried", () => {
        const armed = base({
            action: {
                consequence_level: "send",
                order: { side: "buy", size_basis: "quote_notional", size: "100" },
            },
            provenance: { source: "model", created_at_ms: 7, model: "some-model" },
            veto: { kind: "external_feed", feed: "fear_greed", op: "lt", value: "20" },
        });
        for (const entry of ALERT_TEMPLATES) {
            const document = templateDocument(entry, armed, "t");
            expect(document.action).toEqual({ consequence_level: "notify" });
            expect(document.provenance).toEqual({ source: "human", created_at_ms: 7 });
            expect(document.veto).toBeUndefined();
            expect(() => ruleSchema.authorise(document, "notify")).not.toThrow();
            expect(() => ruleSchema.authorise(document, "simulate")).toThrow();
        }
    });

    it("copies the conditions, so editing a loaded rule cannot reach the library", () => {
        const entry = ALERT_TEMPLATES[0];
        const before = structuredClone(entry.conditions);
        const document = templateDocument(entry, base(), "t");
        if (document.conditions.kind === "group") document.conditions.of.length = 0;
        expect(entry.conditions).toEqual(before);
    });
});

describe("categories", () => {
    it("filters the list to one category, and shows everything for none", () => {
        expect(templatesIn(null)).toEqual(ALERT_TEMPLATES);
        for (const category of TEMPLATE_CATEGORY_ORDER) {
            const shown = templatesIn(category);
            expect(shown.every((entry) => entry.category === category)).toBe(true);
            expect(shown).toHaveLength(ALERT_TEMPLATES.filter((e) => e.category === category).length);
        }
    });

    it("offers exactly the categories that have a template", () => {
        expect(offeredCategories()).toEqual(
            TEMPLATE_CATEGORY_ORDER.filter((category) => templatesIn(category).length > 0),
        );
        expect(offeredCategories()).toEqual(TEMPLATE_CATEGORY_ORDER);
    });
});

describe("template strings", () => {
    const keys = [
        ...ALERT_TEMPLATES.flatMap((entry) => [templateNameKey(entry.id), templateDescriptionKey(entry.id)]),
        ...TEMPLATE_CATEGORY_ORDER.map(templateCategoryKey),
        ...ALERT_TEMPLATES.flatMap(templateIndicators).map(nameKey),
    ];

    it.each([
        ["German", de],
        ["English", en],
    ] as const)("every template name, description and category exists in %s", (_locale, dictionary) => {
        for (const key of keys) {
            const value = lookup(dictionary, key);
            expect(typeof value === "string" && value.trim().length > 0, key).toBe(true);
        }
    });

    it("carries the same template keys in German and English", () => {
        const flatten = (node: unknown, prefix = ""): string[] =>
            node && typeof node === "object"
                ? Object.entries(node).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k))
                : [prefix];
        const subtree = (dictionary: unknown) => {
            const node = lookup(dictionary, "dashboard.alerts.templates");
            // A subtree missing from both locales would otherwise flatten to the
            // same `[""]` on both sides and pass.
            expect(node && typeof node === "object").toBe(true);
            return flatten(node).sort();
        };
        expect(subtree(de)).toEqual(subtree(en));
    });
});
