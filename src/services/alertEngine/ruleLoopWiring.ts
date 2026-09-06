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
 * FEAT-0387 — the only place that knows both the rule evaluator and the market
 * store.
 *
 * `ruleEvaluationLoop.ts` stays free of store imports so it can be tested
 * without one, and the market store imports only the loop. This module joins
 * them at startup and is the single spot where a read of `marketState` on
 * behalf of the alert system happens. It reads and never writes — ADR-0009
 * forbids a background consumer writing into `marketState`, and nothing here
 * needs to.
 */

import { browser } from "$app/environment";
import type { EvaluationCandle, RuleDocument } from "../../lib/rules/types";
import { marketState } from "../../stores/market.svelte";
import { safeTfToMs } from "../../utils/timeUtils";
import { logger } from "../logger";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { ruleEvaluationLoop, type FiringSink, type SeriesCloseHook } from "./ruleEvaluationLoop";
import { recordFiring } from "./shadowLedger";

/**
 * The closed candles of one series, oldest first.
 *
 * The last candle in the store is the one currently forming, so it is dropped:
 * evaluating a rule against a candle that has not closed is exactly what
 * close-driven evaluation exists to prevent. A series of one candle therefore
 * yields nothing, which the gate reads as "not warmed up" and withholds.
 */
export function readClosedCandles(symbol: string, timeframe: string): EvaluationCandle[] {
  try {
    const stored = marketState.data[symbol]?.klines?.[timeframe];
    if (!Array.isArray(stored) || stored.length < 2) return [];

    const closed: EvaluationCandle[] = [];
    for (let i = 0; i < stored.length - 1; i++) {
      const candle = stored[i];
      if (candle === null || typeof candle !== "object") continue;

      closed.push({
        open_time_ms: candle.time,
        open: candle.open.toString(),
        high: candle.high.toString(),
        low: candle.low.toString(),
        close: candle.close.toString(),
        volume: candle.volume?.toString(),
      });
    }
    return closed;
  } catch (e) {
    logger.error("alerts", `[Shadow] Reading candles failed for ${symbol} ${timeframe}`, e);
    return [];
  }
}

/**
 * How many trigger periods of silence turn a once-live series stale.
 *
 * Generous on purpose: a live series ticks roughly once a timeframe period,
 * so three missed periods is well past ordinary WS jitter or a brief
 * reconnect — those must not cause an alert to bounce between engines on
 * every hiccup — while still being a small, bounded window compared to a
 * series that has actually stopped for good.
 */
const STALE_SERIES_TIMEFRAME_MULTIPLE = 3;

/**
 * Whether the market store is *currently* producing candles for this symbol
 * and timeframe — not merely whether it once did.
 *
 * Migrated rules are pinned to `1m` (FEAT-0388), but the app only subscribes
 * to the timeframes the chart or the active indicators actually use — nothing
 * ties an armed rule's trigger timeframe to a guaranteed subscription, and a
 * subscription that ends does not clear the candles it already wrote:
 * `marketState` only forgets a series when the whole *symbol* is evicted
 * (`forgetSymbol`), never when one timeframe stops being watched. A rule
 * covered while its chart was on `1m` stays "observed" by a length check
 * alone even after the trader switches to `4h` and the `1m` feed goes silent
 * — armed, taken off the legacy engine, and evaluated by nothing, the mirror
 * image of the gap this same predicate was built to close (round 3: a series
 * that only *starts* being observed mid-session). A silent gap either way is
 * indistinguishable from BUG-0382 to the trader.
 *
 * So this asks recency, not existence: the most recent candle in the buffer
 * (including the one still forming — a live series updates that one on every
 * tick) has to be no older than a few trigger periods. A series that has
 * never produced anything fails the same way a stale one does — `stored`
 * empty and `undefined - anything` both read as "not observed" below.
 */
export function isSeriesObserved(symbol: string, timeframe: string): boolean {
  try {
    const stored = marketState.data[symbol]?.klines?.[timeframe];
    if (!Array.isArray(stored) || stored.length === 0) return false;

    const last = stored[stored.length - 1];
    const lastOpenMs = last?.time;
    if (typeof lastOpenMs !== "number" || !Number.isFinite(lastOpenMs)) return false;

    const maxSilenceMs = safeTfToMs(timeframe) * STALE_SERIES_TIMEFRAME_MULTIPLE;
    return Date.now() - lastOpenMs <= maxSilenceMs;
  } catch (e) {
    logger.error("alerts", `[Cutover] Series-observed check failed for ${symbol} ${timeframe}`, e);
    return false;
  }
}

/**
 * The stored rule set.
 *
 * Read per candle close rather than cached: a close happens once per timeframe
 * period per series, so this is a handful of reads a minute, and a cache would
 * have to be invalidated from every place that can edit a rule — a staleness
 * bug that would quietly evaluate a rule the trader already changed.
 */
export function readStoredRules(): RuleDocument[] {
  if (!browser) return [];

  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (raw === null) return [];

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RuleDocument[]) : [];
  } catch (e) {
    logger.error("alerts", "[Shadow] Reading stored rules failed", e);
    return [];
  }
}

/**
 * The shadow sink: writes the verdict to the ledger and notifies nobody.
 *
 * Recorded against the candle's `anchorMs` as well as the wall clock, because
 * the delay being measured is close-versus-tick and only the anchor says when
 * the candle the verdict belongs to actually ended.
 */
export const ledgerSink: FiringSink = ({ rule, verdict, anchorMs }) => {
  recordFiring({
    source: "shadow",
    recordedAtMs: Date.now(),
    symbol: rule.symbol,
    id: rule.id,
    timeframe: rule.trigger_timeframe,
    anchorMs,
    verdict: verdict.verdict,
  });
};

/**
 * Points the loop at the live market store and at the sink the caller chose.
 *
 * The sink is a parameter rather than a constant because it is the cutover:
 * `ledgerSink` records without notifying, a notifying sink makes the rule
 * engine the thing a trader actually hears. Defaulting to the recording sink
 * keeps the safe behaviour the default — a caller that forgets to pass one
 * gets an evaluator, never a surprise notifier.
 *
 * `onClose` is the caller's chance to keep something else in step with which
 * series just produced a close — `alerts.svelte.ts` uses it to re-sync legacy
 * coverage the moment a rule's series starts being observed mid-session,
 * rather than only at the startup snapshot `initAlertEngine()` took.
 */
export function startRuleEvaluationLoop(onFiring: FiringSink = ledgerSink, onClose?: SeriesCloseHook): void {
  if (!browser) return;

  ruleEvaluationLoop.configure({
    readCandles: readClosedCandles,
    readRules: readStoredRules,
    onFiring,
    onClose,
  });
  logger.log(
    "alerts",
    onFiring === ledgerSink
      ? "[Shadow] Rule evaluation loop armed in shadow mode"
      : "[Cutover] Rule evaluation loop armed and notifying",
  );
}
