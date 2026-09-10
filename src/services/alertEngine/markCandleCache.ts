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
 * FEAT-0390 — the mark-price candles the rule engine reads.
 *
 * # Why this is not in the market store
 *
 * `marketState` exists to feed the chart and the indicators: buffer pools,
 * symbol-cache eviction, a WebSocket hot path. Mark-price candles serve exactly
 * one consumer, are needed for a handful of (symbol, timeframe) pairs that armed
 * rules happen to name, and are refreshed once per candle close. Threading them
 * through that store would pay the chart's costs for a consumer the chart does
 * not have — and ADR-0009 forbids a background consumer writing into
 * `marketState` in the first place.
 *
 * So the rule engine keeps its own small cache, on the same terms the evaluator
 * already works on: closed candles only, oldest first, read synchronously.
 *
 * # Why a stale read is not a wrong read
 *
 * `read` never fetches. It answers from what has already arrived, and an empty
 * answer makes the core return `indeterminate` rather than a verdict — which is
 * the correct reading of "I do not have the mark price yet". `ensure` is the
 * asynchronous half, kicked off by the loop when a rule asks for a series; the
 * verdict simply arrives one close later than it could have. Blocking the market
 * hot path on a network round-trip to avoid that would be the worse trade.
 *
 * Class C (ADR-0001): mark-price candles are public market data. Which symbols
 * are fetched is derived from Class A rules and therefore never leaves the
 * device beyond the price request itself, which is the same request the chart
 * already makes for the same symbol.
 */

import type { EvaluationCandle } from "../../lib/rules/types";
import { logger } from "../logger";

/** How many closed candles to hold per series. */
const SERIES_LIMIT = 200;

/**
 * How long a series may go unrefreshed before `ensure` fetches again.
 *
 * Deliberately shorter than the shortest timeframe the panel offers (1m), so a
 * rule anchored there still sees a fresh reference, and long enough that a
 * multi-rule panel does not turn one candle close into a burst of requests.
 */
const REFRESH_AFTER_MS = 30_000;

function keyFor(symbol: string, timeframe: string): string {
  return `${symbol}:${timeframe}`;
}

interface KlineRow {
  timestamp?: number;
  time?: number;
  open?: string | number;
  high?: string | number;
  low?: string | number;
  close?: string | number;
  volume?: string | number;
}

/**
 * The API rows as the evaluator wants them: decimals as strings, oldest first.
 *
 * Every numeric field is stringified rather than parsed. A candle that arrives
 * as a JSON number has already lost whatever precision `number` loses, but
 * re-parsing it into a float on the way to a `Decimal` comparison would be a
 * second, avoidable loss — and the non-negotiable rule in `AGENTS.md` is that no
 * financial value takes a float step it does not have to.
 */
export function toEvaluationCandles(rows: unknown): EvaluationCandle[] {
  if (!Array.isArray(rows)) return [];

  const candles: EvaluationCandle[] = [];
  for (const raw of rows) {
    if (raw === null || typeof raw !== "object") continue;
    const row = raw as KlineRow;
    const openTime = row.timestamp ?? row.time;
    if (typeof openTime !== "number" || !Number.isFinite(openTime)) continue;
    if (row.open === undefined || row.high === undefined) continue;
    if (row.low === undefined || row.close === undefined) continue;

    candles.push({
      open_time_ms: openTime,
      open: String(row.open),
      high: String(row.high),
      low: String(row.low),
      close: String(row.close),
      ...(row.volume === undefined ? {} : { volume: String(row.volume) }),
    });
  }

  candles.sort((a, b) => a.open_time_ms - b.open_time_ms);
  return candles;
}

export type MarkCandleFetcher = (
  symbol: string,
  timeframe: string,
  limit: number,
) => Promise<EvaluationCandle[]>;

/**
 * Fetches the mark series through the same proxy route the chart uses.
 *
 * A venue that cannot serve mark candles answers 501, which is recorded as
 * "unsupported" and never retried — a rule naming the mark price on such a venue
 * then stays indeterminate rather than re-requesting once per candle forever.
 */
export const fetchMarkCandles: MarkCandleFetcher = async (
  symbol,
  timeframe,
  limit,
) => {
  const params = new URLSearchParams({
    symbol,
    interval: timeframe,
    limit: String(limit),
    priceSource: "mark",
  });
  const response = await fetch(`/api/klines?${params.toString()}`);
  if (!response.ok) {
    throw Object.assign(
      new Error(`mark klines request failed with ${response.status}`),
      { status: response.status },
    );
  }
  return toEvaluationCandles(await response.json());
};

export class MarkCandleCache {
  private readonly series = new Map<string, EvaluationCandle[]>();
  private readonly lastFetchMs = new Map<string, number>();
  private readonly inFlight = new Set<string>();
  /** Series the venue told us it cannot serve. Never retried. */
  private readonly unsupported = new Set<string>();

  constructor(
    private fetcher: MarkCandleFetcher = fetchMarkCandles,
    private now: () => number = () => Date.now(),
  ) {}

  /** Swap the fetcher and clock. For tests and for HMR re-wiring. */
  configure(fetcher: MarkCandleFetcher, now?: () => number): void {
    this.fetcher = fetcher;
    if (now) this.now = now;
  }

  /**
   * What has already arrived for this series, oldest first.
   *
   * Synchronous and never fetches: this is called from the market hot path,
   * once per rule per candle close.
   */
  read(symbol: string, timeframe: string): EvaluationCandle[] {
    return this.series.get(keyFor(symbol, timeframe)) ?? [];
  }

  /**
   * Refresh the series if it is stale, without waiting for the result.
   *
   * Returns the in-flight promise so a test can await it; callers on the hot
   * path ignore it. Concurrent calls for the same series collapse into one
   * request — two rules on the same symbol and timeframe are the normal case,
   * not the exception.
   */
  ensure(symbol: string, timeframe: string): Promise<void> | undefined {
    const key = keyFor(symbol, timeframe);
    if (this.unsupported.has(key) || this.inFlight.has(key)) return undefined;

    const last = this.lastFetchMs.get(key);
    if (last !== undefined && this.now() - last < REFRESH_AFTER_MS) {
      return undefined;
    }

    this.inFlight.add(key);
    return this.refresh(key, symbol, timeframe);
  }

  private async refresh(
    key: string,
    symbol: string,
    timeframe: string,
  ): Promise<void> {
    try {
      const candles = await this.fetcher(symbol, timeframe, SERIES_LIMIT);
      this.series.set(key, candles);
      this.lastFetchMs.set(key, this.now());
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      if (status === 501) {
        // The venue does not serve this series at all. Recorded rather than
        // retried: a rule naming the mark price here can never be answered,
        // and re-asking once per candle would be a request storm that changes
        // nothing.
        this.unsupported.add(key);
        logger.warn(
          "alerts",
          `mark-price candles are not available for ${symbol} ${timeframe} on this venue; rules reading the mark price there stay indeterminate`,
        );
      } else {
        // A transient failure. The stale series stays readable and the next
        // close tries again — better than blanking a series the rule could
        // still be answered from.
        logger.error(
          "alerts",
          `failed to refresh mark-price candles for ${symbol} ${timeframe}`,
          error,
        );
        this.lastFetchMs.set(key, this.now());
      }
    } finally {
      this.inFlight.delete(key);
    }
  }

  /** Whether this series was refused by the venue. */
  isUnsupported(symbol: string, timeframe: string): boolean {
    return this.unsupported.has(keyFor(symbol, timeframe));
  }

  /** Drop every series of a symbol, when the market cache evicts it. */
  forgetSymbol(symbol: string): void {
    const prefix = `${symbol}:`;
    for (const map of [this.series, this.lastFetchMs]) {
      for (const key of [...map.keys()]) {
        if (key.startsWith(prefix)) map.delete(key);
      }
    }
    for (const set of [this.inFlight, this.unsupported]) {
      for (const key of [...set]) {
        if (key.startsWith(prefix)) set.delete(key);
      }
    }
  }

  /** Drop everything. Used by HMR teardown and by tests. */
  reset(): void {
    this.series.clear();
    this.lastFetchMs.clear();
    this.inFlight.clear();
    this.unsupported.clear();
  }
}

/**
 * The instance the rule loop reads and the wiring refreshes.
 *
 * A singleton for the same reason the loop is: the cache is per-session state,
 * and a second instance would re-fetch every series it was asked for.
 */
export const markCandleCache = new MarkCandleCache();
