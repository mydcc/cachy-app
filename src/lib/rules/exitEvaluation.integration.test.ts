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

/**
 * FEAT-0810 — the exit answers of the real core, against the committed wasm.
 *
 * Every claim here is a claim about the Rust evaluator: that one call answers
 * per exit and for the take-profit target, that a distance resolves from the
 * owned entry rather than the market (the money-path promise), that an
 * account condition inside an exit reads the position-scoped snapshot the
 * caller sends — ADR-0026 decisions 2 and 5 — and that the boundary refuses
 * what a position cannot be. A faked `rule_evaluate_exits` would agree with
 * any answer, so the committed artefact under `static/wasm/` is the only
 * honest witness, and this file fails loudly if the artefact lags the Rust
 * source — the one drift `scripts/build_wasm.sh` is silent about.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { isRuleRefusedError, ruleSchema } from "./ruleSchema";
import type {
    AccountFieldName,
    ExitAnswer,
    ExitClose,
    OwnedPositionContext,
    RuleDocument,
    StopDistance,
} from "./types";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

function candlesCtx(closes: string[]): { candles: Record<string, unknown[]> } {
    const STEP = 4 * 60 * 60 * 1000;
    return {
        candles: {
            "4h": closes.map((close, i) => ({
                open_time_ms: i * STEP,
                open: "100",
                high: "100",
                low: "100",
                close,
                volume: "0",
            })),
        },
    };
}

function exitDocument(overrides: {
    exits?: Array<{ close: ExitClose; fraction?: string }>;
    takeProfit?: StopDistance;
} = {}): RuleDocument {
    return {
        schema_version: 3,
        id: "exit-eval-1",
        name: "exit evaluation fixture",
        symbol: "BTCUSDT",
        trigger_timeframe: "4h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "1" },
            timeframe: "4h",
        },
        action: {
            consequence_level: "simulate",
            order: { side: "buy", size_basis: "percent_of_equity", size: "10" },
        },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
        ...(overrides.exits
            ? {
                  exits: overrides.exits.map((exit) => ({
                      when: {
                          kind: "compare",
                          left: { kind: "price", field: "close" },
                          op: "gte",
                          right: { kind: "constant", value: "120" },
                          timeframe: "4h",
                      },
                      close: exit.close,
                      ...(exit.fraction ? { fraction: exit.fraction } : {}),
                  })),
              }
            : {}),
        ...(overrides.takeProfit ? { take_profit: overrides.takeProfit } : {}),
    };
}

function accountExitDocument(field: AccountFieldName): RuleDocument {
    return {
        ...exitDocument(),
        exits: [
            {
                when: {
                    kind: "account",
                    field,
                    op: "gte",
                    value: "5",
                },
                close: "all",
            },
        ],
    };
}

const LONG_AT_100: OwnedPositionContext = { entry_price: "100", side: "long" };

beforeAll(async () => {
    const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
        default: (binary: BufferSource) => Promise<unknown>;
    };
    await mod.default(readFileSync(WASM_BINARY));
    ruleSchema.setLoader(async () => mod as never);
    await ruleSchema.load();
});

describe("FEAT-0810 — rule_evaluate_exits against the real core", () => {
    it("answers per exit and resolves the take-profit from the owned entry", () => {
        const doc = exitDocument({
            exits: [{ close: "all" }],
            takeProfit: { basis: "percent_of_entry", distance: "10" },
        });

        // The exit's 120 is not reached by a 115 close. The 10 % long target
        // off a 100 entry is 110 — whatever the market did before — and 115
        // reaches it. Two answers, one call, and the market's own level is
        // nowhere in the target's arithmetic.
        const answers = ruleSchema.evaluateExits(doc, candlesCtx(["100", "115"]), LONG_AT_100);

        expect(answers).toEqual(<ExitAnswer[]>[
            { kind: "exit", index: 0, outcome: { result: "does_not_fire" } },
            { kind: "take_profit", index: null, outcome: { result: "fires", close: "all", fraction: null } },
        ]);
    });

    it("carries a partial exit's fraction through, never re-derived", () => {
        const doc = exitDocument({ exits: [{ close: "partial", fraction: "0.5" }] });

        const answers = ruleSchema.evaluateExits(
            doc,
            candlesCtx(["100", "121"]),
            LONG_AT_100,
        );

        expect(answers[0]?.outcome).toEqual({
            result: "fires",
            close: "partial",
            fraction: "0.5",
        });
    });

    it("resolves a short take-profit below its entry, a long's above", () => {
        const doc = exitDocument({ takeProfit: { basis: "percent_of_entry", distance: "10" } });
        const shortAt100: OwnedPositionContext = { entry_price: "100", side: "short" };

        // A short's 10 % target is 90: a 90 close fires, a 90.01 close has
        // not reached it. The same target off the same entry as a long is
        // 110 — one distance, two facings, and neither reads the market.
        expect(
            ruleSchema.evaluateExits(doc, candlesCtx(["100", "90"]), shortAt100)[0]?.outcome,
        ).toEqual({ result: "fires", close: "all", fraction: null });
        expect(
            ruleSchema.evaluateExits(doc, candlesCtx(["100", "90.01"]), shortAt100)[0]?.outcome,
        ).toEqual({ result: "does_not_fire" });
    });

    it("an account condition inside an exit reads the caller's position-scoped snapshot", () => {
        const doc = accountExitDocument("unrealised_pnl_percent");

        const profitable = candlesCtx(["100", "101"]);
        profitable.account = {
            position_size: "0.02",
            unrealised_pnl: "1.2",
            unrealised_pnl_percent: "6",
            exposure: "200",
            available_balance: "10000",
        };

        // The snapshot says 6 against a 5 threshold — the caller scoped it to
        // the owned position, and the core honours exactly what it is given.
        expect(ruleSchema.evaluateExits(doc, profitable, LONG_AT_100)[0]?.outcome).toEqual({
            result: "fires",
            close: "all",
            fraction: null,
        });

        // No snapshot is not false: it is a condition that could not be read.
        const bare = ruleSchema.evaluateExits(doc, candlesCtx(["100", "101"]), LONG_AT_100);
        expect(bare[0]?.outcome).toMatchObject({ result: "unknown" });
    });

    it("an unreadable exit is unknown and does not block a readable one", () => {
        const doc = exitDocument({ exits: [{ close: "all" }, { close: "all" }] });
        // The second exit reads an RSI series the context does not carry:
        // unknown, and the first still answers.
        doc.exits = [
            {
                when: {
                    kind: "compare",
                    left: { kind: "price", field: "close" },
                    op: "gte",
                    right: { kind: "constant", value: "110" },
                    timeframe: "4h",
                },
                close: "all",
            },
            {
                when: {
                    kind: "compare",
                    left: {
                        kind: "indicator",
                        indicator: { id: "rsi", params: { period: 14 }, output: "value" },
                    },
                    op: "lt",
                    right: { kind: "constant", value: "30" },
                    timeframe: "4h",
                },
                close: "all",
            },
        ];

        const answers = ruleSchema.evaluateExits(doc, candlesCtx(["100", "111"]), LONG_AT_100);

        expect(answers[0]?.outcome).toEqual({ result: "fires", close: "all", fraction: null });
        expect(answers[1]?.outcome).toMatchObject({ result: "unknown" });
    });

    it("refuses `either` as a facing, naming the field", () => {
        const doc = exitDocument({ takeProfit: { basis: "percent_of_entry", distance: "10" } });
        // The TS type keeps `either` out at compile time; the boundary keeps
        // it out for callers that cast. Both name the field.
        let refused: unknown;
        try {
            ruleSchema.evaluateExits(doc, candlesCtx(["100", "115"]), {
                entry_price: "100",
                side: "either",
            } as OwnedPositionContext);
        } catch (e) {
            refused = e;
        }
        expect(isRuleRefusedError(refused)).toBe(true);
        if (isRuleRefusedError(refused)) {
            expect(refused.refusals[0]?.field).toBe("position.side");
        }
    });
});
