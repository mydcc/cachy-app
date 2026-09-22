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

import { collectIndicators } from "../../lib/rules/indicatorRequests";
import { computeIndicatorSeries } from "../../lib/rules/indicatorSeries";
import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import { isRuleRefusedError } from "../../lib/rules/ruleSchema";
import type {
  EvaluationCandle,
  EvaluationContext,
  EvaluationIndicatorSeries,
  RuleDocument,
  RuleState,
  Verdict,
} from "../../lib/rules/types";
import { logger } from "../logger";

/** Closed candles for one series, oldest first. Never includes the open one. */
export type CandleReader = (symbol: string, timeframe: string) => EvaluationCandle[];

/** The rules currently armed, as the loop should see them right now. */
export type RuleReader = () => RuleDocument[];

/**
 * What one rule has already done — FEAT-0440.
 *
 * Injected rather than imported for the same reason every other reader here is:
 * fire state is persisted, and the loop must stay callable in a test with no
 * storage. The default answers "never fired", which is what the core reads an
 * absent state as, so an unconfigured loop keeps announcing rather than being
 * silently muted.
 */
export type RuleStateReader = (ruleId: string) => RuleState | undefined;

export interface RuleFiring {
  rule: RuleDocument;
  verdict: Verdict;
  /** Open time of the candle the verdict was computed on — closed, or still forming for `intrabar` rules. */
  anchorMs: number;
}

/** Where a verdict goes. In shadow mode this only logs. */
export type FiringSink = (firing: RuleFiring) => void;

/**
 * Called once per genuine close of any series, before that close is
 * evaluated — regardless of whether any rule ends up firing.
 *
 * Exists so a caller whose *other* decisions depend on which series are
 * observed (FEAT-0387's coverage: an alert is only taken off the legacy
 * engine while its rule's series is live) can keep that decision fresh. A
 * series that was not observed at startup — the app's active chart or
 * indicators did not need it yet — can start producing closes at any later
 * point in the session; coverage computed once at startup would not know.
 * Firing this before `evaluateSeries` runs means a caller that re-syncs
 * coverage here has already dropped the newly-covered alert from the legacy
 * engine by the time the rule engine could notify for the same event.
 */
export type SeriesCloseHook = (symbol: string, timeframe: string, anchorMs: number) => void;

/**
 * A rule that cannot produce a verdict at all, and why.
 *
 * Carries the rule's identity and symbol, never its conditions: a rule is Class A
 * strategy (ADR-0001) and does not belong in a log line or a toast.
 */
export interface UnevaluableRule {
  ruleId: string;
  /**
   * The trader's own name for the rule, for a message they have to act on.
   *
   * Class A means it never leaves the device — not that the trader may not be
   * shown their own alert's name on their own screen. The log below uses the id
   * instead, because a log line is the thing that gets copied into an issue.
   */
  name: string;
  symbol: string;
  /** Developer-facing English. A UI renders its own wording. */
  reason: string;
}

/**
 * Told once per rule, the first time that rule turns out to be inert.
 *
 * Injected rather than imported so the loop keeps its promise of touching no
 * store: whether a trader is interrupted by this is a settings question, and
 * settings live on the other side of `ruleLoopWiring`.
 */
export type UnevaluableSink = (rule: UnevaluableRule) => void;

/**
 * What a rule actually compares against at one anchor — FEAT-0029.
 *
 * Returns the document to evaluate, which is usually the one passed in. A
 * drawing-anchored rule gets a copy whose threshold is the drawing's level at
 * `anchorMs`, so the alert follows the line rather than a number frozen when
 * it was created. Returning `unevaluable` withholds the evaluation and gives
 * the panel a reason — a rule whose drawing is gone must not fall back to its
 * stored constant, which is a level no longer on the chart.
 */
export type ThresholdResolver = (
  rule: RuleDocument,
  anchorMs: number,
) => { rule: RuleDocument } | { unevaluable: string };

export interface RuleEvaluationLoopOptions {
  readCandles: CandleReader;
  readRules: RuleReader;
  /**
   * Closed candles from the **mark-price** series.
   *
   * Optional, and absent by default. A rule that names the mark price without
   * one evaluates to `indeterminate`, which is the honest answer — the core
   * never falls back to the last-price series, because a mark-price alarm
   * answered from last-price candles is a wrong alarm that looks right.
   */
  readMarkCandles?: CandleReader;
  /**
   * The trigger series **including** the candle currently forming — FEAT-0477.
   *
   * The counterpart of `readCandles`, whose contract is that it never includes
   * the open candle. A rule with `evaluation_mode: "intrabar"` is read through
   * this one instead, and only for its own trigger timeframe: the mode says
   * when the *trigger* candle is read, so a coarser timeframe a condition
   * names is still answered from closed candles.
   *
   * Absent by default. A loop configured without it reports every intrabar
   * rule as unevaluable rather than evaluating it against an empty series —
   * a rule that quietly never fires is the failure this engine exists to
   * avoid, not an acceptable fallback.
   */
  readFormingCandles?: CandleReader;
  /**
   * What each rule has already done, for the frequency and validity checks.
   *
   * Absent means every rule reads as never-fired: the pre-FEAT-0393 behaviour,
   * where `frequency` has no effect and a rule announces whenever its
   * conditions hold.
   */
  readRuleState?: RuleStateReader;
  /** Defaults to the shadow sink, which reports and notifies nobody. */
  onFiring?: FiringSink;
  /** No-op by default — most callers have nothing that depends on this. */
  onClose?: SeriesCloseHook;
  /**
   * FEAT-0029: where a rule's threshold comes from.
   *
   * Absent means every rule evaluates against its own stored constant, which
   * is the behaviour every rule that is not anchored to a drawing has anyway.
   */
  resolveThreshold?: ThresholdResolver;
  /** Defaults to `logUnevaluable`. */
  onUnevaluable?: UnevaluableSink;
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
/** Every rule compares against the constant it was stored with. */
const PASS_THROUGH_THRESHOLD: ThresholdResolver = (rule) => ({ rule });

const NO_STATE: RuleStateReader = () => undefined;

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

/**
 * The default report: say it in the log and nowhere else.
 *
 * `error` rather than `warn` — `warn` is what shadow mode uses for the verdicts
 * it exists to collect, and a rule that is silently inert is a different and
 * worse thing than a rule that would have fired.
 */
export const logUnevaluable: UnevaluableSink = ({ ruleId, symbol, reason }) => {
  logger.error(
    "alerts",
    `Rule ${ruleId} on ${symbol} cannot be evaluated and will never fire: ${reason}`,
  );
};

export class RuleEvaluationLoop {
  private readonly highestOpenMs = new Map<string, number>();
  /**
   * Every rule found to be inert, keyed by rule id.
   *
   * A map rather than a set of ids already reported, because this is the durable
   * half of the mechanism: a log line is a hope that somebody reads the console,
   * whereas this can be rendered by the alert panel, asserted in a test, and
   * counted. Reporting once falls out of it.
   */
  private readonly unevaluable = new Map<string, UnevaluableRule>();
  private readCandles: CandleReader = NO_CANDLES;
  private readMarkCandles: CandleReader = NO_CANDLES;
  private readFormingCandles: CandleReader = NO_CANDLES;
  private readRules: RuleReader = NO_RULES;
  private readRuleState: RuleStateReader = NO_STATE;
  private onFiring: FiringSink = shadowSink;
  private onClose: SeriesCloseHook = () => {};
  private onUnevaluable: UnevaluableSink = logUnevaluable;
  private resolveThreshold: ThresholdResolver = PASS_THROUGH_THRESHOLD;

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
    this.readMarkCandles = options.readMarkCandles ?? NO_CANDLES;
    this.readFormingCandles = options.readFormingCandles ?? NO_CANDLES;
    this.readRules = options.readRules;
    this.readRuleState = options.readRuleState ?? NO_STATE;
    this.onFiring = options.onFiring ?? shadowSink;
    this.onClose = options.onClose ?? (() => {});
    this.onUnevaluable = options.onUnevaluable ?? logUnevaluable;
    this.resolveThreshold = options.resolveThreshold ?? PASS_THROUGH_THRESHOLD;
  }

  /**
   * The rules this session found inert, for a panel that wants to show them.
   *
   * A snapshot rather than the live map: a caller iterating this while the loop
   * is evaluating must not see it grow underneath, and nothing outside the loop
   * has any business editing it.
   */
  unevaluableRules(): UnevaluableRule[] {
    return [...this.unevaluable.values()];
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

      // Runs on every call, including the ones that closed nothing — that is
      // the whole of what intrabar means. Deliberately after `advance`, so the
      // anchor is the candle that is forming *now*: on the call that rolls a
      // candle over, the forming one is already the new candle, and the one
      // that just closed is handled below by the close path instead.
      const firings = this.evaluateForming(symbol, timeframe);

      if (anchorMs === undefined) return firings;

      // Before evaluating: a caller re-syncing coverage here has already
      // dropped a newly-covered alert from the legacy engine by the time a
      // rule below could notify for this same close.
      this.onClose(symbol, timeframe, anchorMs);

      firings.push(...this.evaluateSeries(symbol, timeframe, anchorMs));
      return firings;
    } catch (e) {
      logger.error("alerts", `[RuleEngine] Rule evaluation failed for ${symbol} ${timeframe}`, e);
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
   *
   * The anchor is the last *closed* candle this call knows about: the newest
   * open time in the batch is still forming, and everything below it — the
   * previous high-water mark included — has closed. On a batch that jumps
   * several candles at once that is the newest candle of the batch, not the
   * pre-batch mark (BUG-0483): stamping the verdict with a five-candle-old
   * anchor keyed the notification dedupe, the fired history and the bot's
   * entry-price lookup to the wrong candle.
   *
   * Still one anchor per call: candles that opened and closed strictly inside
   * the jump are not reported separately. Their crossings are not recovered
   * here — a `cross` is decided from the adjacent pair, and evaluating "at"
   * an intermediate anchor against post-backfill history would answer from
   * the wrong data, not merely late. Replaying the gap against history
   * truncated to each skipped close is the follow-up this deliberately leaves
   * open (BUG-0483 part 2), not a detail.
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

    // The last closed candle of this call: the newest batch open below the
    // still-forming `highest`, falling back to the pre-batch mark when the
    // batch carries nothing below it (the ordinary single close, whose closed
    // candle is not in the batch at all).
    let anchor = previous;
    for (const candle of candles) {
      const time = candle?.time;
      if (typeof time !== "number" || !Number.isFinite(time)) continue;
      if (time > anchor && time < highest) anchor = time;
    }
    return anchor;
  }

  /**
   * The armed rules anchored on this series, in one evaluation mode.
   *
   * The modes partition the rule set rather than layering: a document is read
   * either at its close or while it forms, never both. Evaluating an intrabar
   * rule again on the close would be a second decision about a candle that
   * rule had already been watching tick by tick, and the trader would hear one
   * event twice.
   *
   * An absent `evaluation_mode` is `close`, which is the serialised form of
   * every document written before FEAT-0477 — the core omits the default, so
   * the field is missing rather than set on all of them.
   */
  private rulesFor(symbol: string, timeframe: string, intrabar: boolean): RuleDocument[] {
    const wanted = intrabar ? "intrabar" : "close";
    return this.readRules().filter(
      (rule) =>
        rule !== null &&
        typeof rule === "object" &&
        rule.enabled !== false &&
        rule.symbol === symbol &&
        rule.trigger_timeframe === timeframe &&
        (rule.evaluation_mode ?? "close") === wanted,
    );
  }

  /**
   * Evaluate this series' intrabar rules against the candle forming right now.
   *
   * The anchor is the series' current high-water open time — which *is* the
   * forming candle's open time, and stays put until it rolls over. A series
   * whose first candle has not been seen yet has nothing to anchor on and
   * nothing to evaluate.
   */
  private evaluateForming(symbol: string, timeframe: string): RuleFiring[] {
    const anchorMs = this.highestOpenMs.get(`${symbol}:${timeframe}`);
    if (anchorMs === undefined) return [];

    const rules = this.rulesFor(symbol, timeframe, true);
    if (rules.length === 0) return [];

    // Without a forming-candle reader these would be evaluated against an
    // empty series, which reads as "not warmed up" and withholds every verdict
    // forever. That is precisely the silently-inert alert this engine exists to
    // make impossible, so it is reported through the channel built for it
    // rather than left to look like a rule that simply never triggered.
    if (this.readFormingCandles === NO_CANDLES) {
      for (const rule of rules) {
        this.reportUnevaluable(rule, "this build has no reader for the forming candle");
      }
      return [];
    }

    return this.evaluateRules(rules, symbol, timeframe, anchorMs, true);
  }

  private evaluateSeries(symbol: string, timeframe: string, anchorMs: number): RuleFiring[] {
    const rules = this.rulesFor(symbol, timeframe, false);
    if (rules.length === 0) return [];
    return this.evaluateRules(rules, symbol, timeframe, anchorMs, false);
  }

  private evaluateRules(
    rules: readonly RuleDocument[],
    symbol: string,
    timeframe: string,
    anchorMs: number,
    intrabar: boolean,
  ): RuleFiring[] {
    const firings: RuleFiring[] = [];
    for (const rule of rules) {
      // One rule's failure is contained to that rule. Without this, a throw
      // escaped to `observeCandles` and every rule ordered after it on the
      // same close went unevaluated — an HMA alert silenced its neighbours on
      // every candle (BUG-0449).
      let firing: RuleFiring | undefined;
      try {
        firing = this.evaluateRule(rule, symbol, timeframe, anchorMs, intrabar);
      } catch (e) {
        // A refusal is the core saying this document is not a rule it accepts,
        // and it will say so on every close: the same document, the same core.
        // That is an alert that can never fire, not a transient failure, so the
        // trader is told once instead of the log hearing it forever (BUG-0468).
        if (isRuleRefusedError(e)) {
          this.reportUnevaluable(rule, `the rule core refuses this rule: ${e.message}`);
        } else {
          logger.error("alerts", `[RuleEngine] Evaluating rule ${rule.id} failed for ${symbol} ${timeframe}`, e);
        }
        continue;
      }
      if (firing === undefined) continue;
      firings.push(firing);

      // The sink is contained per rule too, but reported as itself: a firing
      // consumer that throws is not an evaluation failure, and logging it as
      // one would send whoever reads it looking in the wrong place.
      try {
        this.onFiring(firing);
      } catch (e) {
        logger.error("alerts", `[RuleEngine] Firing sink failed for rule ${rule.id} for ${symbol} ${timeframe}`, e);
      }
    }
    return firings;
  }

  private evaluateRule(
    rule: RuleDocument,
    symbol: string,
    timeframe: string,
    anchorMs: number,
    intrabar: boolean,
  ): RuleFiring | undefined {
    // Read per rule, not once per series: two rules on the same trigger
    // timeframe can still read different timeframes, and the reader is the
    // only thing that knows which series each one needs.
    // FEAT-0029: a drawing-anchored rule's threshold is the drawing's level at
    // this anchor, resolved before anything else — a rule whose drawing is
    // gone must produce no verdict at all rather than one built from the
    // constant it happened to be stored with.
    const resolved = this.resolveThreshold(rule, anchorMs);
    if ("unevaluable" in resolved) {
      this.reportUnevaluable(rule, resolved.unevaluable);
      return undefined;
    }
    rule = resolved.rule;

    const ctx = this.contextFor(rule, symbol, timeframe, intrabar);
    // Undefined means the rule cannot be honestly evaluated at all — not that
    // it did not fire. Skipping is the safe direction; `contextFor` has
    // already said so out loud.
    if (ctx === undefined) return undefined;

    const markCandles = this.markCandlesFor(rule, symbol);
    if (markCandles) {
      ctx.mark_candles = markCandles;
    }

    // Two gate entries, not one call with a flag: the close path dedupes an
    // anchor it has already decided, the intrabar path may look at the same
    // forming candle again and again, and the two keep separate records so one
    // cannot swallow the other's anchor.
    const verdict = intrabar
      ? ruleEvaluationGate.evaluateIntrabar(rule, ctx, anchorMs)
      : ruleEvaluationGate.evaluate(rule, ctx, anchorMs);
    if (verdict === undefined || verdict.verdict !== "fires") return undefined;
    return { rule, verdict, anchorMs };
  }

  /**
   * Collects the closed candles for every timeframe the rule reads.
   *
   * The trigger timeframe is always included; a coarser timeframe named by a
   * condition is read from its own series, so it resolves to the last candle
   * of that timeframe which had closed at the trigger instant rather than a
   * later one.
   *
   * `intrabar` changes only the trigger series, which then ends with the
   * candle still forming. A coarser timeframe stays closed-only in both modes:
   * the mode says when the *trigger* candle is read, and a rule that reads the
   * daily trend while watching a 1m candle form still wants yesterday's
   * finished day, not today's partial one.
   */
  private candlesFor(
    rule: RuleDocument,
    symbol: string,
    triggerTimeframe: string,
    intrabar: boolean,
  ): Record<string, EvaluationCandle[]> {
    const candles: Record<string, EvaluationCandle[]> = {
      [triggerTimeframe]: intrabar
        ? this.readFormingCandles(symbol, triggerTimeframe)
        : this.readCandles(symbol, triggerTimeframe),
    };

    for (const timeframe of collectTimeframes(rule)) {
      if (timeframe === triggerTimeframe) continue;
      candles[timeframe] = this.readCandles(symbol, timeframe);
    }
    return candles;
  }

  /**
   * The full snapshot one rule is evaluated against.
   *
   * Returns `undefined` when the rule reads an indicator this path cannot
   * compute. That case used to be invisible: the core's wire format defaults
   * `indicators` to empty, `MarketView::indicator_at` reads a missing series as
   * "no value", and the verdict comes back `indeterminate` — indistinguishable
   * from an indicator that has simply not warmed up yet. An alert that can never
   * fire looked exactly like one waiting for its fifteenth candle.
   *
   * So the distinction is drawn here, where the reason is still known, rather
   * than left to a caller reading a verdict that cannot carry it.
   */
  private contextFor(
    rule: RuleDocument,
    symbol: string,
    triggerTimeframe: string,
    intrabar: boolean,
  ): EvaluationContext | undefined {
    const candles = this.candlesFor(rule, symbol, triggerTimeframe, intrabar);
    const indicators: EvaluationIndicatorSeries[] = [];

    for (const request of collectIndicators(rule)) {
      const series = computeIndicatorSeries(request, candles[request.timeframe] ?? []);
      if (!series.supported) {
        this.reportUnevaluable(rule, series.reason);
        return undefined;
      }
      indicators.push({
        indicator: request.indicator,
        timeframe: request.timeframe,
        values: series.values,
      });
    }

    // Omitted rather than sent empty: a price-only rule should produce the same
    // wire payload it did before this existed.
    const ctx: EvaluationContext = indicators.length > 0 ? { candles, indicators } : { candles };

    // Same rule, one key at a time: an absent state is how the core spells
    // "never fired", so a reader that knows nothing about this rule must leave
    // the key off entirely rather than send a zeroed one.
    const state = this.stateFor(rule);
    if (state !== undefined) ctx.state = state;

    return ctx;
  }

  /**
   * What the rule has already done, or `undefined` when nothing tracks it.
   *
   * A reader that throws — corrupt storage, a quota error on a read-modify
   * path — must not take the evaluation of every other rule down with it, and
   * must not be allowed to mute this one either: the fallback is `undefined`,
   * which the core reads as never-fired.
   */
  private stateFor(rule: RuleDocument): RuleState | undefined {
    try {
      const state = this.readRuleState(rule.id);
      if (state === undefined) return undefined;
      // BUG-0491: the gate anchors ride in the same stored entry but are
      // TS-side only — the core's `RuleState` knows two fields, so the wire
      // stays exactly that. Rebuilt field by field rather than destructured,
      // so a future anchor cannot leak through a rest pattern unnoticed.
      return {
        fired_count: state.fired_count,
        last_fired_anchor_ms: state.last_fired_anchor_ms,
      };
    } catch (e) {
      logger.error("alerts", `[RuleState] Reading fire state for ${rule.id} failed`, e);
      return undefined;
    }
  }

  /**
   * Record a rule as inert, and tell the sink once.
   *
   * The record is the part that matters and is stored first, so a sink that
   * throws — a toast, a notification channel — cannot take the evaluation of
   * every other rule down with it.
   */
  private reportUnevaluable(rule: RuleDocument, reason: string): void {
    if (this.unevaluable.has(rule.id)) return;

    const record: UnevaluableRule = {
      ruleId: rule.id,
      name: rule.name,
      symbol: rule.symbol,
      reason,
    };
    this.unevaluable.set(rule.id, record);

    try {
      this.onUnevaluable(record);
    } catch (e) {
      logger.error("alerts", "Reporting an unevaluable rule failed", e);
    }
  }

  /**
   * The mark-price series the rule reads, or `undefined` when it reads none.
   *
   * `undefined` rather than an empty object so the common case — every rule
   * that predates FEAT-0390 — sends the core an evaluation context with no
   * `mark_candles` key at all.
   */
  private markCandlesFor(
    rule: RuleDocument,
    symbol: string,
  ): Record<string, EvaluationCandle[]> | undefined {
    const timeframes = collectMarkTimeframes(rule);
    if (timeframes.size === 0) return undefined;

    const candles: Record<string, EvaluationCandle[]> = {};
    for (const timeframe of timeframes) {
      candles[timeframe] = this.readMarkCandles(symbol, timeframe);
    }
    return candles;
  }

  /** Forget one series. */
  forgetSeries(symbol: string, timeframe: string): void {
    this.highestOpenMs.delete(`${symbol}:${timeframe}`);
  }

  /**
   * Forget every series of a symbol, called when the market cache evicts it.
   *
   * Two reasons, one small and one smaller: the map would otherwise keep a
   * row per timeframe for every symbol ever seen, and a stale high-water mark
   * makes the first candle after a re-subscription look like a close that
   * already happened, skipping it.
   */
  forgetSymbol(symbol: string): void {
    const prefix = `${symbol}:`;
    for (const key of this.highestOpenMs.keys()) {
      if (key.startsWith(prefix)) this.highestOpenMs.delete(key);
    }
  }

  /**
   * Stop evaluating, without forgetting which candles have already closed —
   * FEAT-0406.
   *
   * Every injected reader goes back to its unconfigured default, so a
   * disarmed loop reads no rules and therefore produces no verdict and no
   * firing, and `onClose` stops telling a caller about closes it can no
   * longer act on. `observeCandles` reads these fields per call, so a disarm
   * performed inside `onClose` already silences the very close that triggered
   * it — the ordering the cutover needs, since that hook is where the store
   * notices a core that stopped being ready.
   *
   * Series state survives for the same reason `configure` keeps it: the
   * high-water marks are the truth about what has closed, and dropping them
   * would make the next candle of each series look like its first and skip a
   * close — a re-arm must not cost a crossing. Use `reset()` when that state
   * really should go.
   */
  disarm(): void {
    this.readCandles = NO_CANDLES;
    this.readMarkCandles = NO_CANDLES;
    this.readFormingCandles = NO_CANDLES;
    this.readRules = NO_RULES;
    this.readRuleState = NO_STATE;
    this.onFiring = shadowSink;
    this.onClose = () => {};
    this.onUnevaluable = logUnevaluable;
  }

  /**
   * Whether the loop is configured to evaluate anything.
   *
   * Asks the rule reader rather than a separate flag, so the answer cannot
   * drift from the thing that actually decides whether a verdict is possible:
   * `NO_RULES` is the unconfigured sentinel, and it is the one reader
   * `configure` always replaces and `disarm` always restores. A loop
   * configured with a reader that happens to answer `[]` is still armed —
   * "nothing to evaluate right now" is a different state from "will never
   * evaluate anything".
   */
  isArmed(): boolean {
    return this.readRules !== NO_RULES;
  }

  /** Drop all series state. Used by HMR teardown and by tests. */
  reset(): void {
    this.highestOpenMs.clear();
    this.unevaluable.clear();
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

/**
 * Every timeframe a document reads from the **mark-price** series.
 *
 * The local mirror of `RuleDocument::mark_timeframes` in the core, for the same
 * reason `collectTimeframes` above is local: this runs once per rule per candle
 * close on the market hot path, and crossing into wasm there is not worth it.
 * The two must agree, and they fail safe in the same direction — a timeframe
 * missed here reads as no mark candles, which withholds the verdict rather than
 * answering it from the wrong series.
 *
 * Empty for every rule that names no mark price, which is the overwhelming
 * majority: a mark series is a second request per symbol and timeframe, and not
 * every venue serves one at all.
 */
function collectMarkTimeframes(rule: RuleDocument): Set<string> {
  const found = new Set<string>();

  /**
   * Whether this operand — or the operand it wraps — reads the mark series.
   *
   * Recursive because `window` is the one operand shape that nests another and
   * carries no `source` of its own: "the highest mark close of the last 20
   * candles" has the `source` on `window.of`, not on the window. Testing only
   * the top level answered false, so no `mark_candles` reached the core, so the
   * verdict was `indeterminate` — for good, on a rule that looked armed
   * (BUG-0482). The core's own `Condition::mark_timeframes` delegates to its
   * operands for exactly this reason; this is that same delegation.
   */
  const readsMark = (operand: unknown): boolean => {
    if (operand === null || typeof operand !== "object") return false;
    const node = operand as { kind?: unknown; source?: unknown; of?: unknown };
    if (node.source === "mark") return true;
    // Only `window` nests another operand — anything else carrying an `of`
    // key (none today) must not pull in a mark series the core would not
    // request either, so the two mirrors cannot drift apart again.
    if (node.kind !== "window") return false;
    return readsMark(node.of);
  };

  const walk = (condition: unknown): void => {
    if (condition === null || typeof condition !== "object") return;
    const node = condition as {
      timeframe?: unknown;
      of?: unknown;
      left?: unknown;
      right?: unknown;
    };

    if (
      typeof node.timeframe === "string" &&
      (readsMark(node.left) || readsMark(node.right))
    ) {
      found.add(node.timeframe);
    }
    if (Array.isArray(node.of)) node.of.forEach(walk);
  };

  walk(rule.conditions);
  walk(rule.veto);
  return found;
}
