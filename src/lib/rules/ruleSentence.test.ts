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
import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import { formatIndicator, renderRuleSentence, type SentenceTranslator } from "./ruleSentence";
import type { Condition, RuleDocument } from "./types";

/**
 * Resolves against the real locale files rather than a stub dictionary. A stub
 * would keep passing after someone deletes a key from de.json, which is the
 * failure this suite exists to catch — the sentence is the thing a trader arms
 * an alarm from, so a missing fragment is a correctness bug, not a cosmetic one.
 */
function translatorFor(bundle: Record<string, unknown>): SentenceTranslator {
    return (key, values) => {
        const raw = key.split(".").reduce<unknown>(
            (node, part) => (node as Record<string, unknown> | undefined)?.[part],
            bundle,
        );
        if (typeof raw !== "string") throw new Error(`missing locale key: ${key}`);
        if (!values) return raw;
        return raw.replace(/\{(\w+)\}/g, (_match, name: string) =>
            String(values[name] ?? ""),
        );
    };
}

const dt = translatorFor(de as unknown as Record<string, unknown>);
const et = translatorFor(en as unknown as Record<string, unknown>);

function ruleWith(conditions: Condition, overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 1,
        id: "r1",
        name: "test",
        symbol: "BTCUSDT",
        trigger_timeframe: "4h",
        conditions,
        action: { consequence_level: "notify" },
        provenance: { source: "human", created_at_ms: 0 },
        ...overrides,
    };
}

const rsiBelow30: Condition = {
    kind: "compare",
    left: { kind: "indicator", indicator: { id: "rsi", params: { length: 14 } } },
    op: "lt",
    right: { kind: "constant", value: "30" },
    timeframe: "4h",
};

const macdCross: Condition = {
    kind: "cross",
    left: { kind: "indicator", indicator: { id: "macd", params: { fast: 12, slow: 26, signal: 9 } } },
    direction: "above",
    right: {
        kind: "indicator",
        indicator: { id: "macd", params: { fast: 12, slow: 26, signal: 9 }, output: "signal" },
    },
    timeframe: "4h",
};

describe("formatIndicator", () => {
    it("renders parameters in document order, not sorted order", () => {
        expect(
            formatIndicator({ id: "macd", params: { fast: 12, slow: 26, signal: 9 } }),
        ).toBe("MACD(12,26,9)");
    });

    it("appends a named output but leaves the default `value` implicit", () => {
        expect(formatIndicator({ id: "rsi", params: { length: 14 }, output: "value" })).toBe("RSI(14)");
        expect(
            formatIndicator({ id: "macd", params: { fast: 12 }, output: "signal" }),
        ).toBe("MACD(12).signal");
    });

    it("renders a parameterless indicator without empty brackets", () => {
        expect(formatIndicator({ id: "vwap", params: {} })).toBe("VWAP");
    });
});

describe("renderRuleSentence", () => {
    it("writes a single compare condition as a German sentence", () => {
        expect(renderRuleSentence(ruleWith(rsiBelow30), dt)).toBe(
            "Benachrichtigt, wenn auf dem 4h-Close RSI(14) unter 30",
        );
    });

    it("writes the same rule as an English sentence", () => {
        expect(renderRuleSentence(ruleWith(rsiBelow30), et)).toBe(
            "Notifies when, on the 4h close, RSI(14) is below 30",
        );
    });

    it("joins an `all` group with the locale's conjunction", () => {
        const combo = ruleWith({ kind: "group", op: "all", of: [rsiBelow30, macdCross] });
        expect(renderRuleSentence(combo, dt)).toContain(
            "RSI(14) unter 30 und MACD(12,26,9) kreuzt nach oben über MACD(12,26,9).signal",
        );
        expect(renderRuleSentence(combo, et)).toContain(
            "RSI(14) is below 30 and MACD(12,26,9) crosses above MACD(12,26,9).signal",
        );
    });

    it("joins an `any` group with the disjunction instead", () => {
        const either = ruleWith({ kind: "group", op: "any", of: [rsiBelow30, macdCross] });
        expect(renderRuleSentence(either, dt)).toContain("unter 30 oder MACD");
        expect(renderRuleSentence(either, et)).toContain("below 30 or MACD");
    });

    it("negates a `none` group so it cannot read as its own opposite", () => {
        const negated = ruleWith({ kind: "group", op: "none", of: [rsiBelow30] });
        expect(renderRuleSentence(negated, dt)).toContain("nicht RSI(14) unter 30");
        expect(renderRuleSentence(negated, et)).toContain("not RSI(14) is below 30");
    });

    it("parenthesises a nested group but never a leaf", () => {
        const nested = ruleWith({
            kind: "group",
            op: "all",
            of: [rsiBelow30, { kind: "group", op: "any", of: [rsiBelow30, macdCross] }],
        });
        const sentence = renderRuleSentence(nested, et);
        expect(sentence).toContain("(RSI(14) is below 30 or MACD");
        expect(sentence).not.toContain("((");
    });

    it("names a condition's timeframe only when it differs from the anchor", () => {
        const sameAnchor = renderRuleSentence(ruleWith(rsiBelow30), et);
        expect(sameAnchor).not.toContain("(on 4h)");

        const otherTimeframe = renderRuleSentence(
            ruleWith({ ...rsiBelow30, timeframe: "1h" }),
            et,
        );
        expect(otherTimeframe).toContain("(on 1h)");
    });

    it("appends the veto as an exception clause", () => {
        const vetoed = ruleWith(rsiBelow30, {
            veto: { kind: "position", side: "long", open: true },
        });
        expect(renderRuleSentence(vetoed, dt)).toContain(
            "— außer wenn eine Long-Position offen ist.",
        );
        expect(renderRuleSentence(vetoed, et)).toContain("— unless a long position is open.");
    });

    it("states the order when the consequence actually submits one", () => {
        const sending = ruleWith(rsiBelow30, {
            action: {
                consequence_level: "send",
                order: { side: "buy", size_basis: "percent_risk", size: "1" },
            },
        });
        expect(renderRuleSentence(sending, dt)).toContain("Sendet eine Kauf-Order über 1 % Risiko");
        expect(renderRuleSentence(sending, et)).toContain("Sends a buy order for 1 % risk");
    });

    it("renders an account condition without a timeframe qualifier", () => {
        const account = ruleWith({
            kind: "account",
            field: "unrealised_pnl_percent",
            op: "gte",
            value: "5",
        });
        expect(renderRuleSentence(account, et)).toContain(
            "the unrealised profit in % is at least 5",
        );
    });

    it("does not blank the sentence for a half-built rule", () => {
        const empty = ruleWith({ kind: "group", op: "all", of: [] });
        expect(renderRuleSentence(empty, dt)).toContain("(noch keine Bedingung)");
        expect(renderRuleSentence(empty, et)).toContain("(no condition yet)");
    });
});
