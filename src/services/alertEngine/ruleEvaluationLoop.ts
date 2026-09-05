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
 * FEAT-0387 — what drives `ruleEvaluationGate` from the live candle stream.
 *
 * ## Shadow mode
 *
 * This loop evaluates and reports, and does not notify. The legacy engine
 * stays armed and keeps firing exactly as before, so a trader sees no change
 * while the two paths can be compared on real data. Switching notification
 * over is a separate, small change — deliberately not bundled with the risk
 * of running a new evaluator for the first time.
 *
 * ## Detecting a close
 *
 * The exchange WS payload carries no "closed" flag; a candle is closed once a
 * candle with a *later* open time exists for the same series. The loop
 * therefore tracks the highest open time seen per `symbol:timeframe` and
 * treats the previous one as the anchor — the same `anchorMs` the gate dedupes
 * on. The very first candle of a series closes nothing: there is no earlier
 * candle to have closed, and guessing one would evaluate a partial candle.
 *
 * ## Store isolation
 *
 * ADR-0009 forbids a background consumer writing into `marketState`. This loop
 * never writes anywhere: it takes what it needs through injected readers, and
 * its only outputs are the verdicts it hands to its sink. It is observed *by*
 * the market store, it does not reach into it.
 */

import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import type { EvaluationCandle, RuleDocument, Verdict } from "../../lib/rules/types";
import { logger } from "../logger";

/** Closed candles for one series, oldest first. Never includes the open one. */
export type CandleReader = (symbol: string, timeframe: string) => EvaluationCandle[];

/** The rules currently armed, as the loop should see them right now. */
export type RuleReader = () => RuleDocument[];

export interface RuleFiring {
  rule: RuleDocument;
  verdict: Verdict;
  /** Open time of the closed candle the verdict was computed on. */
  anchorMs: number;
}

/** Where a verdict goes. In shadow mode this only logs. */
export type FiringSink = (firing: RuleFiring) => void;

export interface RuleEvaluationLoopOptions {
  readCandles: CandleReader;
  readRules: RuleReader;
  /** Defaults to the shadow sink, which reports and notifies nobody. */
  onFiring?: FiringSink;
}

/**
 * An unconfigured loop reads no rules, so it evaluates nothing.
 *
 * The module-level instance below is imported by the market store, which is
 * loaded long before the alert engine starts. Defaulting to "no rules" means
 * candles observed in that window are counted for close detection and produce
 * no verdicts, instead of reaching into a store that is not ready.
 */
const NO_RULES: RuleReader = () => [];
const NO_CANDLES: CandleReader = () => [];

/**
 * The shadow-mode sink: records that a rule *would* have fired, and stops.
 *
 * Logged at `warn` rather than `log` on purpose — during the shadow period
 * these lines are the evidence for whether close-driven evaluation agrees with
 * the legacy per-tick path, and `log` is silenced unless the trader has the
 * `alerts` category enabled.
 */
export const shadowSink: FiringSink = ({ rule, verdict, anchorMs }) => {
  logger.warn(
    "alerts",
    `[Shadow] Rule ${rule.id} on ${rule.symbol} would have fired (${verdict.verdict}) at candle ${new Date(anchorMs).toISOString()}`,
  );
};

export class RuleEvaluationLoop {
  private readonly highestOpenMs = new Map<string, number>();
  private readCandles: CandleReader = NO_CANDLES;
  private readRules: RuleReader = NO_RULES;
  private onFiring: FiringSink = shadowSink;

  constructor(options?: RuleEvaluationLoopOptions) {
    if (options) this.configure(options);
  }

  /**
   * Binds the loop to its data sources. Called once at startup by the wiring
   * that owns the store access, so this module stays free of any import of
   * the market store — the loop is observed by the store, never the reverse.
   *
   * Re-configuring keeps the series state: the candles already seen are still
   * the truth about what has closed, and dropping that would let the next
   * candle look like the first of its series and skip a close.
   */
  configure(options: RuleEvaluationLoopOptions): void {
    this.readCandles = options.readCandles;
    this.readRules = options.readRules;
    this.onFiring = options.onFiring ?? shadowSink;
  }

  /**
   * Feed the loop the candles the market store just applied for one series.
   *
   * Returns the firings this call produced — empty when nothing closed, when
   * no rule is anchored on this series, or when every rule was already
   * evaluated for this candle. Callers on the market hot path ignore the
   * return value; tests read it.
   *
   * Never throws. This is called from the store's write path, and a rule that
   * cannot be evaluated must never cost the chart its candle.
   */
  observeCandles(symbol: string, timeframe: string, candles: readonly { time: number }[]): RuleFiring[] {
    try {
      const anchorMs = this.advance(symbol, timeframe, candles);
      if (anchorMs === undefined) return [];

      return this.evaluateSeries(symbol, timeframe, anchorMs);
    } catch (e) {
      logger.error("alerts", `[Shadow] Rule evaluation failed for ${symbol} ${timeframe}`, e);
      return [];
    }
  }

  /**
   * Records the highest open time seen for a series and reports the anchor if
   * this call closed a candle.
   *
   * Out-of-order and repeated candles are normal on a reconnect or a REST
   * backfill; only a strictly greater open time closes something, so a
   * late-arriving older candle cannot re-fire an anchor the gate already saw.
   */
  private advance(
    symbol: string,
    timeframe: string,
    candles: readonly { time: number }[],
  ): number | undefined {
    if (!Array.isArray(candles) || candles.length === 0) return undefined;

    const key = `${symbol}:${timeframe}`;
    const previous = this.highestOpenMs.get(key);

    let highest = previous;
    for (const candle of candles) {
      const time = candle?.time;
      if (typeof time !== "number" || !Number.isFinite(time)) continue;
      if (highest === undefined || time > highest) highest = time;
    }
    if (highest === undefined) return undefined;

    this.highestOpenMs.set(key, highest);

    // Nothing closed: either this is the first candle of the series (no
    // earlier candle exists to have closed), or the open candle was merely
    // updated in place.
    if (previous === undefined || highest <= previous) return undefined;
    return previous;
  }

  private evaluateSeries(symbol: string, timeframe: string, anchorMs: number): RuleFiring[] {
    const rules = this.readRules().filter(
      (rule) =>
        rule !== null &&
        typeof rule === "object" &&
        rule.enabled !== false &&
        rule.symbol === symbol &&
        rule.trigger_timeframe === timeframe,
    );
    if (rules.length === 0) return [];

    const firings: RuleFiring[] = [];
    for (const rule of rules) {
      // Read per rule, not once per series: two rules on the same trigger
      // timeframe can still read different timeframes, and the reader is the
      // only thing that knows which series each one needs.
      const ctx = { candles: this.candlesFor(rule, symbol, timeframe) };

      const verdict = ruleEvaluationGate.evaluate(rule, ctx, anchorMs);
      if (verdict === undefined) continue;
      if (verdict.verdict !== "fires") continue;

      const firing = { rule, verdict, anchorMs };
      firings.push(firing);
      this.onFiring(firing);
    }
    return firings;
  }

  /**
   * Collects the closed candles for every timeframe the rule reads.
   *
   * The trigger timeframe is always included; a coarser timeframe named by a
   * condition is read from its own series, so it resolves to the last candle
   * of that timeframe which had closed at the trigger instant rather than a
   * later one.
   */
  private candlesFor(
    rule: RuleDocument,
    symbol: string,
    triggerTimeframe: string,
  ): Record<string, EvaluationCandle[]> {
    const candles: Record<string, EvaluationCandle[]> = {
      [triggerTimeframe]: this.readCandles(symbol, triggerTimeframe),
    };

    for (const timeframe of collectTimeframes(rule)) {
      if (timeframe === triggerTimeframe) continue;
      candles[timeframe] = this.readCandles(symbol, timeframe);
    }
    return candles;
  }

  /** Forget a series, e.g. when the symbol is evicted from the market cache. */
  forgetSeries(symbol: string, timeframe: string): void {
    this.highestOpenMs.delete(`${symbol}:${timeframe}`);
  }

  /** Drop all series state. Used by HMR teardown and by tests. */
  reset(): void {
    this.highestOpenMs.clear();
  }
}

/**
 * The instance the market store feeds and the alert startup configures.
 *
 * A singleton because close detection is per-series state that has to survive
 * across every candle of a session; a second instance would see each candle as
 * the first of its series and never close one.
 */
export const ruleEvaluationLoop = new RuleEvaluationLoop();

/**
 * Every timeframe named anywhere in a document's condition tree.
 *
 * Walks the local structure rather than calling `ruleSchema.timeframes()`:
 * that crosses into wasm, and this runs once per rule per candle close on the
 * market hot path. The two must agree — a timeframe missed here reads as no
 * candles at all, which withholds the verdict rather than faking one, so the
 * failure is safe but silent.
 */
function collectTimeframes(rule: RuleDocument): Set<string> {
  const found = new Set<string>();

  const walk = (condition: unknown): void => {
    if (condition === null || typeof condition !== "object") return;
    const node = condition as { timeframe?: unknown; of?: unknown };

    if (typeof node.timeframe === "string") found.add(node.timeframe);
    if (Array.isArray(node.of)) node.of.forEach(walk);
  };

  walk(rule.conditions);
  walk(rule.veto);
  return found;
}
