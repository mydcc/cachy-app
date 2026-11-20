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
 * FEAT-0814 — a veto that refuses a trigger is a recorded suppression, not a
 * silent non-event, and never reaches the firing sink (so never an order).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { Condition, EvaluationCandle, RuleDocument } from "../../lib/rules/types";
import { RuleEvaluationLoop, type RuleFiring, type RuleSuppression } from "./ruleEvaluationLoop";
import {
  readShadowLedger,
  recordFiring,
  recordSuppression,
  SHADOW_LEDGER_STORAGE_KEY,
  SUPPRESSION_MAX_RECORDS,
} from "./shadowLedger";

vi.mock("$app/env", () => ({ browser: true, dev: false }));
vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

const RULE_ID = "veto-rule";
const TF = "1m";
const MINUTE_MS = 60_000;
const START_MS = 1_757_030_400_000;
/** Closed candles seeded before each case. */
const WARM = 5;

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
});

function closeAbove(value: string): Condition {
  return {
    kind: "compare",
    left: { kind: "price", field: "close" },
    op: "gt",
    right: { kind: "constant", value },
    timeframe: TF,
  };
}

function rule(veto?: Condition): RuleDocument {
  return {
    schema_version: 1,
    id: RULE_ID,
    name: "veto",
    symbol: "BTCUSDT",
    trigger_timeframe: TF,
    conditions: closeAbove("0"),
    ...(veto ? { veto } : {}),
    action: { consequence_level: "notify" },
    provenance: { source: "human", created_at_ms: START_MS },
    frequency: "every_time",
  } as RuleDocument;
}

function candle(index: number, close: string): EvaluationCandle {
  return {
    open_time_ms: START_MS + index * MINUTE_MS,
    open: close,
    high: close,
    low: close,
    close,
    volume: "1",
  };
}

describe("the loop and a veto", () => {
  let candles: EvaluationCandle[];
  let current: RuleDocument;
  let firings: RuleFiring[];
  let suppressions: RuleSuppression[];
  let loop: RuleEvaluationLoop;

  function close(index: number, price: string) {
    candles = [...candles, candle(index, price)];
    loop.observeCandles("BTCUSDT", TF, [{ time: START_MS + (index + 1) * MINUTE_MS }]);
  }

  beforeEach(() => {
    ruleEvaluationGate.forget(RULE_ID);
    candles = [];
    firings = [];
    suppressions = [];
    current = rule();
    loop = new RuleEvaluationLoop({
      readCandles: () => candles,
      readRules: () => [current],
      onFiring: (firing) => firings.push(firing),
      onSuppressed: (suppression) => suppressions.push(suppression),
    });
    // Enough closed history that the gate's warmup floor is behind us; the
    // rule is armed without a veto while it warms, so nothing is recorded.
    loop.observeCandles("BTCUSDT", TF, [{ time: START_MS }]);
    for (let i = 0; i < WARM; i++) close(i, "100");
    firings = [];
  });

  it("suppresses a trigger whose veto holds, and never hands it to the firing sink", () => {
    current = rule(closeAbove("150"));
    close(WARM, "200");
    expect(firings).toHaveLength(0);
    expect(suppressions).toHaveLength(1);
    expect(suppressions[0].rule.id).toBe(RULE_ID);
  });

  it("lets the trigger through when the veto does not hold", () => {
    current = rule(closeAbove("500"));
    close(WARM, "200");
    expect(firings).toHaveLength(1);
    expect(suppressions).toHaveLength(0);
  });

  it("writes nothing new for a rule without a veto", () => {
    close(WARM, "200");
    expect(firings).toHaveLength(1);
    expect(suppressions).toHaveLength(0);
  });

  it("fires again once the veto is removed", () => {
    current = rule(closeAbove("150"));
    close(WARM, "200");
    current = rule();
    close(WARM + 1, "210");
    expect(suppressions).toHaveLength(1);
    expect(firings).toHaveLength(1);
  });
});

describe("the suppression record", () => {
  beforeEach(() => {
    localStorage.removeItem(SHADOW_LEDGER_STORAGE_KEY);
  });

  const at = (anchorMs: number) => ({ id: RULE_ID, symbol: "BTCUSDT", timeframe: TF, anchorMs });

  it("is written once per rule and candle, under its own source", () => {
    expect(recordSuppression(at(START_MS), 1)).toBe(true);
    expect(recordSuppression(at(START_MS), 2)).toBe(false);
    const { records } = readShadowLedger();
    expect(records).toEqual([
      { ...at(START_MS), source: "veto", recordedAtMs: 1, verdict: "suppressed" },
    ]);
  });

  it("survives a reload: it is read back from storage", () => {
    recordSuppression(at(START_MS), 1);
    expect(JSON.parse(localStorage.getItem(SHADOW_LEDGER_STORAGE_KEY) ?? "{}").records).toHaveLength(1);
  });

  it("drops its own oldest first, so announcements keep their share of the cap", () => {
    recordFiring({ source: "rule", recordedAtMs: 0, symbol: "BTCUSDT", id: "other", verdict: "fires" });
    for (let i = 0; i < SUPPRESSION_MAX_RECORDS + 5; i++) recordSuppression(at(START_MS + i * MINUTE_MS), i + 1);
    const { records } = readShadowLedger();
    expect(records.filter((r) => r.source === "veto")).toHaveLength(SUPPRESSION_MAX_RECORDS);
    expect(records.some((r) => r.source === "rule" && r.id === "other")).toBe(true);
    expect(records.find((r) => r.source === "veto")?.anchorMs).toBe(START_MS + 5 * MINUTE_MS);
  });
});
