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
import { logger } from "../logger";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { ruleEvaluationLoop, type FiringSink } from "./ruleEvaluationLoop";
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
 * Whether the market store has ever produced a closed candle for this symbol
 * and timeframe — proof a subscription is actually live, not just requested.
 *
 * Migrated rules are pinned to `1m` (FEAT-0388), but the app only subscribes
 * to the timeframes the chart or the active indicators actually use — nothing
 * ties an armed rule's trigger timeframe to a guaranteed subscription. Without
 * this check, coverage would take a `1m`-triggered alert off the legacy
 * engine while its symbol is only ever watched on `4h`: covered, armed,
 * core-ready, and permanently silent because its series never arrives. That
 * is a silent gap indistinguishable from BUG-0382 to the trader.
 *
 * `.length > 0` rather than warmup-aware: this answers "is the series alive
 * at all", which the gate's own warmup check already covers once it is. A
 * series that has produced one close will keep producing them; one that has
 * produced none might never start.
 */
export function isSeriesObserved(symbol: string, timeframe: string): boolean {
  return readClosedCandles(symbol, timeframe).length > 0;
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
 */
export function startRuleEvaluationLoop(onFiring: FiringSink = ledgerSink): void {
  if (!browser) return;

  ruleEvaluationLoop.configure({
    readCandles: readClosedCandles,
    readRules: readStoredRules,
    onFiring,
  });
  logger.log(
    "alerts",
    onFiring === ledgerSink
      ? "[Shadow] Rule evaluation loop armed in shadow mode"
      : "[Cutover] Rule evaluation loop armed and notifying",
  );
}
