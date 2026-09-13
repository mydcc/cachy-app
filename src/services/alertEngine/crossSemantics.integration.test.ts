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
 * BUG-0464 — the oracles' definition of a cross, checked against the real
 * evaluator where the two conventions part: a value landing exactly on the
 * level.
 *
 * The recorded fixtures never put a value exactly on a level, so the oracles
 * could carry another convention than the core for as long as they did. This
 * walks closes that touch, sit on and leave a level from both sides, and
 * requires `crossedLikeTheCore` to answer what the evaluator answers at every
 * candle.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { Condition, EvaluationCandle, RuleDocument, Verdict } from "../../lib/rules/types";
import { crossedLikeTheCore, signOf } from "../__fixtures__/crossedLikeTheCore";

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");
const TIMEFRAME = "1h";
const START_MS = 1_757_030_400_000;
const LEVEL = 100;
// Both definitions agree on a walk that never fires, so the walk must fire:
// the closes below meet the level four times in each direction.
const MIN_FIRINGS = 4;

/**
 * Every way a close can meet the level: touch from below and fall back, touch
 * from above and bounce, sit on it, cross straight through, and leave it both
 * ways.
 */
const CLOSES = [99, 100, 99, 101, 100, 101, 100, 100, 99, 100, 100, 101, 102, 98, 100, 102, 100, 98];

let template: RuleDocument;

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
    rule_from_alert_json(alertJson: string, timeframe: string, createdAtMs: number): string;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();

  const alert = { id: "ties", symbol: "BTCUSDT", condition: { price_reached: "50000.0" }, active: true };
  template = JSON.parse(mod.rule_from_alert_json(JSON.stringify(alert), TIMEFRAME, START_MS));
});

const candles: EvaluationCandle[] = CLOSES.map((close, i) => ({
  open_time_ms: START_MS + i * 3_600_000,
  open: String(close),
  high: String(close),
  low: String(close),
  close: String(close),
  volume: "1",
}));

describe("a cross that lands exactly on the level", () => {
  it.each(["above", "below"] as const)(
    "the oracles' definition answers what the evaluator answers, crossing %s",
    (direction) => {
      const conditions = {
        kind: "cross",
        left: { kind: "price", field: "close" },
        direction,
        right: { kind: "constant", value: String(LEVEL) },
        timeframe: TIMEFRAME,
      } as unknown as Condition;
      const rule: RuleDocument = { ...template, name: "tie", conditions };

      const disagreements: string[] = [];
      let fired = 0;
      for (let i = 1; i < candles.length; i++) {
        const context = { candles: { [TIMEFRAME]: candles.slice(0, i + 1) } };
        const verdict = ruleSchema.evaluate(rule, context) as Verdict | undefined;
        const fires = verdict?.verdict === "fires";
        if (fires) fired++;
        const oracle = crossedLikeTheCore(
          signOf(CLOSES[i - 1], LEVEL),
          signOf(CLOSES[i], LEVEL),
          direction,
        );
        if (fires !== oracle) {
          disagreements.push(`candle ${i} (${CLOSES[i - 1]} → ${CLOSES[i]}): evaluator ${verdict?.verdict}, oracle ${oracle}`);
        }
      }

      expect(disagreements).toEqual([]);
      expect(fired).toBeGreaterThanOrEqual(MIN_FIRINGS);
    },
  );
});
