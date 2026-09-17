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

  describe("an anchor that has already been decided", () => {
    /**
     * FEAT-0028 acceptance criterion 3.
     *
     * An exchange revises a candle after the fact — a late trade lands, the
     * close or the volume changes — and the series is rebuilt around it. The
     * trader has already been told what that candle meant. Telling them a
     * second time is worse than saying nothing, because they cannot tell the
     * two apart and may act twice.
     */
    it("does not evaluate a corrected candle the rule already decided", () => {
      const evaluateSpy = vi.spyOn(ruleSchema, "evaluate").mockReturnValue({ verdict: "fires" });
      const ctx = ctxWithCandles(20);

      gate.evaluate(DOCUMENT, ctx, lastAnchor(ctx));
      expect(evaluateSpy).toHaveBeenCalledTimes(1);

      // Same open time, revised numbers: a correction, not a new candle.
      const corrected = ctxWithCandles(20);
      corrected.candles["4h"][19] = { ...corrected.candles["4h"][19], close: "97", volume: "12" };

      expect(gate.evaluate(DOCUMENT, corrected, lastAnchor(corrected))).toBeUndefined();
      expect(evaluateSpy).toHaveBeenCalledTimes(1);
    });

    /**
     * The path that made equality alone insufficient: a reconnect clears the
     * loop's high-water mark, the store refills the series, and evaluation
     * resumes from a candle that was decided before the connection dropped.
     */
    it("does not re-decide an older anchor after a replay", () => {
      const evaluateSpy = vi.spyOn(ruleSchema, "evaluate").mockReturnValue({ verdict: "fires" });

      gate.evaluate(DOCUMENT, ctxWithCandles(20), 19 * STEP_MS);
      gate.evaluate(DOCUMENT, ctxWithCandles(21), 20 * STEP_MS);
      expect(evaluateSpy).toHaveBeenCalledTimes(2);

      // The replay walks back over ground already covered.
      expect(gate.evaluate(DOCUMENT, ctxWithCandles(20), 19 * STEP_MS)).toBeUndefined();
      expect(gate.evaluate(DOCUMENT, ctxWithCandles(21), 20 * STEP_MS)).toBeUndefined();
      expect(evaluateSpy).toHaveBeenCalledTimes(2);
    });

    it("still moves on when a genuinely newer candle arrives after a replay", () => {
      const evaluateSpy = vi.spyOn(ruleSchema, "evaluate").mockReturnValue({ verdict: "fires" });

      gate.evaluate(DOCUMENT, ctxWithCandles(21), 20 * STEP_MS);
      gate.evaluate(DOCUMENT, ctxWithCandles(20), 19 * STEP_MS);

      expect(gate.evaluate(DOCUMENT, ctxWithCandles(22), 21 * STEP_MS)).toEqual({ verdict: "fires" });
      expect(evaluateSpy).toHaveBeenCalledTimes(2);
    });

    it("retries the same anchor after a failed evaluation, which records nothing", () => {
      const evaluateSpy = vi
        .spyOn(ruleSchema, "evaluate")
        .mockImplementationOnce(() => {
          throw new Error("wasm blip");
        })
        .mockReturnValue({ verdict: "fires" });
      const ctx = ctxWithCandles(20);

      expect(() => gate.evaluate(DOCUMENT, ctx, lastAnchor(ctx))).toThrow("wasm blip");

      // The failure must not count as "already decided" — otherwise one blip
      // silences the rule until the next close.
      expect(gate.evaluate(DOCUMENT, ctx, lastAnchor(ctx))).toEqual({ verdict: "fires" });
      expect(evaluateSpy).toHaveBeenCalledTimes(2);
    });

    it("lets an edited rule decide an anchor again, because forget() resets the floor", () => {
      const evaluateSpy = vi.spyOn(ruleSchema, "evaluate").mockReturnValue({ verdict: "fires" });
      const ctx = ctxWithCandles(20);

      gate.evaluate(DOCUMENT, ctx, lastAnchor(ctx));
      gate.forget(DOCUMENT.id);

      expect(gate.evaluate(DOCUMENT, ctx, lastAnchor(ctx))).toEqual({ verdict: "fires" });
      expect(evaluateSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("intrabar evaluation — FEAT-0477", () => {
    /**
     * The close path dedupes an anchor because a closed candle is decided once
     * and never changes afterwards. A forming candle changes on every tick, so
     * the same anchor has to stay answerable — refusing it would let exactly
     * one tick per candle through and make intrabar a slower, worse close.
     */
    it("decides the same forming candle again on every update", () => {
      const evaluateSpy = vi
        .spyOn(ruleSchema, "evaluate")
        .mockReturnValue({ verdict: "does_not_fire" });
      const ctx = ctxWithCandles(15);
      const anchorMs = lastAnchor(ctx);

      gate.evaluateIntrabar(DOCUMENT, ctx, anchorMs);
      gate.evaluateIntrabar(DOCUMENT, ctx, anchorMs);
      gate.evaluateIntrabar(DOCUMENT, ctx, anchorMs);

      expect(evaluateSpy).toHaveBeenCalledTimes(3);
    });

    /**
     * The hazard the second record exists for. An open candle and that same
     * candle once closed share one `open_time_ms`, so through a single record
     * the intrabar look would consume the anchor and the real close would come
     * back as already-decided — intrabar mode silently disabling the close it
     * was layered on top of.
     */
    it("leaves the close of the very same candle still decidable", () => {
      const evaluateSpy = vi.spyOn(ruleSchema, "evaluate").mockReturnValue({ verdict: "fires" });
      const ctx = ctxWithCandles(15);
      const anchorMs = lastAnchor(ctx);

      gate.evaluateIntrabar(DOCUMENT, ctx, anchorMs);

      expect(gate.evaluate(DOCUMENT, ctx, anchorMs)).toEqual({ verdict: "fires" });
      expect(evaluateSpy).toHaveBeenCalledTimes(2);
    });

    /**
     * The mirror image, which matters when a trader switches a live rule from
     * close to intrabar: the close path must not have left a floor the
     * intrabar path then trips over.
     */
    it("leaves the forming candle decidable after its own close was decided", () => {
      const evaluateSpy = vi.spyOn(ruleSchema, "evaluate").mockReturnValue({ verdict: "fires" });
      const ctx = ctxWithCandles(15);
      const anchorMs = lastAnchor(ctx);

      gate.evaluate(DOCUMENT, ctx, anchorMs);

      expect(gate.evaluateIntrabar(DOCUMENT, ctx, anchorMs)).toEqual({ verdict: "fires" });
      expect(evaluateSpy).toHaveBeenCalledTimes(2);
    });

    it("refuses a forming candle that has already rolled over", () => {
      const evaluateSpy = vi.spyOn(ruleSchema, "evaluate").mockReturnValue({ verdict: "fires" });

      gate.evaluateIntrabar(DOCUMENT, ctxWithCandles(21), 20 * STEP_MS);

      // A reconnect replays the previous candle. That one is finished, and
      // reopening it would announce an event the trader already heard about.
      expect(gate.evaluateIntrabar(DOCUMENT, ctxWithCandles(20), 19 * STEP_MS)).toBeUndefined();
      expect(evaluateSpy).toHaveBeenCalledTimes(1);
    });

    it("produces no verdict below warmup, the same as the close path", () => {
      const evaluateSpy = vi.spyOn(ruleSchema, "evaluate");
      const ctx = ctxWithCandles(3);

      expect(gate.evaluateIntrabar(DOCUMENT, ctx, lastAnchor(ctx))).toBeUndefined();
      expect(evaluateSpy).not.toHaveBeenCalled();
    });

    it("forget() clears both records, not only the close one", () => {
      vi.spyOn(ruleSchema, "evaluate").mockReturnValue({ verdict: "fires" });

      gate.evaluateIntrabar(DOCUMENT, ctxWithCandles(21), 20 * STEP_MS);
      gate.forget(DOCUMENT.id);

      // Left behind, the forgotten evaluation's floor would still refuse this
      // older anchor, and an edited rule would go quiet until its series
      // produced a candle newer than the one it was edited on.
      expect(gate.evaluateIntrabar(DOCUMENT, ctxWithCandles(20), 19 * STEP_MS)).toEqual({
        verdict: "fires",
      });
    });
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
