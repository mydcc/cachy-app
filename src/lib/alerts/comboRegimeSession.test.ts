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

/** FEAT-0815 — the regime and session rows of the combo builder. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ruleSchema } from "../rules/ruleSchema";
import type { Condition, RuleDocument } from "../rules/types";
import {
    addRow,
    buildComboCondition,
    changeLeafKind,
    emptyComboForm,
    readComboForm,
    replaceRow,
    type ComboForm,
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

function oneRow(kind: "regime" | "session"): { form: ComboForm; id: string } {
    let form = addRow(emptyComboForm());
    const id = form.rows[0].id;
    form = changeLeafKind(form, id, kind);
    return { form, id };
}

function documentOf(conditions: Condition): RuleDocument {
    return {
        schema_version: 1,
        id: "r",
        name: "r",
        symbol: "BTCUSDT",
        trigger_timeframe: TF,
        conditions,
        action: { consequence_level: "notify" },
        provenance: { source: "human", created_at_ms: 0 },
    };
}

describe("the regime row", () => {
    it("builds an atr_percentile comparison and reads it back exactly", () => {
        const { form } = oneRow("regime");
        const built = buildComboCondition(form, TF);
        expect(built).toEqual({
            kind: "group",
            op: "all",
            of: [
                {
                    kind: "compare",
                    left: { kind: "atr_percentile", period: 14, lookback: 100 },
                    op: "gte",
                    right: { kind: "constant", value: "75" },
                    timeframe: TF,
                },
            ],
        });
        expect(buildComboCondition(readComboForm(built, TF)!, TF)).toEqual(built);
    });

    it("stays unbuilt while the percentile is outside 0..100 or not a number", () => {
        const { form, id } = oneRow("regime");
        for (const value of ["101", "-1", "", "high"]) {
            expect(buildComboCondition(replaceRow(form, id, { value }), TF), value).toBeNull();
        }
        expect(buildComboCondition(replaceRow(form, id, { value: "100" }), TF)).not.toBeNull();
    });
});

describe("the session row", () => {
    it("builds a UTC window and reads it back", () => {
        const { form, id } = oneRow("session");
        const next = replaceRow(form, id, { from: "22:00", to: "02:00" });
        const built = buildComboCondition(next, TF);
        expect(built).toEqual({
            kind: "group",
            op: "all",
            of: [{ kind: "session", from: "22:00", to: "02:00", timezone: "UTC" }],
        });
        expect(buildComboCondition(readComboForm(built, TF)!, TF)).toEqual(built);
    });

    it("stays unbuilt for an empty window or a malformed time", () => {
        const { form, id } = oneRow("session");
        expect(buildComboCondition(replaceRow(form, id, { from: "08:00", to: "08:00" }), TF)).toBeNull();
        expect(buildComboCondition(replaceRow(form, id, { from: "8:00" }), TF)).toBeNull();
    });

    it("locks a stored session in another timezone instead of rewriting it", () => {
        const stored = {
            kind: "group",
            op: "all",
            of: [{ kind: "session", from: "08:00", to: "16:00", timezone: "Europe/Berlin" }],
        } as unknown as Condition;
        expect(readComboForm(stored, TF)).toBeNull();
    });
});

describe("in one rule with an existing condition", () => {
    it("is a document the core validates, with the regime's warmup", () => {
        let form = addRow(addRow(addRow(emptyComboForm())));
        form = changeLeafKind(form, form.rows[1].id, "regime");
        form = changeLeafKind(form, form.rows[2].id, "session");
        const built = buildComboCondition(form, TF);
        const document = documentOf(built!);
        expect(() => ruleSchema.validate(document)).not.toThrow();
        // The regime row's 14 + 100 dominates the indicator row's warmup.
        expect(ruleSchema.warmupCandles(document)).toBe(114);
    });
});
