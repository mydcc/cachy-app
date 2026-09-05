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
 * The wiring itself, not the logic behind it.
 *
 * BUG-0382 was an engine that existed, worked, and was never called. These
 * tests exist so the same cannot happen to the rule loop: they assert the
 * seams — the market store feeds the loop, the loop reads closed candles only,
 * and the rule reader sees what the migration wrote.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { marketState } from "../../stores/market.svelte";
import {
  isSeriesObserved,
  ledgerSink,
  readClosedCandles,
  readStoredRules,
  startRuleEvaluationLoop,
} from "./ruleLoopWiring";
import { readShadowLedger, recordLegacyFiring } from "./shadowLedger";
import { ruleEvaluationLoop } from "./ruleEvaluationLoop";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: false,
}));

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const CANDLES = [
  { open: "100", high: "110", low: "90", close: "105", volume: "1", time: 1_000 },
  { open: "105", high: "115", low: "95", close: "112", volume: "2", time: 61_000 },
  { open: "112", high: "120", low: "100", close: "118", volume: "3", time: 121_000 },
];

describe("rule loop wiring", () => {
  beforeEach(() => {
    marketState.reset();
    ruleEvaluationLoop.reset();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("feeds the loop from the market store's kline write path", () => {
    const observe = vi.spyOn(ruleEvaluationLoop, "observeCandles");

    marketState.applySymbolKlines("BTCUSDT", "1m", CANDLES);

    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe.mock.calls[0][0]).toBe("BTCUSDT");
    expect(observe.mock.calls[0][1]).toBe("1m");
  });

  it("does not let a failing loop cost the store its candles", () => {
    vi.spyOn(ruleEvaluationLoop, "observeCandles").mockImplementation(() => {
      throw new Error("evaluator exploded");
    });

    expect(() => marketState.applySymbolKlines("BTCUSDT", "1m", CANDLES)).not.toThrow();
    // The candles landed and stayed: an observer blowing up must never cost
    // the chart its data.
    expect(marketState.data["BTCUSDT"]?.klines?.["1m"]).toHaveLength(3);
  });

  describe("readClosedCandles", () => {
    it("drops the candle that is still forming", () => {
      marketState.applySymbolKlines("BTCUSDT", "1m", CANDLES);

      const closed = readClosedCandles("BTCUSDT", "1m");

      expect(closed.map((c) => c.open_time_ms)).toEqual([1_000, 61_000]);
    });

    it("converts decimals to strings without losing the value", () => {
      marketState.applySymbolKlines("BTCUSDT", "1m", CANDLES);

      const [first] = readClosedCandles("BTCUSDT", "1m");

      expect(first).toMatchObject({ open: "100", high: "110", low: "90", close: "105" });
    });

    it("yields nothing for a series with a single candle", () => {
      marketState.applySymbolKlines("BTCUSDT", "1m", [CANDLES[0]]);

      expect(readClosedCandles("BTCUSDT", "1m")).toEqual([]);
    });

    it("yields nothing for an unknown symbol or timeframe", () => {
      marketState.applySymbolKlines("BTCUSDT", "1m", CANDLES);

      expect(readClosedCandles("ETHUSDT", "1m")).toEqual([]);
      expect(readClosedCandles("BTCUSDT", "4h")).toEqual([]);
    });
  });

  describe("isSeriesObserved", () => {
    it("is true once the series has produced a closed candle", () => {
      marketState.applySymbolKlines("BTCUSDT", "1m", CANDLES);

      expect(isSeriesObserved("BTCUSDT", "1m")).toBe(true);
    });

    it("is false for a series with only the forming candle", () => {
      marketState.applySymbolKlines("BTCUSDT", "1m", [CANDLES[0]]);

      expect(isSeriesObserved("BTCUSDT", "1m")).toBe(false);
    });

    it("is false for a symbol or timeframe nothing has subscribed to", () => {
      marketState.applySymbolKlines("BTCUSDT", "1m", CANDLES);

      expect(isSeriesObserved("ETHUSDT", "1m")).toBe(false);
      expect(isSeriesObserved("BTCUSDT", "4h")).toBe(false);
    });
  });

  describe("readStoredRules", () => {
    it("reads what the migration wrote", () => {
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([{ id: "r1" }]));

      expect(readStoredRules().map((r) => r.id)).toEqual(["r1"]);
    });

    it("returns nothing when the store is absent or unusable", () => {
      expect(readStoredRules()).toEqual([]);

      localStorage.setItem(RULES_STORAGE_KEY, "not json");
      expect(readStoredRules()).toEqual([]);

      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify({ not: "a list" }));
      expect(readStoredRules()).toEqual([]);
    });
  });

  describe("ledger sinks", () => {
    it("records a shadow verdict against the candle anchor", () => {
      ledgerSink({
        rule: { id: "r1", symbol: "BTCUSDT", trigger_timeframe: "1m" } as never,
        verdict: { verdict: "fires" },
        anchorMs: 60_000,
      });

      const [record] = readShadowLedger().records;

      expect(record).toMatchObject({
        source: "shadow",
        id: "r1",
        symbol: "BTCUSDT",
        timeframe: "1m",
        anchorMs: 60_000,
        verdict: "fires",
      });
    });

    it("records a legacy firing so the two paths can be compared", () => {
      recordLegacyFiring("a1", "BTCUSDT", "42000.5");

      const [record] = readShadowLedger().records;

      expect(record).toMatchObject({
        source: "legacy",
        id: "a1",
        symbol: "BTCUSDT",
        price: "42000.5",
      });
    });
  });

  it("arms the loop in shadow mode, evaluating without notifying", () => {
    const configure = vi.spyOn(ruleEvaluationLoop, "configure");

    startRuleEvaluationLoop();

    expect(configure).toHaveBeenCalledTimes(1);
    // The sink is the ledger sink and nothing else: it records, and the
    // cutover that swaps in a notifying sink is a separate change.
    expect(configure.mock.calls[0][0].onFiring).toBe(ledgerSink);
  });
});
