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

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { RuleEvaluationGate } from "./ruleEvaluationGate";
import { ruleSchema } from "./ruleSchema";
import type { EvaluationContext, RuleDocument, Verdict } from "./types";

vi.mock("../../services/logger", () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const DOCUMENT: RuleDocument = {
  schema_version: 1,
  id: "rule-1",
  name: "RSI dip",
  symbol: "BTCUSDT",
  trigger_timeframe: "4h",
  conditions: {
    kind: "compare",
    left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
    op: "lt",
    right: { kind: "constant", value: "30" },
    timeframe: "4h",
  },
  action: { consequence_level: "notify" },
  enabled: true,
  provenance: { source: "human", created_at_ms: 1_700_000_000_000 },
};

const STEP_MS = 4 * 60 * 60 * 1000;

/** `n` closed 4h candles, oldest first. Only `open_time_ms` matters here. */
function ctxWithCandles(n: number): EvaluationContext {
  const candles = Array.from({ length: n }, (_, i) => ({
    open_time_ms: i * STEP_MS,
    open: "100",
    high: "100",
    low: "100",
    close: "100",
    volume: "0",
  }));
  return { candles: { "4h": candles } };
}

function lastAnchor(ctx: EvaluationContext): number {
  const candles = ctx.candles["4h"];
  return candles[candles.length - 1].open_time_ms;
}

describe("RuleEvaluationGate", () => {
  let gate: RuleEvaluationGate;

  beforeEach(() => {
    gate = new RuleEvaluationGate();
    vi.spyOn(ruleSchema, "warmupCandles").mockReturnValue(15);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("evaluates exactly once for several ticks sharing the same anchor", () => {
    const verdict: Verdict = { verdict: "fires" };
    const evaluateSpy = vi.spyOn(ruleSchema, "evaluate").mockReturnValue(verdict);
    const ctx = ctxWithCandles(15);
    const anchorMs = lastAnchor(ctx);

    const first = gate.evaluate(DOCUMENT, ctx, anchorMs);
    const second = gate.evaluate(DOCUMENT, ctx, anchorMs);
    const third = gate.evaluate(DOCUMENT, ctx, anchorMs);

    expect(evaluateSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(verdict);
    expect(second).toBeUndefined();
    expect(third).toBeUndefined();
  });

  it("evaluates again once the anchor advances to a new closed candle", () => {
    const evaluateSpy = vi
      .spyOn(ruleSchema, "evaluate")
      .mockReturnValue({ verdict: "does_not_fire" });

    const firstCtx = ctxWithCandles(15);
    gate.evaluate(DOCUMENT, firstCtx, lastAnchor(firstCtx));

    const nextCtx = ctxWithCandles(16);
    gate.evaluate(DOCUMENT, nextCtx, lastAnchor(nextCtx));

    expect(evaluateSpy).toHaveBeenCalledTimes(2);
  });

  it("produces no verdict at all below warmup, rather than one built from a partial buffer", () => {
    const evaluateSpy = vi.spyOn(ruleSchema, "evaluate");
    const ctx = ctxWithCandles(3); // fewer than the mocked warmup of 15
    const result = gate.evaluate(DOCUMENT, ctx, lastAnchor(ctx));

    expect(result).toBeUndefined();
    expect(evaluateSpy).not.toHaveBeenCalled();
  });

  it("forget() clears the remembered anchor so the next call evaluates again", () => {
    const evaluateSpy = vi
      .spyOn(ruleSchema, "evaluate")
      .mockReturnValue({ verdict: "fires" });
    const ctx = ctxWithCandles(15);
    const anchorMs = lastAnchor(ctx);

    gate.evaluate(DOCUMENT, ctx, anchorMs);
    gate.forget(DOCUMENT.id);
    gate.evaluate(DOCUMENT, ctx, anchorMs);

    expect(evaluateSpy).toHaveBeenCalledTimes(2);
  });
});
