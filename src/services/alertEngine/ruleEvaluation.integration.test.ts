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
 * FEAT-0387 — the chain, end to end, against the real evaluator.
 *
 * Every other test around the rule loop substitutes something: `ruleSchema`'s
 * tests hand it a `fakeCore` with hardcoded verdicts, the gate's tests run on
 * that same fake, and the loop's own tests mock the gate away. Each is right
 * for what it checks, and together they leave one thing unproven — that
 * TypeScript, the wasm evaluator and real candles agree at all.
 *
 * That gap has a specific shape. If the timeframe spelling, the context JSON
 * or the warmup count disagreed between the two sides, the loop would run,
 * produce no verdict, log nothing, and every covered alert would go quiet —
 * BUG-0382 with a new cause. No amount of mocked-out testing can see it,
 * because the mock is the part that would disagree.
 *
 * So this file mocks nothing below the loop: real `RuleEvaluationLoop`, real
 * `ruleEvaluationGate`, real `ruleSchema`, real wasm, and documents built by
 * the same `rule_from_alert_json` the migration uses. The wasm artefact is
 * committed under `static/wasm/`, so this runs anywhere the repo is checked
 * out.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RuleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { EvaluationCandle, RuleDocument } from "../../lib/rules/types";

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../services/logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Resolved from the repo root, not from this file: a bare relative specifier
// in a dynamic import resolves against the importing module's directory.
const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

const CANDLE_OPEN_MS = 1_757_030_400_000;
const MINUTE_MS = 60_000;

interface RuleCore {
  rule_from_alert_json(alertJson: string, timeframe: string, createdAtMs: number): string;
}

let core: RuleCore;

/** A candle in the shape `readClosedCandles` produces from the market store. */
function candle(openTimeMs: number, close: string): EvaluationCandle {
  return {
    open_time_ms: openTimeMs,
    open: close,
    high: close,
    low: close,
    close,
    volume: "1",
  };
}

/** The document the migration would write for a legacy price alert. */
function migratedRule(threshold: string, timeframe = "1m"): RuleDocument {
  const alert = {
    id: "a1",
    symbol: "BTCUSDT",
    condition: { price_reached: threshold },
    active: true,
  };
  return JSON.parse(core.rule_from_alert_json(JSON.stringify(alert), timeframe, CANDLE_OPEN_MS));
}

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  } & RuleCore;
  await mod.default(readFileSync(WASM_BINARY));
  core = mod;

  // The schema service talks to the same module the app loads in the browser.
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
});

describe("rule evaluation against the real wasm core", () => {
  it("migrates a legacy alert into a document the evaluator accepts", () => {
    const rule = migratedRule("50000.0");

    expect(rule).toMatchObject({
      symbol: "BTCUSDT",
      trigger_timeframe: "1m",
      action: { consequence_level: "notify" },
      enabled: true,
    });
    // The threshold the app reads back out of a migrated rule (BUG-0402) has
    // to be where the migration expects it.
    expect(ruleSchema.timeframes(rule)).toEqual(["1m"]);
  });

  it("fires when the close crosses the threshold", () => {
    const rule = migratedRule("50000.0");

    const verdict = ruleSchema.evaluate(rule, {
      candles: { "1m": [candle(CANDLE_OPEN_MS, "49000"), candle(CANDLE_OPEN_MS + MINUTE_MS, "51000")] },
    });

    expect(verdict).toEqual({ verdict: "fires" });
  });

  it("does not fire when the close stays below", () => {
    const rule = migratedRule("50000.0");

    const verdict = ruleSchema.evaluate(rule, {
      candles: { "1m": [candle(CANDLE_OPEN_MS, "49000"), candle(CANDLE_OPEN_MS + MINUTE_MS, "49500")] },
    });

    expect(verdict).toEqual({ verdict: "does_not_fire" });
  });

  it("agrees with the gate about how much history it needs", () => {
    const rule = migratedRule("50000.0");
    const warmup = ruleSchema.warmupCandles(rule);
    const gate = new RuleEvaluationGate();

    expect(warmup).toBeGreaterThan(0);

    // One candle short of warmup: no verdict at all, rather than one built
    // from a partial buffer.
    const short = Array.from({ length: warmup - 1 }, (_, i) =>
      candle(CANDLE_OPEN_MS + i * MINUTE_MS, "49000"),
    );
    expect(
      gate.evaluate(rule, { candles: { "1m": short } }, CANDLE_OPEN_MS),
    ).toBeUndefined();
  });

  describe("the full loop", () => {
    let loop: import("./ruleEvaluationLoop").RuleEvaluationLoop;
    let RuleEvaluationLoop: typeof import("./ruleEvaluationLoop").RuleEvaluationLoop;
    let candles: EvaluationCandle[];

    beforeAll(async () => {
      ({ RuleEvaluationLoop } = await import("./ruleEvaluationLoop"));
    });

    beforeEach(() => {
      candles = [];
      loop = new RuleEvaluationLoop({
        readCandles: () => candles,
        readRules: () => [migratedRule("50000.0")],
        onFiring: () => {},
      });
    });

    /** Feeds one candle the way the market store does, then closes it. */
    function push(openTimeMs: number, close: string) {
      candles = [...candles, candle(openTimeMs, close)];
      return loop.observeCandles("BTCUSDT", "1m", [{ time: openTimeMs + MINUTE_MS }]);
    }

    it("produces a real firing from candles alone", () => {
      loop.observeCandles("BTCUSDT", "1m", [{ time: CANDLE_OPEN_MS }]);
      push(CANDLE_OPEN_MS, "49000");

      const firings = push(CANDLE_OPEN_MS + MINUTE_MS, "51000");

      expect(firings).toHaveLength(1);
      expect(firings[0].verdict).toEqual({ verdict: "fires" });
      expect(firings[0].rule.id).toBe("a1");
    });

    it("evaluates once per close, not once per tick", () => {
      const evaluate = vi.spyOn(ruleSchema, "evaluate");
      loop.observeCandles("BTCUSDT", "1m", [{ time: CANDLE_OPEN_MS }]);
      candles = [candle(CANDLE_OPEN_MS, "49000"), candle(CANDLE_OPEN_MS + MINUTE_MS, "49500")];

      // One close, then several ticks inside the candle that followed it.
      loop.observeCandles("BTCUSDT", "1m", [{ time: CANDLE_OPEN_MS + MINUTE_MS }]);
      const after = evaluate.mock.calls.length;
      loop.observeCandles("BTCUSDT", "1m", [{ time: CANDLE_OPEN_MS + MINUTE_MS }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: CANDLE_OPEN_MS + MINUTE_MS }]);

      expect(after).toBe(1);
      expect(evaluate).toHaveBeenCalledTimes(1);
      evaluate.mockRestore();
    });

    it("stays silent for a rule whose timeframe no series serves", () => {
      // The failure this whole file exists for: a rule anchored on a timeframe
      // the app never observes is simply never selected. It cannot fire, and
      // nothing says so — which is why a shadow run has to count firings
      // rather than assume them.
      loop = new RuleEvaluationLoop({
        readCandles: () => candles,
        readRules: () => [migratedRule("50000.0", "5m")],
        onFiring: () => {},
      });
      loop.observeCandles("BTCUSDT", "1m", [{ time: CANDLE_OPEN_MS }]);
      candles = [candle(CANDLE_OPEN_MS, "49000"), candle(CANDLE_OPEN_MS + MINUTE_MS, "51000")];

      expect(loop.observeCandles("BTCUSDT", "1m", [{ time: CANDLE_OPEN_MS + MINUTE_MS }])).toEqual([]);
    });
  });
});
