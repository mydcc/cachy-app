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
 * BUG-0483 part 2 — a crossing strictly inside a reconnect gap is decided
 * where it happened.
 *
 * Part 1 stamped the batch's last closed candle while evaluating post-batch
 * history: a `cross` between two skipped candles compared the wrong adjacent
 * pair and never fired, in silence. The loop now replays each skipped close
 * against history truncated to it, oldest first, so the crossing close is the
 * one that fires — with its own anchor, which is what the notification
 * dedupe, the fired history and the bot's entry-price lookup are keyed on.
 *
 * Nothing below the loop is mocked: the real gate (monotonic guard intact),
 * the real schema service, the real wasm core from the committed artefact.
 * The gate mock in `ruleEvaluationLoop.test.ts` answers FIRES to everything
 * and could never tell a recovered crossing from a spurious one.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { EvaluationCandle, RuleDocument } from "../../lib/rules/types";
import { RuleEvaluationLoop, type RuleFiring } from "./ruleEvaluationLoop";

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Resolved from the repo root, not from this file: a bare relative specifier
// in a dynamic import resolves against the importing module's directory.
const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

const MINUTE_MS = 60_000;
const T0 = 1_757_030_400_000;

function candle(openMs: number, close: string): EvaluationCandle {
  return { open_time_ms: openMs, open: close, high: close, low: close, close, volume: "1" };
}

// The series after a five-candle backfill: the cross above 100 happens
// strictly inside the gap, between the 61_000 and 121_000 closes.
const CLOSED = [
  candle(T0, "90"),
  candle(T0 + MINUTE_MS, "90"),
  candle(T0 + 2 * MINUTE_MS, "110"),
  candle(T0 + 3 * MINUTE_MS, "122"),
  candle(T0 + 4 * MINUTE_MS, "127"),
];

function crossRule(id: string): RuleDocument {
  return {
    schema_version: 1,
    id,
    name: "gap cross",
    symbol: "BTCUSDT",
    trigger_timeframe: "1m",
    conditions: {
      kind: "cross",
      left: { kind: "price", field: "close" },
      direction: "above",
      right: { kind: "constant", value: "100" },
      timeframe: "1m",
    },
    action: { consequence_level: "notify" },
    provenance: { source: "human", created_at_ms: T0 },
  };
}

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  };
  await mod.default(readFileSync(WASM_BINARY));

  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
}, 30_000);

describe("a cross strictly inside a reconnect gap — BUG-0483", () => {
  beforeEach(() => {
    ruleEvaluationGate.forget("gap-cross");
  });

  function loopWithHistory(firings: RuleFiring[], closes: number[]) {
    const loop = new RuleEvaluationLoop({
      readCandles: () => CLOSED,
      readRules: () => [crossRule("gap-cross")],
      onFiring: (firing) => {
        firings.push(firing);
      },
      onClose: (_symbol, _timeframe, anchorMs) => {
        closes.push(anchorMs);
      },
    });
    return loop;
  }

  it("fires once, stamped with the crossing close", () => {
    const firings: RuleFiring[] = [];
    const closes: number[] = [];
    const loop = loopWithHistory(firings, closes);

    loop.observeCandles("BTCUSDT", "1m", [{ time: T0 }]);
    loop.observeCandles("BTCUSDT", "1m", [
      { time: T0 + MINUTE_MS },
      { time: T0 + 2 * MINUTE_MS },
      { time: T0 + 3 * MINUTE_MS },
      { time: T0 + 4 * MINUTE_MS },
      { time: T0 + 5 * MINUTE_MS },
    ]);

    expect(firings).toHaveLength(1);
    expect(firings[0].anchorMs).toBe(T0 + 2 * MINUTE_MS);
    // The close hook still runs once, for the newest close.
    expect(closes).toEqual([T0 + 4 * MINUTE_MS]);
  });

  it("withholds the first replayed close when its truncated history is too short", () => {
    // At T0 the truncated history holds a single candle — below any cross
    // warmup — so the gate withholds rather than answering from a partial
    // buffer. The recording above already proves this (no firing at T0); this
    // pins the gate's floor after the replay for the next genuine close.
    const firings: RuleFiring[] = [];
    const closes: number[] = [];
    const loop = loopWithHistory(firings, closes);

    loop.observeCandles("BTCUSDT", "1m", [{ time: T0 }]);
    loop.observeCandles("BTCUSDT", "1m", [
      { time: T0 + MINUTE_MS },
      { time: T0 + 2 * MINUTE_MS },
      { time: T0 + 3 * MINUTE_MS },
      { time: T0 + 4 * MINUTE_MS },
      { time: T0 + 5 * MINUTE_MS },
    ]);

    expect(firings.map((f) => f.anchorMs)).not.toContain(T0);
  });

  it("does not re-fire a replayed anchor the gate already decided", () => {
    const firings: RuleFiring[] = [];
    const closes: number[] = [];
    const loop = loopWithHistory(firings, closes);

    loop.observeCandles("BTCUSDT", "1m", [{ time: T0 }]);
    const batch = [
      { time: T0 + MINUTE_MS },
      { time: T0 + 2 * MINUTE_MS },
      { time: T0 + 3 * MINUTE_MS },
      { time: T0 + 4 * MINUTE_MS },
      { time: T0 + 5 * MINUTE_MS },
    ];
    loop.observeCandles("BTCUSDT", "1m", batch);

    expect(firings).toHaveLength(1);

    // The same batch arriving again — a reconnect replaying what the loop
    // already walked — decides nothing twice.
    loop.observeCandles("BTCUSDT", "1m", batch);

    expect(firings).toHaveLength(1);
  });
});
