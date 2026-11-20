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
 * FEAT-0815 — the volatility rank and the UTC session window, against the
 * real core: parity with a JavaScript reference, boundary instants, warmup,
 * refusals with their field paths, the hash, and the sentence.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Decimal } from "decimal.js";
import { beforeAll, describe, expect, it } from "vitest";
import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import { CANDLE_SERIES, SERIES_START_MS } from "./__fixtures__/candleSeries";
import { collectIndicators } from "./indicatorRequests";
import { computeIndicatorSeries } from "./indicatorSeries";
import { RuleRefusedError, ruleSchema } from "./ruleSchema";
import { renderRuleSentence, type SentenceTranslator } from "./ruleSentence";
import type { Condition, EvaluationCandle, EvaluationContext, RuleDocument } from "./types";

const TF = "1h";
const HOUR_MS = 3_600_000;
const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
});

function documentOf(conditions: Condition): RuleDocument {
  return {
    schema_version: 1,
    id: "regime",
    name: "regime",
    symbol: "BTCUSDT",
    trigger_timeframe: TF,
    conditions,
    action: { consequence_level: "notify" },
    provenance: { source: "human", created_at_ms: 0 },
  };
}

/** The context the alert path would build: candles plus every requested series. */
function contextFor(document: RuleDocument, candles: readonly EvaluationCandle[]): EvaluationContext {
  const indicators = collectIndicators(document).map((request) => {
    const series = computeIndicatorSeries(request, candles);
    if (!series.supported) throw new Error(series.reason);
    return { indicator: request.indicator, timeframe: request.timeframe, values: series.values };
  });
  return { candles: { [TF]: [...candles] }, indicators };
}

const rank = (op: "gte" | "gt", value: string, period = 14, lookback = 20): Condition => ({
  kind: "compare",
  left: { kind: "atr_percentile", period, lookback },
  op,
  right: { kind: "constant", value },
  timeframe: TF,
});

/** JS reference: share of the last `lookback` ATR values at or below the current, x100. */
function referenceRank(values: (string | null)[], lookback: number): Decimal {
  const window = values.slice(values.length - lookback).map((v) => {
    if (v === null) throw new Error("reference window not warmed up");
    return new Decimal(v);
  });
  const current = window[window.length - 1];
  const atOrBelow = window.filter((v) => v.lte(current)).length;
  return new Decimal(atOrBelow).times(100).div(lookback);
}

describe("atr_percentile", () => {
  it("matches the JavaScript reference rank at several anchors", () => {
    const atr = collectIndicators(documentOf(rank("gte", "0")))[0];
    expect(atr.indicator).toEqual({ id: "atr", params: { period: 14 } });
    for (const length of [60, 120, 250, 400]) {
      const candles = CANDLE_SERIES.slice(0, length);
      const series = computeIndicatorSeries(atr, candles);
      if (!series.supported) throw new Error(series.reason);
      const expected = referenceRank(series.values, 20).toFixed();

      const atLeast = documentOf(rank("gte", expected));
      const above = documentOf(rank("gt", expected));
      expect(ruleSchema.evaluate(atLeast, contextFor(atLeast, candles)), `gte at ${length}`).toEqual({
        verdict: "fires",
      });
      expect(ruleSchema.evaluate(above, contextFor(above, candles)), `gt at ${length}`).toEqual({
        verdict: "does_not_fire",
      });
    }
  });

  it("needs period + lookback candles and says so instead of answering early", () => {
    const document = documentOf(rank("gte", "0"));
    expect(ruleSchema.warmupCandles(document)).toBe(34);
    const short = CANDLE_SERIES.slice(0, 20);
    expect(ruleSchema.evaluate(document, contextFor(document, short)).verdict).toBe("indeterminate");
  });

  it("is refused past the window ceiling, naming the field", () => {
    let refusal: RuleRefusedError | undefined;
    try {
      ruleSchema.validate(documentOf(rank("gte", "50", 14, 501)));
    } catch (e) {
      if (e instanceof RuleRefusedError) refusal = e;
    }
    expect(refusal?.refusals.map((r) => r.field)).toContain("conditions.left.lookback");
  });
});

function session(from: string, to: string): Condition {
  return { kind: "session", from, to, timezone: "UTC" };
}

/** Two flat candles whose second closes at `closeUtc` (HH:MM) on the fixture's day. */
function closingAt(closeUtc: string): EvaluationCandle[] {
  const [h, m] = closeUtc.split(":").map(Number);
  const closeMs = SERIES_START_MS + (h * 60 + m) * 60_000 + 24 * HOUR_MS;
  const candle = (openMs: number): EvaluationCandle => ({
    open_time_ms: openMs,
    open: "100",
    high: "100",
    low: "100",
    close: "100",
    volume: "1",
  });
  return [candle(closeMs - 2 * HOUR_MS), candle(closeMs - HOUR_MS)];
}

function verdictAt(condition: Condition, closeUtc: string): string {
  const document = documentOf({ kind: "group", op: "all", of: [condition] });
  return ruleSchema.evaluate(document, { candles: { [TF]: closingAt(closeUtc) } }).verdict;
}

describe("session", () => {
  it("includes its start and excludes its end", () => {
    expect(new Date(SERIES_START_MS).toISOString()).toMatch(/T00:00:00/);
    expect(verdictAt(session("08:00", "16:00"), "08:00")).toBe("fires");
    expect(verdictAt(session("08:00", "16:00"), "15:00")).toBe("fires");
    expect(verdictAt(session("08:00", "16:00"), "16:00")).toBe("does_not_fire");
    expect(verdictAt(session("08:00", "16:00"), "07:00")).toBe("does_not_fire");
  });

  it("wraps across midnight", () => {
    expect(verdictAt(session("22:00", "02:00"), "23:00")).toBe("fires");
    expect(verdictAt(session("22:00", "02:00"), "00:00")).toBe("fires");
    expect(verdictAt(session("22:00", "02:00"), "02:00")).toBe("does_not_fire");
    expect(verdictAt(session("22:00", "02:00"), "12:00")).toBe("does_not_fire");
  });

  it("refuses an empty window and a malformed time with the field path", () => {
    const fields = (condition: Condition): string[] => {
      try {
        ruleSchema.validate(documentOf({ kind: "group", op: "all", of: [condition] }));
        return [];
      } catch (e) {
        return e instanceof RuleRefusedError ? e.refusals.map((r) => r.field) : [];
      }
    };
    expect(fields(session("08:00", "08:00"))).toContain("conditions.of[0]");
    expect(fields(session("8:00", "16:00"))).toContain("conditions.of[0].from");
    expect(fields(session("08:00", "24:00"))).toContain("conditions.of[0].to");
  });

  it("is usable in a group with an existing condition", () => {
    const withPrice = documentOf({
      kind: "group",
      op: "all",
      of: [
        session("08:00", "16:00"),
        {
          kind: "compare",
          left: { kind: "price", field: "close" },
          op: "gt",
          right: { kind: "constant", value: "50" },
          timeframe: TF,
        },
      ],
    });
    expect(ruleSchema.evaluate(withPrice, { candles: { [TF]: closingAt("09:00") } }).verdict).toBe("fires");
    expect(ruleSchema.warmupCandles(withPrice)).toBe(2);
  });
});

describe("hash and sentence", () => {
  it("changes the content hash when either primitive changes", () => {
    const hash = (c: Condition) => ruleSchema.contentHash(documentOf(c));
    expect(hash(rank("gte", "75", 14, 20))).not.toBe(hash(rank("gte", "75", 14, 21)));
    expect(hash(rank("gte", "75", 14, 20))).not.toBe(hash(rank("gte", "75", 21, 20)));
    expect(hash(session("08:00", "16:00"))).not.toBe(hash(session("09:00", "16:00")));
  });

  it("renders both in German and English without a missing key", () => {
    const translator = (bundle: Record<string, unknown>): SentenceTranslator => (key, values) => {
      const raw = key.split(".").reduce<unknown>((n, p) => (n as Record<string, unknown>)?.[p], bundle);
      if (typeof raw !== "string") throw new Error(`missing locale key: ${key}`);
      return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(values?.[name] ?? ""));
    };
    const document = documentOf({ kind: "group", op: "all", of: [rank("gte", "75"), session("22:00", "02:00")] });
    for (const bundle of [en, de]) {
      const sentence = renderRuleSentence(document, translator(bundle as Record<string, unknown>));
      expect(sentence).toContain("22:00");
      expect(sentence).toContain("ATR(14)");
      expect(sentence).toContain("75");
    }
  });
});
