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
 * FEAT-0816 — a veto that reads a third-party feed, against the real core.
 *
 * The three claims ADR-0029 rests on: a fresh reading actually reaches the
 * evaluator and decides, a feed with no fresh reading drops the veto instead
 * of freezing the rule, and the trader is told once per outage rather than
 * once per candle.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import { ruleSchema } from "../../lib/rules/ruleSchema";
import { MAX_FEED_AGE_MS, type FeedReading } from "../../lib/rules/feedReadings";
import type { Condition, EvaluationCandle, RuleDocument } from "../../lib/rules/types";
import {
  RuleEvaluationLoop,
  type DroppedVeto,
  type RuleFiring,
  type RuleSuppression,
} from "./ruleEvaluationLoop";

vi.mock("$app/env", () => ({ browser: true, dev: false }));
vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

const RULE_ID = "funding-veto-rule";
const SYMBOL = "BTCUSDT";
const TF = "1m";
const MINUTE_MS = 60_000;
const START_MS = 1_757_030_400_000;
const WARM = 5;

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
});

/** "do not take this long while funding is above 1%." */
const fundingVeto: Condition = {
  kind: "external_feed",
  feed: "funding_rate",
  op: "gt",
  value: "0.01",
};

function rule(veto?: Condition): RuleDocument {
  return {
    schema_version: 1,
    id: RULE_ID,
    name: "funding guard",
    symbol: SYMBOL,
    trigger_timeframe: TF,
    conditions: {
      kind: "compare",
      left: { kind: "price", field: "close" },
      op: "gt",
      right: { kind: "constant", value: "0" },
      timeframe: TF,
    },
    ...(veto ? { veto } : {}),
    action: { consequence_level: "notify" },
    provenance: { source: "human", created_at_ms: START_MS },
    frequency: "every_time",
  };
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

function funding(value: string, ageMs = 0): FeedReading {
  return {
    feed: "funding_rate",
    source: "bitunix:futures/market/funding_rate/batch",
    value,
    asOfMs: Date.now() - ageMs,
  };
}

describe("a veto that reads a feed", () => {
  let candles: EvaluationCandle[];
  let current: RuleDocument;
  let readings: FeedReading[];
  let firings: RuleFiring[];
  let suppressions: RuleSuppression[];
  let dropped: DroppedVeto[];
  let loop: RuleEvaluationLoop;

  function close(index: number, price: string) {
    candles = [...candles, candle(index, price)];
    loop.observeCandles(SYMBOL, TF, [{ time: START_MS + (index + 1) * MINUTE_MS }]);
  }

  beforeEach(() => {
    ruleEvaluationGate.forget(RULE_ID);
    candles = [];
    readings = [];
    firings = [];
    suppressions = [];
    dropped = [];
    current = rule();
    loop = new RuleEvaluationLoop({
      readCandles: () => candles,
      readRules: () => [current],
      readFeeds: () => readings,
      onFiring: (firing) => firings.push(firing),
      onSuppressed: (suppression) => suppressions.push(suppression),
      onDroppedVeto: (report) => dropped.push(report),
    });
    loop.observeCandles(SYMBOL, TF, [{ time: START_MS }]);
    for (let i = 0; i < WARM; i++) close(i, "100");
    firings = [];
    dropped = [];
  });

  it("suppresses the trigger when the fresh reading is above the threshold", () => {
    current = rule(fundingVeto);
    readings = [funding("0.02")];

    close(WARM, "200");

    expect(firings).toHaveLength(0);
    expect(suppressions).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("lets the trigger through when the fresh reading is below the threshold", () => {
    current = rule(fundingVeto);
    readings = [funding("0.005")];

    close(WARM, "200");

    // The value reached the core: a veto nobody could read would have dropped
    // and reported instead, and one read as "above" would have suppressed.
    expect(firings).toHaveLength(1);
    expect(suppressions).toHaveLength(0);
    expect(dropped).toHaveLength(0);
  });

  it("records the number, the endpoint and the moment the veto was judged on", () => {
    current = rule(fundingVeto);
    const reading = funding("0.02");
    readings = [reading];

    close(WARM, "200");

    expect(suppressions[0].feeds).toEqual([reading]);
    expect(suppressions[0].rule.veto).toEqual(fundingVeto);
  });

  it("drops the veto and fires when no source supplies the feed", () => {
    current = rule(fundingVeto);
    readings = [];

    close(WARM, "200");

    expect(firings).toHaveLength(1);
    expect(suppressions).toHaveLength(0);
    expect(dropped).toEqual([
      { ruleId: RULE_ID, name: "funding guard", symbol: SYMBOL, feeds: ["funding_rate"] },
    ]);
  });

  it("treats a reading past its age limit as no reading at all", () => {
    current = rule(fundingVeto);
    // Above the threshold: were it believed, this would suppress. It is too
    // old to be the current rate, so it is not believed.
    readings = [funding("0.02", MAX_FEED_AGE_MS.funding_rate + MINUTE_MS)];

    close(WARM, "200");

    expect(firings).toHaveLength(1);
    expect(dropped).toHaveLength(1);
  });

  it("keeps the rule as authored in the firing it hands on", () => {
    current = rule(fundingVeto);
    readings = [];

    close(WARM, "200");

    // The dropped copy lives for one question only: a consumer hashing the
    // document must see the strategy the trader armed, veto included.
    expect(firings[0].rule.veto).toEqual(fundingVeto);
    expect(current.veto).toEqual(fundingVeto);
  });

  it("reports an outage once while it lasts, and again after a recovery", () => {
    current = rule(fundingVeto);

    close(WARM, "200");
    close(WARM + 1, "201");
    expect(dropped).toHaveLength(1);

    // The feed answers again, below the threshold: the rule fires on its own
    // merits and the next outage is news.
    readings = [funding("0.005")];
    close(WARM + 2, "202");
    expect(dropped).toHaveLength(1);

    readings = [];
    close(WARM + 3, "203");
    expect(dropped).toHaveLength(2);
  });

  it("says nothing about a rule whose veto reads no feed", () => {
    current = rule({
      kind: "compare",
      left: { kind: "price", field: "close" },
      op: "gt",
      right: { kind: "constant", value: "500" },
      timeframe: TF,
    });

    close(WARM, "200");

    expect(firings).toHaveLength(1);
    expect(dropped).toHaveLength(0);
    expect(suppressions[0]?.feeds).toBeUndefined();
  });

  it("says nothing about a veto for a rule the core was never asked about", () => {
    // RSI(14) needs fifteen closes and the series holds six, so the gate
    // withholds the verdict. A rule nothing evaluated did not decide without
    // its veto, and telling the trader it did would be a false alarm.
    current = {
      ...rule(fundingVeto),
      conditions: {
        kind: "compare",
        left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
        op: "gt",
        right: { kind: "constant", value: "0" },
        timeframe: TF,
      },
    };
    readings = [];

    close(WARM, "200");

    expect(firings).toHaveLength(0);
    expect(dropped).toHaveLength(0);
  });

  it("ignores a reading for a feed this rule's veto never names", () => {
    current = rule(fundingVeto);
    readings = [
      { feed: "fear_greed", source: "alternative.me:fng", value: "18", asOfMs: Date.now() },
    ];

    close(WARM, "200");

    expect(dropped[0]?.feeds).toEqual(["funding_rate"]);
    expect(firings).toHaveLength(1);
  });
});
