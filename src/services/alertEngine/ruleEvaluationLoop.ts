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

import { Decimal } from "decimal.js";
import {
  feedsNamedBy,
  freshReadings,
  unavailableVetoFeeds,
  withoutVeto,
  type FeedReading,
} from "../../lib/rules/feedReadings";
import { collectIndicators } from "../../lib/rules/indicatorRequests";
import { computeIndicatorSeries } from "../../lib/rules/indicatorSeries";
import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import { isRuleRefusedError, ruleSchema } from "../../lib/rules/ruleSchema";
import type {
  AccountSnapshot,
  DecimalString,
  EvaluationCandle,
  EvaluationContext,
  EvaluationIndicatorSeries,
  ExitAnswer,
  ExitClose,
  RuleDocument,
  RuleState,
  Verdict,
} from "../../lib/rules/types";
import { safeTfToMs } from "../../utils/timeUtils";
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
 * FEAT-0814 — a trigger whose conditions held but whose veto refused it.
 *
 * A separate sink, never `FiringSink` with a different verdict: every firing
 * consumer (the notifier, the bot order wrapper) treats a call as "act now",
 * and a suppressed trigger must reach none of them. Close path only -- an
 * intrabar rule re-reads the same forming candle many times, and one veto
 * would otherwise be logged once per tick.
 */
export interface RuleSuppression {
  rule: RuleDocument;
  /** Open time of the closed candle the trigger held on. */
  anchorMs: number;
  /**
   * FEAT-0816 — the feed readings the veto was judged against, present only
   * when the veto reads a feed. The condition already carries the feed and the
   * threshold; this carries the number it was compared with and when that
   * number was current, which is what makes a suppression readable a year
   * later (ADR-0029 decision 6).
   */
  feeds?: FeedReading[];
}

export type SuppressionSink = (suppression: RuleSuppression) => void;

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
 * A candle period that never arrived for a series an armed rule watches.
 *
 * The honest replacement for the flush-cadence toast the market store used to
 * raise. That one measured the gap between two *batches*, which a background
 * tab widens without any candle going missing, and its wording ("alerts may
 * have missed intermediate prices") described an engine that no longer exists.
 * This record is derived from candle open times: a period is listed missing
 * only when neither the live stream nor a backfill delivered it, so nothing was
 * replayed for it either.
 *
 * `missingCandles` counts periods between the last candle the loop evaluated
 * and the newest one it has just seen. `lastOpenMs` is exact — it is the open
 * time of a candle that was really observed.
 */
export interface SeriesGap {
  readonly symbol: string;
  readonly timeframe: string;
  /** Open time of the last candle seen before the jump. */
  readonly lastOpenMs: number;
  /** Open time of the newest candle that revealed the gap. */
  readonly detectedAtMs: number;
  /**
   * The periods the jump skipped that this batch did not deliver.
   *
   * Not `periods - 1`: a batch that carries intermediate candles replays each
   * of them, so those were evaluated and are not missing.
   */
  readonly missingCandles: number;
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
 * FEAT-0816 — every third-party feed reading currently held for one market.
 *
 * Injected like every other reader here: fetching a funding rate is a network
 * concern on the other side of `ruleLoopWiring`, and the loop must stay
 * callable in a test with no network. Freshness is not the reader's job — it
 * hands over what it has, and the loop refuses what is too old to use.
 *
 * Absent by default, which means every feed is unavailable. That is the honest
 * default rather than an inconvenient one: a loop nobody wired to a provider
 * has no business answering "funding is low" with silence.
 */
export type FeedReader = (symbol: string) => readonly FeedReading[];

/**
 * FEAT-0816 — a veto the engine had to drop because the feed it reads had no
 * fresh value.
 *
 * Its own record, not a `UnevaluableRule`: that one says "this rule cannot
 * produce a verdict", and this rule did produce one — without the protection
 * its author wrote. Carries the rule's identity and the feed ids, never the
 * veto condition itself, which is Class A strategy (ADR-0001).
 */
export interface DroppedVeto {
  ruleId: string;
  /** The trader's own name for the rule, for a message they have to act on. */
  name: string;
  symbol: string;
  /** The feeds the veto reads that nothing could answer. */
  feeds: string[];
}

/**
 * Told once per rule while the same feeds stay unavailable — ADR-0029
 * decision 5. An outage lasting an hour is one report, not one per candle.
 */
export type DroppedVetoSink = (dropped: DroppedVeto) => void;

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

/**
 * One owned position the exit window evaluates against — FEAT-0810.
 *
 * The wiring composes this from the simulated book and the exit-action
 * ledger: `entryPrice` and `side` are the trade the bot actually made, and
 * `lastExitActionAnchorMs` is the durable half of the exit idempotency — a
 * reload mid-exit re-reads it and must not close twice on one anchor.
 */
export interface OwnedBotPosition {
  /** The market the row lives on — a rule only owns rows on its own symbol. */
  symbol: string;
  positionId: string;
  side: "long" | "short";
  /** The book row's own entry price, as stored (a decimal string). */
  entryPrice: string;
  /** The book row's remaining amount, as stored (a decimal string). */
  amount: string;
  lastExitActionAnchorMs: number | null;
}

/** Which owned positions a rule may exit — the wiring reads the book. */
export type OwnedPositionsReader = (ruleId: string) => OwnedBotPosition[];

/**
 * The account snapshot scoped to one owned position — ADR-0026 decisions 2
 * and 5: inside exits, account conditions speak about the position the bot
 * owns, not the account aggregate.
 */
export type PositionAccountReader = (
  ruleId: string,
  positionId: string,
) => AccountSnapshot | undefined;

/** Records that a rule's exit acted on a position at an anchor — durable. */
export type ExitActionRecorder = (
  ruleId: string,
  positionId: string,
  anchorMs: number,
) => void;

/**
 * One exit the engine wants honoured — FEAT-0810. The sink chain decides what
 * acting on it means; this is the engine's half of the contract.
 */
export interface BotExitFiring {
  rule: RuleDocument;
  /**
   * The market the owned position lives on — the row's symbol, not the
   * rule's current one. A rule edited to another symbol no longer owns the
   * row (the window skips it), but this field is what the close names, so
   * the lane can never act on the rule's new market.
   */
  symbol: string;
  positionId: string;
  /** How much the document says to close — `all`, or `partial`. */
  close: ExitClose;
  /** Present exactly when `close` is `partial`. */
  fraction?: string;
  /** The exit's index in `exits`, or `null` for the take-profit target. */
  exitIndex: number | null;
  anchorMs: number;
}

/** The sink an armed engine hands exit firings to. */
export type ExitFiringSink = (firing: BotExitFiring) => void;

/**
 * FEAT-0810 — the exit ports a live wiring provides. Shadow mode provides
 * none: without them the exit window evaluates nothing and fires nothing,
 * which is exactly the measurement shape shadow mode exists for.
 */
export interface ExitLoopPorts {
  ownedPositions: OwnedPositionsReader;
  accountForPosition: PositionAccountReader;
  recordExitAction: ExitActionRecorder;
  onExitFiring: ExitFiringSink;
}

/**
 * FEAT-0823 — the confirmation ports a live wiring provides. Shadow mode
 * provides none: without them waits are still held and consumed (the memo
 * is the dedupe, not a report), but nobody is told — the same honesty the
 * exit ports above carry.
 */
export interface ConfirmationLoopPorts {
  onAwaiting?: AwaitingSink;
  onSignalDiscarded?: SignalDiscardSink;
}

/**
 * FEAT-0823 — one entry signal held for its confirmation close.
 *
 * Held by the loop, not the document and not storage: a reload re-derives it
 * from the candles (the catch-up below), the same way the projection's
 * awaiting state re-derives from the loop's report.
 */
export interface AwaitingEntrySignal {
  ruleId: string;
  /**
   * The anchor whose close produced the signal. The candle being confirmed
   * is the next one — everything about the wait is answerable from these two
   * anchors, which is why nothing needs persisting.
   */
  signalAnchorMs: number;
}

/**
 * FEAT-0823 — the fresh awaiting slice for one series, reported once per
 * closed candle. Always the complete truth for that series: an empty array
 * means no rule of this series is waiting, and the caller replaces whatever
 * it held rather than merging.
 */
export type AwaitingSink = (
  symbol: string,
  timeframe: string,
  awaiting: AwaitingEntrySignal[],
) => void;

/** FEAT-0823 — why a held signal did not become an entry. */
export type SignalDiscardReason =
  /** The confirmation candle closed against the intent (a doji counts). */
  | "confirmation-against-direction"
  /** The position the signal was sizing was gone before confirmation. */
  | "signal-stopped-out";

/**
 * FEAT-0823 — one discarded signal, recorded once at the confirmation close
 * that discarded it. The wiring lands it in the guard ledger, so "why did my
 * bot not enter?" has the same answer path as every other refusal.
 */
export type SignalDiscardSink = (
  ruleId: string,
  anchorMs: number,
  reason: SignalDiscardReason,
) => void;

/**
 * FEAT-0823 — the words vs the entry: `confirmSignal` answers one of three,
 * and only the entry is an object. A helper rather than an inline check so
 * the two call sites cannot drift on what "confirmed" means.
 */
function isConfirmationEntry(
  answer: RuleFiring | "against" | "no-signal",
): answer is RuleFiring {
  return typeof answer === "object";
}

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
  /** FEAT-0814 — where a vetoed trigger goes. Absent: nothing is recorded. */
  onSuppressed?: SuppressionSink;
  /** No-op by default — most callers have nothing that depends on this. */
  onClose?: SeriesCloseHook;
  /** Runs once per closed anchor oldest-first inside reconnect/backfill loops. */
  onEachClose?: SeriesCloseHook;
  /**
   * FEAT-0029: where a rule's threshold comes from.
   *
   * Absent means every rule evaluates against its own stored constant, which
   * is the behaviour every rule that is not anchored to a drawing has anyway.
   */
  resolveThreshold?: ThresholdResolver;
  /** Defaults to `logUnevaluable`. */
  onUnevaluable?: UnevaluableSink;
  /**
   * FEAT-0816 — the third-party feed readings each market currently has.
   *
   * Absent means every feed is unavailable, which under ADR-0029 decision 3
   * drops a feed-reading veto and reports it. A rule whose veto names no feed
   * is unaffected either way.
   */
  readFeeds?: FeedReader;
  /** FEAT-0816 — defaults to `logDroppedVeto`: said in the log and nowhere else. */
  onDroppedVeto?: DroppedVetoSink;
  /**
   * FEAT-0810 — which owned positions each rule may exit.
   *
   * Absent by default: without it no exit is evaluated, which keeps a
   * loop configured by a caller that owns no book exactly as quiet as it was.
   */
  ownedPositions?: OwnedPositionsReader;
  /**
   * FEAT-0810 — the account snapshot scoped to one owned position. Absent
   * means account conditions inside exits read as unknown (not false), the
   * same honesty a trigger gets when nothing supplies a snapshot.
   */
  accountForPosition?: PositionAccountReader;
  /**
   * FEAT-0810 — the durable half of exit idempotency. Absent means exit
   * actions are recorded nowhere, so a reload mid-exit could act twice; the
   * wiring always provides it.
   */
  recordExitAction?: ExitActionRecorder;
  /** FEAT-0810 — absent means exit firings are dropped (the shadow shape). */
  onExitFiring?: ExitFiringSink;
  /**
   * FEAT-0823 — the per-series awaiting report. Absent means awaiting
   * signals are still held and still consumed, but nobody is told — the
   * shadow shape, same as the exit port above.
   */
  onAwaiting?: AwaitingSink;
  /**
   * FEAT-0823 — one record per discarded signal. Absent means discards are
   * silent to the caller; the loop's own bookkeeping is unaffected.
   */
  onSignalDiscarded?: SignalDiscardSink;
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
/** No provider wired: every feed is unavailable, and a feed veto is dropped. */
const NO_FEEDS: FeedReader = () => [];
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

/**
 * The default report for a dropped veto: say it in the log and nowhere else.
 *
 * `error`, like `logUnevaluable` and for the same reason — a rule that just
 * traded without the veto its author wrote is not a routine event. The feed
 * ids are developer-facing; a UI renders its own wording.
 */
export const logDroppedVeto: DroppedVetoSink = ({ ruleId, symbol, feeds }) => {
  logger.error(
    "alerts",
    `[RuleEngine] Veto dropped for rule ${ruleId} on ${symbol}: no fresh reading for ${feeds.join(", ")}`,
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
  /**
   * Rules the sink has already heard about, kept across episodes.
   *
   * BUG-0485 — the interruption budget is one per rule per session: a rule
   * that goes inert, gets fixed and goes inert again must reappear in the
   * panel's list without a second toast. This set is what remembers the
   * interruption while the map above is free to be forgotten and re-built.
   * Cleared only by `reset()`, alongside the map.
   */
  private readonly unevaluableNotified = new Set<string>();
  /**
   * Panel-side readers of the record above, called with a snapshot whenever
   * the record changes.
   *
   * The loop stays free of any store import (ADR-0009, and the cycle
   * `armRule.ts` documents): the store subscribes, the loop notifies. A
   * subscriber iterating the snapshot while the loop evaluates must not see
   * it grow underneath, which is why listeners receive a copy, never the map.
   */
  private readonly unevaluableListeners = new Set<(rules: UnevaluableRule[]) => void>();
  /**
   * Candle gaps this session found, keyed by `symbol:timeframe`.
   *
   * One record per series: a second gap on the same series tells the trader
   * nothing new, and the panel stays a short list instead of a log. Cleared by
   * `reset()` and when the market cache forgets the symbol, so a series that
   * is dropped and re-subscribed can report a genuinely new gap.
   */
  private readonly seriesGapRecords = new Map<string, SeriesGap>();
  /** Panel-side readers of the record above, same contract as the inert list. */
  private readonly seriesGapListeners = new Set<(gaps: SeriesGap[]) => void>();
  private readCandles: CandleReader = NO_CANDLES;
  private readMarkCandles: CandleReader = NO_CANDLES;
  private readFormingCandles: CandleReader = NO_CANDLES;
  private readRules: RuleReader = NO_RULES;
  private readRuleState: RuleStateReader = NO_STATE;
  private onFiring: FiringSink = shadowSink;
  private onSuppressed: SuppressionSink = () => {};
  private onClose: SeriesCloseHook = () => {};
  private onEachClose: SeriesCloseHook = () => {};
  private onUnevaluable: UnevaluableSink = logUnevaluable;
  private readFeeds: FeedReader = NO_FEEDS;
  private onDroppedVeto: DroppedVetoSink = logDroppedVeto;
  /**
   * Which feeds each rule's veto is currently missing, keyed by rule id and
   * joined into one string.
   *
   * The interruption budget for an outage: as long as the same feeds stay
   * unavailable the report has already been made, and a *different* feed going
   * down is a different fact that is reported again. Cleared for a rule the
   * moment its feeds answer, so a recovery followed by a second outage is news
   * twice -- which is the point of a signal that can be acted on.
   */
  private readonly droppedVetoes = new Map<string, string>();
  private resolveThreshold: ThresholdResolver = PASS_THROUGH_THRESHOLD;
  private ownedPositions: OwnedPositionsReader = () => [];
  private accountForPosition: PositionAccountReader = () => undefined;
  private recordExitAction: ExitActionRecorder | undefined = undefined;
  private onExitFiring: ExitFiringSink | undefined = undefined;
  private onAwaiting: AwaitingSink | undefined = undefined;
  private onSignalDiscarded: SignalDiscardSink | undefined = undefined;
  /**
   * FEAT-0823 — the held entry signals, keyed by rule id. One signal per
   * rule at a time (a second signal while one waits would be a third
   * entry the day cap is there to refuse), keyed by rule because a rule
   * belongs to exactly one series. The `seriesKey` on the memo is the
   * purge key: a rule that leaves its series' armed set (disabled,
   * deleted) must not carry a stale wait back in when it returns.
   */
  private readonly confirmationMemos = new Map<
    string,
    { seriesKey: string; signalAnchorMs: number; ownedAtSignal: boolean }
  >();
  /**
   * FEAT-0823 review — the newest anchor this loop instance already decided
   * for a confirmation rule, whatever the decision was. The memo is the
   * *wait* state; this is the *decision* state, and it is what makes a
   * replayed close a no-op: the market cache evicts series on LRU and the
   * refill replays every already-decided close, and without this floor the
   * confirmation path re-entered them (the immediate path never had the
   * problem — the evaluation gate's monotonic floor holds it).
   */
  private readonly confirmationDecidedMs = new Map<string, number>();

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
    this.onSuppressed = options.onSuppressed ?? (() => {});
    this.onClose = options.onClose ?? (() => {});
    this.onEachClose = options.onEachClose ?? (() => {});
    this.onUnevaluable = options.onUnevaluable ?? logUnevaluable;
    this.readFeeds = options.readFeeds ?? NO_FEEDS;
    this.onDroppedVeto = options.onDroppedVeto ?? logDroppedVeto;
    this.resolveThreshold = options.resolveThreshold ?? PASS_THROUGH_THRESHOLD;
    this.ownedPositions = options.ownedPositions ?? (() => []);
    this.accountForPosition = options.accountForPosition ?? (() => undefined);
    this.recordExitAction = options.recordExitAction;
    this.onExitFiring = options.onExitFiring;
    this.onAwaiting = options.onAwaiting;
    this.onSignalDiscarded = options.onSignalDiscarded;
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
   * Follow the record above. The listener fires with a snapshot on every
   * change — a report, a refresh, a forgetting, a rule evaluating again.
   *
   * Returns the unsubscribe. Listener failures are contained to that listener
   * and logged, so one broken reader cannot cost the others their update.
   */
  subscribeUnevaluable(listener: (rules: UnevaluableRule[]) => void): () => void {
    this.unevaluableListeners.add(listener);
    return () => {
      this.unevaluableListeners.delete(listener);
    };
  }

  private emitUnevaluable(): void {
    const snapshot = this.unevaluableRules();
    for (const listener of this.unevaluableListeners) {
      try {
        listener(snapshot);
      } catch (e) {
        logger.error("alerts", "An unevaluable-rules listener failed", e);
      }
    }
  }

  /**
   * The gaps found so far, one record per series.
   *
   * A new array per call, like `unevaluableRules()`, and its records are
   * readonly: the panel iterates this while the market hot path may still be
   * recording, so handing out the loop's own objects is safe.
   */
  seriesGaps(): SeriesGap[] {
    return [...this.seriesGapRecords.values()];
  }

  /**
   * Follow the record above. Fires with a snapshot when a gap is first found
   * for a series; a second gap on the same series does not fire again.
   *
   * Returns the unsubscribe. Listener failures are contained to that listener,
   * so one broken reader cannot cost the others their update.
   */
  subscribeSeriesGaps(listener: (gaps: SeriesGap[]) => void): () => void {
    this.seriesGapListeners.add(listener);
    return () => {
      this.seriesGapListeners.delete(listener);
    };
  }

  private emitSeriesGaps(): void {
    const snapshot = this.seriesGaps();
    for (const listener of this.seriesGapListeners) {
      try {
        listener(snapshot);
      } catch (e) {
        logger.error(
          "alerts",
          "A series-gap listener failed — the gap list will not update for it",
          e,
        );
      }
    }
  }

  /**
   * Record a gap if — and only if — one really happened.
   *
   * `periods` is how many closes the jump covers, including the last candle the
   * loop had seen. `closes` is what this batch actually delivered or replayed;
   * when the two agree, nothing is missing and this is a no-op. `Math.round`
   * absorbs the small drift some venues show in open times without letting it
   * look like a missing period.
   *
   * A hole in a series no armed rule watches is not an alert problem, so it is
   * not listed: the panel is about alarms, not about every chart the trader
   * happens to have open.
   *
   * An unparseable timeframe skips the check instead of guessing: `safeTfToMs`
   * defaults to one minute, which would turn a `1y` jump into 525 600 reported
   * missing candles. The second argument makes the guard below real.
   */
  private reportSeriesGap(
    symbol: string,
    timeframe: string,
    previous: number,
    highest: number,
    closes: readonly number[],
  ): void {
    const intervalMs = safeTfToMs(timeframe, Number.NaN);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

    const periods = Math.round((highest - previous) / intervalMs);
    if (periods <= closes.length) return;

    const watched =
      this.rulesFor(symbol, timeframe, false).length > 0 ||
      this.rulesFor(symbol, timeframe, true).length > 0;
    if (!watched) return;

    const key = `${symbol}:${timeframe}`;
    if (this.seriesGapRecords.has(key)) return;

    this.seriesGapRecords.set(key, {
      symbol,
      timeframe,
      lastOpenMs: previous,
      detectedAtMs: highest,
      missingCandles: periods - closes.length,
    });
    this.emitSeriesGaps();
  }

  /**
   * Drop one rule's inert record, e.g. because the rule was edited, re-armed,
   * removed or disarmed — every one of those invalidates "this rule can never
   * fire", and a deleted rule must not stay listed.
   *
   * The interruption budget (`unevaluableNotified`) is deliberately untouched:
   * forgetting the record must not buy the rule a second toast in the same
   * session. If the rule goes inert again it reappears in the list silently.
   */
  forgetUnevaluableRule(ruleId: string): void {
    if (!this.unevaluable.delete(ruleId)) return;
    this.emitUnevaluable();
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
      const closes = this.advance(symbol, timeframe, candles);

      // Runs on every call, including the ones that closed nothing — that is
      // the whole of what intrabar means. Deliberately after `advance`, so the
      // anchor is the candle that is forming *now*: on the call that rolls a
      // candle over, the forming one is already the new candle, and the one
      // that just closed is handled below by the close path instead.
      const firings = this.evaluateForming(symbol, timeframe);

      if (closes.length === 0) return firings;

      // Before evaluating: a caller re-syncing coverage here has already
      // dropped a newly-covered alert from the legacy engine by the time a
      // rule below could notify for this same close.
      const last = closes[closes.length - 1];
      this.onClose(symbol, timeframe, last);

      // One decision per close, oldest first. A batch that jumps several
      // candles replays each skipped close against history truncated to it
      // (BUG-0483 part 2), so a crossing strictly inside the gap is decided
      // where it happened rather than missed in silence.
      for (const anchorMs of closes) {
        firings.push(...this.evaluateSeries(symbol, timeframe, anchorMs));
        // FEAT-0810 — the same close is the bot's exit window: the trigger
        // asks whether to enter, this asks whether to leave. Same anchor, so
        // the two answers can never disagree about which candle they read.
        this.evaluateExitWindow(symbol, timeframe, anchorMs);
        this.onEachClose(symbol, timeframe, anchorMs);
      }
      return firings;
    } catch (e) {
      logger.error("alerts", `[RuleEngine] Rule evaluation failed for ${symbol} ${timeframe}`, e);
      return [];
    }
  }

  /**
   * Records the highest open time seen for a series and reports every candle
   * this call closed, oldest first.
   *
   * Out-of-order and repeated candles are normal on a reconnect or a REST
   * backfill; only strictly greater open times close something, so a
   * late-arriving older candle cannot re-fire an anchor the gate already saw.
   *
   * The usual call closes exactly one candle — the pre-batch mark, whose
   * closed candle is not in the batch at all. A batch that jumps several
   * candles at once additionally reports every batch open below the
   * still-forming newest, so the caller can replay each skipped close
   * (BUG-0483 part 2) instead of stamping one verdict with a five-candle-old
   * anchor (part 1). What is returned is always ascending and duplicate-free,
   * which is what the gate's monotonic guard needs to walk it.
   */
  private advance(
    symbol: string,
    timeframe: string,
    candles: readonly { time: number }[],
  ): number[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const key = `${symbol}:${timeframe}`;
    const previous = this.highestOpenMs.get(key);

    let highest = previous;
    for (const candle of candles) {
      const time = candle?.time;
      if (typeof time !== "number" || !Number.isFinite(time)) continue;
      if (highest === undefined || time > highest) highest = time;
    }
    if (highest === undefined) return [];

    this.highestOpenMs.set(key, highest);

    // Nothing closed: either this is the first candle of the series (no
    // earlier candle exists to have closed), or the open candle was merely
    // updated in place.
    if (previous === undefined || highest <= previous) return [];

    // The closes of this call: the pre-batch mark first, then every batch
    // open below the still-forming `highest`. Late or repeated candles at or
    // below the mark close nothing and are left out.
    const closes = [previous];
    for (const candle of candles) {
      const time = candle?.time;
      if (typeof time !== "number" || !Number.isFinite(time)) continue;
      if (time > previous && time < highest) closes.push(time);
    }
    closes.sort((a, b) => a - b);
    const uniqueCloses = [...new Set(closes)];

    // A jump this batch did not fill: periods between the last candle the loop
    // had seen and the newest one it has just seen, which neither the live
    // stream nor a backfill delivered.
    //
    // Contained on purpose: `readRules` is injected, and `highestOpenMs` was
    // already advanced above. A throw here would abandon the closes below,
    // which could then never be replayed — the exact batch a reconnect creates.
    // A missing banner is worth less than a missing alert.
    try {
      this.reportSeriesGap(symbol, timeframe, previous, highest, uniqueCloses);
    } catch (e) {
      logger.error(
        "alerts",
        `[RuleEngine] Gap detection failed for ${symbol} ${timeframe} — a missed candle will not be listed`,
        e,
      );
    }

    return uniqueCloses;
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
    if (rules.length === 0) {
      // FEAT-0823 — the awaiting slice runs even when the pass is empty: a
      // series whose every confirmation rule just went disabled must still
      // report the cleared wait, and the memos of rules that left the armed
      // set must still be purged — an empty pass is the purge case, not an
      // excuse to skip it.
      this.reportAwaiting(rules, symbol, timeframe);
      return [];
    }
    const firings = this.evaluateRules(rules, symbol, timeframe, anchorMs, false, anchorMs);
    // FEAT-0823 — reported after the pass, so the slice says what this
    // close left behind: signals consumed by an entry are gone from it,
    // signals formed by this close are in it, and a consumer rendering
    // "awaiting" reads the wait as of now, not as of the previous candle.
    this.reportAwaiting(rules, symbol, timeframe);
    return firings;
  }

  /**
   * FEAT-0823 — the fresh awaiting slice for one series, reported once per
   * closed-candle pass. The purge runs first: a rule that left this
   * series' armed set (disabled, deleted, moved to another market) must
   * not answer for an await nothing can consume any more, and the slice
   * clears with it. Reported only when this series has a confirmation
   * rule or already holds a memo — a series of immediate rules has no
   * awaiting vocabulary and stays off the port entirely.
   */
  private reportAwaiting(
    rules: readonly RuleDocument[],
    symbol: string,
    timeframe: string,
  ): void {
    const seriesKey = `${symbol}|${timeframe}`;
    const hasConfirmationRules = rules.some(
      (rule) => rule.entry_trigger === "confirmation",
    );
    let seriesHasMemo = false;
    for (const memo of this.confirmationMemos.values()) {
      if (memo.seriesKey === seriesKey) {
        seriesHasMemo = true;
        break;
      }
    }
    if (!hasConfirmationRules && !seriesHasMemo) return;

    for (const [id, memo] of this.confirmationMemos) {
      if (memo.seriesKey !== seriesKey) continue;
      // FEAT-0823 review — presence alone is not enough: a rule still armed
      // but edited away from `confirmation` never reaches the branch that
      // consumes memos again, so its wait would outlive the mode that
      // earned it — reported forever while the bot fires immediately. The
      // memo belongs to the mode, not the id.
      const stillConfirming = rules.some(
        (rule) => rule.id === id && rule.entry_trigger === "confirmation",
      );
      if (!stillConfirming) this.confirmationMemos.delete(id);
    }
    const awaiting: AwaitingEntrySignal[] = [];
    for (const [id, memo] of this.confirmationMemos) {
      if (memo.seriesKey === seriesKey) {
        awaiting.push({ ruleId: id, signalAnchorMs: memo.signalAnchorMs });
      }
    }
    this.onAwaiting?.(symbol, timeframe, awaiting);
  }

  private evaluateRules(
    rules: readonly RuleDocument[],
    symbol: string,
    timeframe: string,
    anchorMs: number,
    intrabar: boolean,
    asOf?: number,
  ): RuleFiring[] {
    const firings: RuleFiring[] = [];
    for (const rule of rules) {
      // One rule's failure is contained to that rule. Without this, a throw
      // escaped to `observeCandles` and every rule ordered after it on the
      // same close went unevaluated — an HMA alert silenced its neighbours on
      // every candle (BUG-0449).
      let firing: RuleFiring | undefined;
      try {
        firing = this.evaluateRule(rule, symbol, timeframe, anchorMs, intrabar, asOf);
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
    asOf?: number,
  ): RuleFiring | undefined {
    // FEAT-0823 — a confirmation bot never reaches the one-anchor gate in
    // the close path: its entry decision spans two anchors, and the gate's
    // dedupe would consume the signal anchor before a confirmation could
    // ever exist. The signal memo is the dedupe instead (see
    // `evaluateConfirmation`). Intrabar never gets here — the document
    // refuses that combination — and a confirmation doc without an order
    // is not this engine's problem (validation refuses it too); both fall
    // through to the gate path and are answered as themselves.
    if (!intrabar && rule.entry_trigger === "confirmation" && rule.action.order !== undefined) {
      return this.evaluateConfirmation(rule, symbol, timeframe, anchorMs, asOf);
    }
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

    const ctx = this.contextFor(rule, symbol, timeframe, intrabar, asOf);
    // Undefined means the rule cannot be honestly evaluated at all — not that
    // it did not fire. Skipping is the safe direction; `contextFor` has
    // already said so out loud.
    if (ctx === undefined) return undefined;

    const markCandles = this.markCandlesFor(rule, symbol, asOf);
    if (markCandles) {
      ctx.mark_candles = markCandles;
    }

    // Two gate entries, not one call with a flag: the close path dedupes an
    // anchor it has already decided, the intrabar path may look at the same
    // forming candle again and again, and the two keep separate records so one
    // cannot swallow the other's anchor.
    // FEAT-0816 — a veto whose feed nobody can answer is dropped for this
    // candle and reported once. Asking the core with that veto in place would
    // answer `indeterminate`, which freezes every strategy naming a feed for
    // as long as a third party is down (ADR-0029 decision 3).
    const asked = this.askableRule(rule, ctx);

    const verdict = intrabar
      ? ruleEvaluationGate.evaluateIntrabar(asked.rule, ctx, anchorMs)
      : ruleEvaluationGate.evaluate(asked.rule, ctx, anchorMs);
    // BUG-0485 — returning from the gate means the rule evaluated again: its
    // threshold resolved, its context built, and the core produced a verdict
    // attempt. Whatever made the rule inert no longer holds, so the record
    // drops itself here rather than waiting for a writer to clear it. Placed
    // after the call on purpose: a refusal throws out of the gate and never
    // reaches this, so the catch's re-report still finds the previous record
    // and stays silent through the steady-state guard instead of churning
    // delete/re-add on every close.
    if (this.unevaluable.delete(rule.id)) this.emitUnevaluable();
    // FEAT-0816 — only now, with a verdict in hand: the gate withholds one for
    // a rule that is not warmed up or for an anchor it already decided, and
    // neither of those decided anything without its veto.
    if (verdict !== undefined && asked.unavailable.length > 0) {
      this.reportDroppedVeto(rule, asked.unavailable);
    }
    if (verdict?.verdict === "suppressed" && !intrabar) this.reportSuppressed(rule, anchorMs);
    if (verdict === undefined || verdict.verdict !== "fires") return undefined;
    return { rule, verdict, anchorMs };
  }

  /**
   * FEAT-0823 — one confirmation bot's decision at one closed candle.
   *
   * Two decisions per anchor, in this order: consume the previous anchor's
   * signal (the entry, the discard, or the stop-out cancel), then derive
   * this anchor's signal (the await). Both evaluations bypass the
   * one-anchor gate on purpose — the gate's dedupe has no two-anchor
   * vocabulary, and the memo already is the replay guard: a replayed close
   * finds the memo consumed and the signal re-derivation is idempotent, so
   * the same candles always produce the same entry, never two.
   *
   * Nothing here touches storage. A reload mid-wait re-derives the signal
   * from the candle that produced it (`confirmSignal`'s catch-up half), so
   * the wait survives a restart without a second thing to persist — the
   * one corner that accepts is a bot armed between a signal and its
   * confirmation entering on a signal it was not alive for: bounded (one
   * entry, every lane guard applies) and the alternative — losing every
   * mid-wait reload — is the worse contract.
   */
  private evaluateConfirmation(
    rule: RuleDocument,
    symbol: string,
    timeframe: string,
    anchorMs: number,
    asOf?: number,
  ): RuleFiring | undefined {
    const seriesKey = `${symbol}|${timeframe}`;
    // FEAT-0823 review — one decision per anchor, the discipline the gate
    // holds for every other rule. The in-session half is the map beside
    // this class's memos; the durable half is the fire ledger — a
    // confirmation rule's every firing IS an entry decision (this branch is
    // the only path that emits one), so its last fired anchor is exactly
    // "the newest confirmation close this rule already entered on". An
    // anchor at or below the floor returns quietly: the decision stands,
    // the memo state stands with it, and a replayed close — the market
    // cache's LRU eviction refilling the series — re-enters nothing.
    const floorMs = Math.max(
      this.confirmationDecidedMs.get(rule.id) ?? Number.NEGATIVE_INFINITY,
      this.durableConfirmationFloor(rule),
    );
    if (anchorMs <= floorMs) return undefined;
    this.confirmationDecidedMs.set(rule.id, anchorMs);

    const memo = this.confirmationMemos.get(rule.id);
    let entry: RuleFiring | undefined;

    // The entry decision consumes the wait first — one signal, one
    // confirmation close, and a replayed anchor finds nothing left to spend.
    let consumed = false;
    if (memo !== undefined && memo.seriesKey === seriesKey) {
      this.confirmationMemos.delete(rule.id);
      consumed = true;
      if (memo.ownedAtSignal && this.ownedPositions(rule.id).length === 0) {
        // AC 5 — the position this signal was sizing is gone (a stop-out, a
        // manual close); entering now would open a fresh position on the
        // strength of a candle that spoke about a trade already over.
        this.onSignalDiscarded?.(rule.id, anchorMs, "signal-stopped-out");
      } else {
        const confirmed = this.confirmSignal(rule, symbol, timeframe, anchorMs, asOf);
        if (isConfirmationEntry(confirmed)) {
          entry = confirmed;
        } else if (confirmed === "against") {
          this.onSignalDiscarded?.(rule.id, anchorMs, "confirmation-against-direction");
        }
        // "no-signal" records nothing: the memo says a signal existed, but
        // its own candle can no longer be read (a trimmed series, an
        // eviction) — "the market refused" would be a story about a candle
        // nobody can see. The wait dies quietly, and the signal derivation
        // below re-arms from whatever this close does say.
      }
    }

    // The reload catch-up: a signal this loop instance never held. Only a
    // real signal gets a discard record — "no signal on the previous
    // candle" is the quiet majority and says nothing.
    if (!consumed) {
      const confirmed = this.confirmSignal(rule, symbol, timeframe, anchorMs, asOf);
      if (isConfirmationEntry(confirmed)) {
        entry = confirmed;
      } else if (confirmed === "against") {
        this.onSignalDiscarded?.(rule.id, anchorMs, "confirmation-against-direction");
      }
    }

    // This anchor's own signal: conditions true at this close hold the
    // wait for the next one — including on the close that confirmed an
    // entry, because conditions still holding is a new wait, not a
    // continuation of the old one. Owned state is read at the moment the
    // signal forms, because that is the trade the signal is sizing — the
    // AC 5 cancel compares against this, not against a later read.
    const signal = this.rawSignalAt(rule, symbol, timeframe, anchorMs, asOf);
    // FEAT-0814 — a confirmation bot's signal can be vetoed too; without this
    // it would read as a strategy that found no setup. Reported here, where
    // the signal is first decided, not on the confirmation's re-read of it.
    if (signal?.verdict === "suppressed") this.reportSuppressed(rule, anchorMs);
    if (signal?.verdict === "fires") {
      this.confirmationMemos.set(rule.id, {
        seriesKey,
        signalAnchorMs: anchorMs,
        ownedAtSignal: this.ownedPositions(rule.id).length > 0,
      });
    }
    return entry;
  }

  /**
   * FEAT-0823 review — the durable half of the confirmation floor.
   *
   * A confirmation rule's every firing is an entry decision (the branch
   * above is the only path that emits one), so the fire ledger's last
   * anchor is exactly "the newest confirmation close this rule already
   * entered on" — the floor a reload re-reads instead of entering twice.
   * Read through `stateFor`, the same guarded reader the trigger path
   * uses, so an unreadable ledger errs towards acting (no floor), the loud
   * direction for an entry the lane's own guards still bound.
   */
  private durableConfirmationFloor(rule: RuleDocument): number {
    const fired = this.stateFor(rule)?.last_fired_anchor_ms;
    return typeof fired === "number" && Number.isFinite(fired)
      ? fired
      : Number.NEGATIVE_INFINITY;
  }

  /**
   * FEAT-0823 — decide the entry at this close: did the previous candle
   * hold the signal, and does this close's candle confirm its direction?
   *
   * `"no-signal"` and `"against"` are words, not booleans, because the
   * caller records the second and must not record the first: a candle that
   * never signalled is silence, a signal the market refused is an answer.
   */
  private confirmSignal(
    rule: RuleDocument,
    symbol: string,
    timeframe: string,
    anchorMs: number,
    asOf?: number,
  ): RuleFiring | "against" | "no-signal" {
    // The signal candle is the one before the confirmation candle — its
    // anchor is the previous closed candle of the trigger series, not
    // `anchorMs − timeframe`, which would invent a candle the series never
    // had.
    const candles = this.readCandles(symbol, timeframe);
    const index = candles.findIndex((c) => c.open_time_ms === anchorMs);
    if (index <= 0) return "no-signal";
    const signalAnchorMs = candles[index - 1].open_time_ms;

    const verdict = this.rawSignalAt(rule, symbol, timeframe, signalAnchorMs, signalAnchorMs);
    if (verdict === undefined || verdict.verdict !== "fires") return "no-signal";

    const ctx = this.contextFor(rule, symbol, timeframe, false, asOf ?? anchorMs);
    const candle = ctx?.candles[rule.trigger_timeframe]?.at(-1);
    // No confirmation candle means the context cannot answer — the same
    // honest skip the trigger path takes, never a refusal.
    if (candle === undefined) return "no-signal";

    // The direction contract: a long is confirmed by a green close, a short
    // by a red one, a doji by neither. Decimal, not string comparison —
    // "9.5" > "10.25" as text is the bug this line exists to not have.
    const open = new Decimal(candle.open);
    const close = new Decimal(candle.close);
    const intent = rule.action.order?.side;
    if (intent === "buy" && close.gt(open)) return { rule, verdict, anchorMs };
    if (intent === "sell" && close.lt(open)) return { rule, verdict, anchorMs };
    return "against";
  }

  /**
   * FEAT-0823 — the raw condition evaluation at one closed anchor, shared
   * by the signal derivation and the confirmation decision.
   *
   * Deliberately not the gate: the gate's one-anchor dedupe would consume
   * the signal anchor before a confirmation could ever exist, and the memo
   * is the replay guard for this whole path. Threshold resolution and the
   * mark series are still honoured — a confirmation signal anchored to a
   * drawing or the mark price reads the same sources an immediate one does.
   */
  private rawSignalAt(
    rule: RuleDocument,
    symbol: string,
    timeframe: string,
    anchorMs: number,
    asOf?: number,
  ): Verdict | undefined {
    const resolved = this.resolveThreshold(rule, anchorMs);
    if ("unevaluable" in resolved) {
      this.reportUnevaluable(rule, resolved.unevaluable);
      return undefined;
    }
    const ctx = this.contextFor(resolved.rule, symbol, timeframe, false, asOf ?? anchorMs);
    if (ctx === undefined) return undefined;
    // The gate this path bypasses also carried the warmup check, and
    // bypassing the gate must not mean bypassing the warmup: an indicator
    // condition evaluated over a partial buffer is not an honest signal,
    // and "the memo is the dedupe" never licensed it. The gate uses the
    // same call on the same context.
    const closedCandles = ctx.candles[resolved.rule.trigger_timeframe]?.length ?? 0;
    if (closedCandles < ruleSchema.warmupCandles(resolved.rule)) return undefined;
    const markCandles = this.markCandlesFor(resolved.rule, symbol, asOf);
    if (markCandles) {
      ctx.mark_candles = markCandles;
    }
    const asked = this.askableRule(resolved.rule, ctx);
    const verdict = ruleSchema.evaluate(asked.rule, ctx);
    // FEAT-0816 — the warmup floor above has already passed, so the core did
    // answer: a veto dropped here really did not apply to this signal.
    if (asked.unavailable.length > 0) this.reportDroppedVeto(resolved.rule, asked.unavailable);
    // FEAT-0823 review — BUG-0485's clearing discipline, carried into the
    // path that bypasses the gate: a signal that evaluated says whatever
    // made the rule inert no longer holds, so the record drops here rather
    // than waiting for a writer that never comes. After the call, not
    // before: a refusal throws out of the core and must leave the record
    // for the catch's steady-state guard to find.
    if (this.unevaluable.delete(rule.id)) this.emitUnevaluable();
    return verdict;
  }

  /**
   * FEAT-0810 — the exit window at one closed candle.
   *
   * Runs beside `evaluateSeries` on the same anchor and answers a different
   * question for a different audience: not "does the rule fire" (the trigger,
   * which the enabled switch gates) but "does the bot leave the position it
   * owns" — which ownership decides, not arming. A paused bot keeps
   * protecting; the owner decided that with the trigger cadence in G1.
   *
   * One action per `(rule, anchor, position)`: the first exit that holds in
   * document order wins the anchor, the win is recorded durably before the
   * sink runs, and a reload re-reads the record instead of closing twice.
   */
  private evaluateExitWindow(symbol: string, timeframe: string, anchorMs: number): void {
    if (this.onExitFiring === undefined) return;

    // Ownership candidates, not armed candidates: the enabled filter the
    // trigger applies is deliberately absent.
    const candidates = this.readRules().filter(
      (rule) =>
        rule !== null &&
        typeof rule === "object" &&
        rule.symbol === symbol &&
        rule.trigger_timeframe === timeframe &&
        ((rule.exits?.length ?? 0) > 0 || rule.take_profit !== undefined),
    );

    for (const rule of candidates) {
      for (const position of this.ownedPositions(rule.id)) {
        // Ownership is per market, not per id: a rule edited to another
        // symbol keeps the book row (armRule preserves it), but its exits
        // stop governing it — the row stays the trader's to close by hand,
        // and the rule's new market never sees a cross-ownership close
        // (ADR-0026).
        if (position.symbol !== rule.symbol) continue;
        this.evaluateExitsFor(rule, position, symbol, timeframe, anchorMs);
      }
    }
  }

  /**
   * One owned position's exit answers at one anchor.
   *
   * The same context the trigger gets — candles truncated to the anchor, so
   * a replayed close is decided where it happened (BUG-0483 part 2's
   * discipline, which protects exits exactly as it protects triggers) — plus
   * the account snapshot scoped to this position. `resolveThreshold` is
   * deliberately not run: the drawing resolver rewrites the trigger half
   * today, and an exit that names a drawing evaluates against its stored
   * constant until the resolver learns exits; pretending otherwise here
   * would make the resolver's gaps look like the exit engine's.
   */
  private evaluateExitsFor(
    rule: RuleDocument,
    position: OwnedBotPosition,
    symbol: string,
    timeframe: string,
    anchorMs: number,
  ): void {
    // Idempotency, monotonic like the trigger gate's: anchors only move
    // forward on a series, so one recorded action bounds every re-read of
    // the same or an older anchor — including the one a reload replays
    // mid-exit.
    if (position.lastExitActionAnchorMs !== null && anchorMs <= position.lastExitActionAnchorMs) {
      return;
    }

    const ctx = this.contextFor(rule, symbol, timeframe, false, anchorMs);
    if (ctx === undefined) return;
    const account = this.accountForPosition(rule.id, position.positionId);
    if (account !== undefined) ctx.account = account;

    let answers: ExitAnswer[];
    try {
      answers = ruleSchema.evaluateExits(rule, ctx, {
        entry_price: position.entryPrice,
        side: position.side,
      });
    } catch (e) {
      if (isRuleRefusedError(e)) {
        // A document the core refuses cannot be honestly evaluated against
        // anything. The same once-per-rule channel the trigger uses, with
        // the reason phrased the way the loop already phrases refusals.
        this.reportUnevaluable(rule, `the rule core refuses this rule: ${e.message}`);
      } else {
        logger.error(
          "alerts",
          `[RuleEngine] Exit evaluation failed for rule ${rule.id} on ${symbol} ${timeframe}`,
          e,
        );
      }
      return;
    }

    // An unreadable exit neither acts nor blocks the readable ones — but it
    // is worth surfacing once: an exit whose indicator never warms up is a
    // bot that looks protected and is not.
    const unknown = answers.find((a) => a.outcome.result === "unknown");
    if (unknown !== undefined && unknown.outcome.result === "unknown") {
      this.reportUnevaluable(rule, unknown.outcome.reason);
    }

    // First exit that holds, in document order — `take_profit` answers
    // last, exactly the order the core returns. One anchor, one action.
    const fired = answers.find((a) => a.outcome.result === "fires");
    if (fired === undefined || fired.outcome.result !== "fires") return;

    // Recorded before the sink runs: a sink that throws must not erase the
    // ledger entry, or a retry would close twice over the same anchor.
    this.recordExitAction?.(rule.id, position.positionId, anchorMs);

    try {
      this.onExitFiring?.({
        rule,
        // The row's market, not the rule's current one — after the
        // ownership filter they are the same, and the close must name what
        // it closes even if a future caller loosens that filter.
        symbol: position.symbol,
        positionId: position.positionId,
        close: fired.outcome.close,
        ...(fired.outcome.close === "partial" && fired.outcome.fraction !== null
          ? { fraction: fired.outcome.fraction }
          : {}),
        exitIndex: fired.index,
        anchorMs,
      });
    } catch (e) {
      logger.error(
        "alerts",
        `[RuleEngine] Exit firing sink failed for rule ${rule.id} on ${symbol} ${timeframe}`,
        e,
      );
    }
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
    asOf?: number,
  ): Record<string, EvaluationCandle[]> {
    // A replayed close is decided against history truncated to it: without
    // the ceiling, every skipped close would answer from post-backfill data
    // and a crossing inside the gap would still be invisible (BUG-0483 part
    // 2). This is also what makes the gate's contract true — the open time of
    // the context's last closed candle is the stamped anchor.
    const read = (s: string, t: string, forming: boolean): EvaluationCandle[] => {
      const series = forming ? this.readFormingCandles(s, t) : this.readCandles(s, t);
      if (asOf === undefined) return series;
      return series.filter((c) => c.open_time_ms <= asOf);
    };
    const candles: Record<string, EvaluationCandle[]> = {
      [triggerTimeframe]: read(symbol, triggerTimeframe, intrabar),
    };

    for (const timeframe of collectTimeframes(rule)) {
      if (timeframe === triggerTimeframe) continue;
      candles[timeframe] = read(symbol, timeframe, false);
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
    asOf?: number,
  ): EvaluationContext | undefined {
    const candles = this.candlesFor(rule, symbol, triggerTimeframe, intrabar, asOf);
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

    // FEAT-0816 — only the feeds this rule's veto actually reads, and only
    // while they are fresh. A rule that names no feed sends the payload it
    // sent before this existed, and a stale reading is left out rather than
    // passed as a value the core cannot tell from a current one (ADR-0029
    // decision 2).
    const feeds = this.feedsFor(rule, symbol);
    if (feeds !== undefined) ctx.feeds = feeds;

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
   * Hands a vetoed close to its sink, contained like the firing sink: a
   * suppression recorder that throws must not stop the rules after this one.
   */
  private reportSuppressed(rule: RuleDocument, anchorMs: number): void {
    // Read again rather than carried over from the evaluation: the reader
    // answers from a held snapshot, so this costs no request, and nothing
    // hidden has to travel between building the context and writing the
    // record. For a rule whose veto reads no feed this is an empty array and
    // the record keeps the shape it had before FEAT-0816.
    const feeds = this.feedReadingsFor(rule, rule.symbol);
    try {
      this.onSuppressed({ rule, anchorMs, ...(feeds.length > 0 ? { feeds } : {}) });
    } catch (e) {
      logger.error("alerts", `[RuleEngine] Suppression sink failed for rule ${rule.id}`, e);
    }
  }

  /**
   * FEAT-0816 — the fresh readings for the feeds this rule's veto names.
   *
   * Narrowed to the named feeds on purpose: what the engine happens to hold
   * for a market is not what this rule asked about, and a record that listed
   * every feed would claim the veto was judged against numbers it never read.
   */
  private feedReadingsFor(rule: RuleDocument, symbol: string): FeedReading[] {
    const named = feedsNamedBy(rule.veto);
    if (named.length === 0) return [];
    return freshReadings(this.readFeeds(symbol), Date.now()).filter((reading) =>
      named.includes(reading.feed),
    );
  }

  /**
   * The `feeds` map for one rule, or `undefined` when it reads none.
   *
   * `undefined` rather than an empty object, for the same reason
   * `markCandlesFor` returns it: a rule that names no feed must produce the
   * same wire payload it produced before this key existed.
   */
  private feedsFor(rule: RuleDocument, symbol: string): Record<string, DecimalString> | undefined {
    const readings = this.feedReadingsFor(rule, symbol);
    if (readings.length === 0) return undefined;

    const values: Record<string, DecimalString> = {};
    for (const reading of readings) values[reading.feed] = reading.value;
    return values;
  }

  /**
   * FEAT-0816 — the document the core may be asked about at this candle.
   *
   * Usually the rule itself. When its veto reads a feed nothing can answer,
   * the whole veto is dropped and the trader is told: the core answers an
   * unreadable veto with `indeterminate` and would otherwise hold the rule
   * silent for as long as a third party is down (ADR-0029 decisions 3 and 4).
   *
   * The stored document is never touched, and the firing the caller returns
   * still carries the rule as authored -- the dropped copy exists for the
   * length of one question, so nothing downstream sees a strategy whose
   * content hash differs from the one the trader armed.
   *
   * Reporting is the caller's job, after the core has actually answered: this
   * runs before the gate's warmup and replay checks, and a rule those checks
   * withhold did not decide without its veto. Telling the trader it did would
   * be a false alarm -- which is why `unavailable` is handed back rather than
   * announced here.
   */
  private askableRule(
    rule: RuleDocument,
    ctx: EvaluationContext,
  ): { rule: RuleDocument; unavailable: string[] } {
    const unavailable = unavailableVetoFeeds(rule, ctx.feeds ?? {});
    if (unavailable.length === 0) {
      // Answered, or never asked: the next outage is news again.
      this.droppedVetoes.delete(rule.id);
      return { rule, unavailable };
    }

    return { rule: withoutVeto(rule), unavailable };
  }

  /**
   * Tell the sink once per rule while the same feeds stay unavailable.
   *
   * Contained like every other sink here: a toast that throws must not stop
   * the rules after this one. The record is written before the sink runs, so a
   * throwing sink cannot buy itself a second report on the next candle.
   */
  private reportDroppedVeto(rule: RuleDocument, feeds: readonly string[]): void {
    const outage = feeds.join(",");
    if (this.droppedVetoes.get(rule.id) === outage) return;
    this.droppedVetoes.set(rule.id, outage);

    try {
      this.onDroppedVeto({
        ruleId: rule.id,
        name: rule.name,
        symbol: rule.symbol,
        feeds: [...feeds],
      });
    } catch (e) {
      logger.error("alerts", `[RuleEngine] Dropped-veto sink failed for rule ${rule.id}`, e);
    }
  }

  /**
   * Record a rule as inert, and tell the sink once per rule per session.
   *
   * The record is the part that matters and is stored first, so a sink that
   * throws — a toast, a notification channel — cannot take the evaluation of
   * every other rule down with it. Re-reporting refreshes the reason (the
   * cause may have changed since the first report) but never re-notifies:
   * the interruption budget lives in `unevaluableNotified`, not in the map,
   * so forgetting and re-reporting cannot buy a second toast.
   */
  private reportUnevaluable(rule: RuleDocument, reason: string): void {
    const previous = this.unevaluable.get(rule.id);

    const record: UnevaluableRule = {
      ruleId: rule.id,
      name: rule.name,
      symbol: rule.symbol,
      reason,
    };
    // The steady state — same rule, same cause, every close — changes
    // nothing and tells nobody: emitting here would re-derive the panel on
    // every candle close for a record it already shows.
    if (
      previous !== undefined &&
      previous.name === record.name &&
      previous.symbol === record.symbol &&
      previous.reason === record.reason
    ) {
      return;
    }
    this.unevaluable.set(rule.id, record);
    this.emitUnevaluable();

    if (previous !== undefined || this.unevaluableNotified.has(rule.id)) return;
    this.unevaluableNotified.add(rule.id);

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
    asOf?: number,
  ): Record<string, EvaluationCandle[]> | undefined {
    const timeframes = collectMarkTimeframes(rule);
    if (timeframes.size === 0) return undefined;

    const candles: Record<string, EvaluationCandle[]> = {};
    for (const timeframe of timeframes) {
      const series = this.readMarkCandles(symbol, timeframe);
      candles[timeframe] = asOf === undefined ? series : series.filter((c) => c.open_time_ms <= asOf);
    }
    return candles;
  }

  /** Forget one series. */
  forgetSeries(symbol: string, timeframe: string): void {
    const key = `${symbol}:${timeframe}`;
    this.highestOpenMs.delete(key);
    if (this.seriesGapRecords.delete(key)) this.emitSeriesGaps();
  }

  /**
   * Forget every series of a symbol, called when the market cache evicts it.
   *
   * Two reasons, one small and one smaller: the map would otherwise keep a
   * row per timeframe for every symbol ever seen, and a stale high-water mark
   * makes the first candle after a re-subscription look like a close that
   * already happened, skipping it. The gap record goes with it for the same
   * reason — a re-subscribed series is a new observed span — and the panel is
   * told, or it would keep listing a symbol the cache no longer holds.
   */
  forgetSymbol(symbol: string): void {
    const prefix = `${symbol}:`;
    for (const key of this.highestOpenMs.keys()) {
      if (key.startsWith(prefix)) this.highestOpenMs.delete(key);
    }
    let forgotten = false;
    for (const key of this.seriesGapRecords.keys()) {
      if (key.startsWith(prefix)) {
        this.seriesGapRecords.delete(key);
        forgotten = true;
      }
    }
    if (forgotten) this.emitSeriesGaps();
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
    this.onSuppressed = () => {};
    this.readFeeds = NO_FEEDS;
    this.droppedVetoes.clear();
    this.onClose = () => {};
    this.onEachClose = () => {};
    this.onUnevaluable = logUnevaluable;
    // FEAT-0823 review — the held waits die with the engine that formed
    // them: a shadow pass's memo must never be consumed by the live pass
    // that follows, and a memo with no engine to evaluate its confirmation
    // is a promise nobody can keep. The decided-anchor floor survives a
    // disarm on purpose — decisions are facts about anchors, and a re-init
    // replaying them (the LRU refill) re-enters nothing either way.
    this.confirmationMemos.clear();
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
    this.unevaluableNotified.clear();
    if (this.seriesGapRecords.size > 0) {
      this.seriesGapRecords.clear();
      this.emitSeriesGaps();
    }
    // FEAT-0823 review — the confirmation state is series state too: a
    // full teardown (HMR, a fresh test) must not inherit another
    // lifetime's waits or decisions.
    this.confirmationMemos.clear();
    this.confirmationDecidedMs.clear();
    // FEAT-0816 — so is the outage record: a fresh lifetime that inherited it
    // would swallow the first report of an outage it never announced.
    this.droppedVetoes.clear();
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
 *
 * Exported for the same reason `collectMarkTimeframes` below is: the parity
 * test is the enforcer that keeps this mirror and the core walking the same
 * trees, and FEAT-0809 added a third tree (`exits[*].when`) to both sides.
 */
export function collectTimeframes(rule: RuleDocument): Set<string> {
  const found = new Set<string>();

  const walk = (condition: unknown): void => {
    if (condition === null || typeof condition !== "object") return;
    const node = condition as { timeframe?: unknown; of?: unknown };

    if (typeof node.timeframe === "string") found.add(node.timeframe);
    if (Array.isArray(node.of)) node.of.forEach(walk);
  };

  walk(rule.conditions);
  walk(rule.veto);
  // FEAT-0809: exits read the same series the trigger does, and this mirror
  // must agree with the core — which walks them — or a verdict silently
  // loses a series it needed.
  for (const exit of rule.exits ?? []) walk(exit.when);
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
 *
 * Exported as the seam the parity test holds to the core's
 * `rule_mark_timeframes`: the two must agree over every condition and operand
 * shape, and the test (BUG-0482) is what stops the next nested operand
 * re-opening this.
 */
export function collectMarkTimeframes(rule: RuleDocument): Set<string> {
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
  // Same as `collectTimeframes` above: the core walks exits too
  // (FEAT-0809), and a mark read that lives only in an exit is a mark
  // series the rule needs — missing it here would withhold the verdict in
  // 0810's executor for a rule that looks armed.
  for (const exit of rule.exits ?? []) walk(exit.when);
  return found;
}
