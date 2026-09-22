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
 * BUG-0482 acceptance criterion 2 — the local mark-timeframe mirror must agree
 * with the core over every condition and operand shape in `types.ts`.
 *
 * ## Why a corpus test, not a unit test of one shape
 *
 * `collectMarkTimeframes` is the local mirror of `RuleDocument::mark_timeframes`
 * in the core, and its docstring says the two must agree. The recursion fix for
 * `window{of: price(mark)}` repairs today's shape; what stops the *next* nested
 * operand re-opening this is a test that holds the two implementations against
 * each other over the whole schema — every `Condition` variant, every `Operand`
 * variant, conditions and veto, single and multiple timeframes.
 *
 * ## What is compared
 *
 * The real core export `rule_mark_timeframes`, from the committed artefact
 * under `static/wasm/` (the same pattern as `crossPathParity.test.ts`), against
 * the exported `collectMarkTimeframes`. Both sides are pure structural walks —
 * the core's `mark_timeframes_json` parses but does not validate — so the
 * corpus stays on the structural axis: no claim is made here about which
 * documents the core would *accept*, only about which series each side says a
 * document *reads*. Sets are compared sorted; walk order is not part of the
 * contract.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Condition, Operand, RuleDocument } from "../../lib/rules/types";
import { collectMarkTimeframes, RuleEvaluationLoop } from "./ruleEvaluationLoop";

// Resolved from the repo root, not from this file: a bare relative specifier
// in a dynamic import resolves against the importing module's directory.
const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

interface MarkTimeframesCore {
  rule_mark_timeframes(documentJson: string): string[];
}

let core: MarkTimeframesCore;

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  } & MarkTimeframesCore;
  await mod.default(readFileSync(WASM_BINARY));
  core = mod;
}, 30_000);

/** A full document the core parses: required fields, nothing unknown. */
function doc(
  conditions: Condition,
  veto?: Condition,
  consequence_level: "notify" | "simulate" = "notify",
): RuleDocument {
  return {
    schema_version: 1,
    id: "parity",
    name: "parity",
    symbol: "BTCUSDT",
    trigger_timeframe: "1m",
    conditions,
    ...(veto === undefined ? {} : { veto }),
    action:
      // A `simulate` rule must say what it would submit; the order is inert
      // here — parity is about which series the conditions read, not about
      // consequences.
      consequence_level === "simulate"
        ? { consequence_level, order: { side: "buy", size_basis: "quote_notional", size: "100" } }
        : { consequence_level },
    provenance: { source: "human", created_at_ms: 1_757_030_400_000 },
  };
}

const last = (field: "open" | "high" | "low" | "close" = "close"): Operand => ({
  kind: "price",
  field,
});
const mark = (field: "open" | "high" | "low" | "close" = "close"): Operand => ({
  kind: "price",
  field,
  source: "mark",
});
const constant = (value = "60000"): Operand => ({ kind: "constant", value });
const windowOf = (of: Operand): Operand => ({
  kind: "window",
  of,
  agg: "max",
  lookback: 20,
});

interface CorpusCase {  name: string;
  conditions: Condition;
  veto?: Condition;
  /**
   * Documents the core refuses before ever walking them. Those shapes still
   * belong to the schema — the TS mirror must answer them structurally — but
   * there is no core walk to hold them against, so they are asserted literally
   * instead of through the parity loop below.
   */
  tsOnly?: string[];
  /** A `notify` rule cannot read account state; position and account need `simulate`. */
  consequence_level?: "notify" | "simulate";
}

const CORPUS: CorpusCase[] = [
  {
    name: "compare on the last price reads no mark series",
    conditions: { kind: "compare", left: last(), op: "gte", right: constant(), timeframe: "1m" },
  },
  {
    name: "compare on the mark price reads it",
    conditions: { kind: "compare", left: mark(), op: "gte", right: constant(), timeframe: "1m" },
  },
  {
    name: "cross on the mark price reads the condition's timeframe, not the trigger's",
    conditions: { kind: "cross", left: mark(), direction: "above", right: constant(), timeframe: "4h" },
  },
  {
    name: "cross on the last price reads no mark series",
    conditions: { kind: "cross", left: last("high"), direction: "above", right: constant(), timeframe: "1m" },
  },
  // BUG-0482 — the window carries no `source` of its own; the mark sits on `of`.
  {
    name: "compare against a window over the mark price reads it",
    conditions: { kind: "compare", left: last(), op: "gte", right: windowOf(mark("high")), timeframe: "1m" },
  },
  {
    name: "a mark price beside a window over the mark price reads it once",
    conditions: { kind: "compare", left: mark(), op: "gte", right: windowOf(mark("high")), timeframe: "1h" },
  },
  {
    name: "a window over the last price reads no mark series",
    conditions: { kind: "compare", left: last(), op: "gte", right: windowOf(last("high")), timeframe: "1m" },
  },
  {
    name: "a window over a window over the mark price still reads it on both sides",
    conditions: { kind: "compare", left: windowOf(windowOf(mark())), op: "gte", right: constant(), timeframe: "1m" },
    // The core refuses a nested window at validation, before walking it — so
    // this shape can never reach either walk in production. Asserted literally
    // to pin the structural recursion on the TS side.
    tsOnly: ["1m"],
  },
  {
    name: "volume against a constant reads no mark series",
    conditions: { kind: "compare", left: { kind: "volume" }, op: "gte", right: constant("100"), timeframe: "1m" },
  },
  {
    name: "percent_change over the mark price reads it",
    conditions: {
      kind: "compare",
      left: { kind: "percent_change", field: "close", source: "mark", lookback: 3 },
      op: "gte",
      right: constant("5"),
      timeframe: "1m",
    },
  },
  {
    name: "percent_change over the last price reads no mark series",
    conditions: {
      kind: "compare",
      left: { kind: "percent_change", field: "close", lookback: 3 },
      op: "gte",
      right: constant("5"),
      timeframe: "1m",
    },
  },
  {
    name: "an indicator against a constant reads no mark series on either side",
    conditions: {
      kind: "compare",
      left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
      op: "gte",
      right: constant("70"),
      timeframe: "1m",
    },
  },
  {
    name: "a constant against a constant reads no mark series",
    conditions: { kind: "compare", left: constant("1"), op: "gte", right: constant("2"), timeframe: "1m" },
  },
  {
    name: "a group collects the mark timeframes of its members",
    conditions: {
      kind: "group",
      op: "all",
      of: [
        { kind: "compare", left: mark(), op: "gte", right: constant(), timeframe: "1m" },
        { kind: "compare", left: last(), op: "gte", right: constant(), timeframe: "4h" },
      ],
    },
  },
  {
    name: "a group with a nested group finds a windowed mark inside",
    conditions: {
      kind: "group",
      op: "any",
      of: [
        {
          kind: "group",
          op: "all",
          of: [{ kind: "compare", left: last(), op: "gte", right: windowOf(mark("high")), timeframe: "4h" }],
        },
        { kind: "compare", left: last(), op: "gte", right: constant(), timeframe: "1m" },
      ],
    },
  },
  {
    name: "an empty group reads no mark series",
    conditions: { kind: "group", op: "all", of: [] },
    // Refused by the core (a group with no members has no truth value), so
    // asserted literally on the TS side only.
    tsOnly: [],
  },
  {
    name: "a candlestick pattern reads no mark series",
    conditions: { kind: "pattern", pattern: "hammer", timeframe: "1m" },
  },
  {
    name: "a position condition reads no mark series",
    conditions: { kind: "position", side: "long", open: true },
    consequence_level: "simulate",
  },
  {
    name: "an account condition reads no mark series",
    conditions: { kind: "account", field: "exposure", op: "gte", value: "1000" },
    consequence_level: "simulate",
  },
  {
    name: "an external feed in the veto reads no mark series",
    conditions: { kind: "compare", left: last(), op: "gte", right: constant(), timeframe: "1m" },
    veto: { kind: "external_feed", feed: "news-sentiment", op: "gte", value: "0.5" },
  },
  {
    name: "a veto naming a mark window is collected while mark-free conditions are not",
    conditions: { kind: "compare", left: last(), op: "gte", right: constant(), timeframe: "1m" },
    veto: { kind: "compare", left: last(), op: "gte", right: windowOf(mark("high")), timeframe: "4h" },
  },
  {
    name: "conditions and veto together collect both mark timeframes",
    conditions: { kind: "compare", left: mark(), op: "gte", right: constant(), timeframe: "1m" },
    veto: { kind: "cross", left: mark(), direction: "below", right: constant(), timeframe: "4h" },
  },
  {
    name: "a cross of two windows reads the mark side's timeframe",
    conditions: { kind: "cross", left: windowOf(mark()), direction: "above", right: windowOf(last()), timeframe: "1m" },
  },
];

/** The core answers refusals as a JS value; render it readably on failure. */
function tryStringify(e: unknown): string {
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

describe("mark-timeframe parity with the core — BUG-0482", () => {
  for (const { name, conditions, veto, tsOnly, consequence_level } of CORPUS) {
    it(`TS and core agree: ${name}`, () => {
      const document = doc(conditions, veto, consequence_level);

      const fromTs = [...collectMarkTimeframes(document)].sort();
      if (tsOnly !== undefined) {
        expect(fromTs).toEqual(tsOnly);
        return;
      }
      let fromCore: string[];
      try {
        fromCore = [...core.rule_mark_timeframes(JSON.stringify(document))].sort();
      } catch (e) {
        throw new Error(`core refused a corpus document (${name}): ${tryStringify(e)}`);
      }

      expect(fromTs).toEqual(fromCore);
    });
  }

  it("the BUG-0482 document names its mark timeframe on both sides", () => {
    const document = doc({
      kind: "compare",
      left: last(),
      op: "gte",
      right: windowOf(mark("high")),
      timeframe: "1m",
    });

    expect([...collectMarkTimeframes(document)]).toEqual(["1m"]);
    expect([...core.rule_mark_timeframes(JSON.stringify(document))].sort()).toEqual(["1m"]);
  });

  it("a mark-free document sends no mark_candles key on either side", () => {
    const document = doc({
      kind: "compare",
      left: last(),
      op: "gte",
      right: windowOf(last("high")),
      timeframe: "1m",
    });

    expect([...collectMarkTimeframes(document)]).toEqual([]);
    expect([...core.rule_mark_timeframes(JSON.stringify(document))]).toEqual([]);
  });

  /**
   * The parity holds at the loop level too, not just on the exported seam:
   * the evaluation context of a windowed-mark rule carries `mark_candles`,
   * and a mark-free rule's context has no such key.
   */
  it("the loop wires the agreed timeframes into the evaluation context", async () => {
    const { ruleEvaluationGate } = await import("../../lib/rules/ruleEvaluationGate");
    const gateSpy = vi.spyOn(ruleEvaluationGate, "evaluate").mockReturnValue(undefined);

    try {
      const marks: unknown[] = [];
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readMarkCandles: () => marks as never,
        readRules: () => [
          {
            ...doc({
              kind: "compare",
              left: last(),
              op: "gte",
              right: windowOf(mark("high")),
              timeframe: "1m",
            }),
            id: "windowed-mark",
          },
        ],
        onFiring: () => {},
      });
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      const ctx = gateSpy.mock.calls[0][1] as unknown as Record<string, unknown>;
      expect(ctx).toHaveProperty("mark_candles", { "1m": marks });
    } finally {
      gateSpy.mockRestore();
    }
  });
});
