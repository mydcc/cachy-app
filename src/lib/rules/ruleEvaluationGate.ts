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
 * Ensures a rule is asked for a verdict at most once per close of its trigger
 * timeframe — FEAT-0387's acceptance criterion, "a rule is evaluated once per
 * close of its trigger_timeframe, not per price tick".
 *
 * `ruleSchema.evaluate()` is pure and stateless on the Rust side: called twice
 * with the same last-closed candle, it returns the same verdict again — it has
 * no memory of having been asked already. Something on this side has to dedupe,
 * and this is that something.
 *
 * Deliberately not a live consumer of the candle stream. Where that loop lives
 * is unresolved (see FEAT-0387's "Open questions" and ADR-0009's rule that a
 * background consumer must not write into `marketState`), and the actual
 * debounce policy for high-frequency updates is FEAT-0368's job, not this
 * item's. This is only the sequencing primitive both would need: a pure
 * function of `(ruleId, anchorMs)`, framework-agnostic, callable by whatever
 * eventually drives it.
 */

import { ruleSchema } from "./ruleSchema";
import type { BotAnchorSnapshot, EvaluationContext, RuleDocument, Verdict } from "./types";

/**
 * BUG-0491 — the durable half of the gate's dedupe, as a port.
 *
 * The maps below are per-session; a reload rebuilds this class and every rule
 * reads as never-evaluated. For a `notify` rule that costs a duplicate
 * notification, which in-memory dedupe answers proportionately. For a bot it
 * costs a duplicate *order*, so bot anchors are persisted through this port —
 * implemented storage-side (`ruleStateStore`), where the per-rule record
 * already lives. This file imports no storage: the interface is the whole
 * dependency.
 *
 * Every method must be total and must not throw: storage already contains its
 * own failures, and a persistence hiccup must never take down the evaluation
 * that triggered it — the in-memory maps stay the truth for this session.
 */
export interface BotAnchorPersistence {
  /** Whether this document's anchors are durable — `isBot` in practice. */
  isBotRule: (document: RuleDocument) => boolean;
  /** The anchors a previous session decided, or `undefined` when none. */
  load: (ruleId: string) => BotAnchorSnapshot | undefined;
  /** Records the anchors this session just decided. */
  save: (ruleId: string, snapshot: BotAnchorSnapshot) => void;
  /** Drops the anchors, keeping whatever else the entry carries. */
  clear: (ruleId: string) => void;
}

export class RuleEvaluationGate {
  private botPersistence: BotAnchorPersistence | null = null;
  /**
   * Rules whose persisted anchors were already seeded into the maps above.
   *
   * Without this, every evaluation of a close-mode bot would re-read storage:
   * its intrabar maps stay empty forever, so "all three maps have an entry"
   * never becomes true on its own.
   */
  private readonly seededBotAnchors = new Set<string>();
  private readonly lastEvaluatedAnchorMs = new Map<string, number>();
  /**
   * The same record for the intrabar path, kept apart on purpose — FEAT-0477.
   *
   * An open candle and that same candle once closed share one `open_time_ms`.
   * Through one map, a look at the forming candle would consume the anchor and
   * the real close would then read as already-decided and be withheld — the
   * intrabar mode would silently disable the close it was layered on top of.
   * Two records make that impossible rather than making one caller careful,
   * and they also survive a rule being switched between the two modes
   * mid-session, which a single record could not.
   */
  private readonly lastIntrabarAnchorMs = new Map<string, number>();
  /**
   * The anchors this rule has already announced on through the intrabar path,
   * kept apart from the evaluation record above on purpose — FEAT-0477.
   *
   * Re-evaluating a forming candle on every tick is the mode (repaint: a
   * condition false now may hold on the next tick), but announcing is at most
   * once per candle, for every frequency alike. `frequency` cannot carry this:
   * the core answers `every_time` with yes however often it has fired, so
   * without this record such a rule would announce on every tick of the
   * candle — the stream of contradictory alerts about one candle FEAT-0477
   * decided against. Across candles nothing changes: a newer anchor is a new
   * decision, and `frequency` keeps its current meaning there.
   */
  private readonly lastIntrabarFiredAnchorMs = new Map<string, number>();

  constructor(persistence?: BotAnchorPersistence) {
    if (persistence) this.botPersistence = persistence;
  }

  /**
   * Binds the durable half of the dedupe after construction — BUG-0491.
   *
   * The module singleton cannot take it through the constructor: it is built
   * at import time, before storage is readable. The wiring that owns store
   * access calls this once at startup; tests pass a fake per gate instead.
   * `null` unbinds again, which is what HMR teardown uses.
   */
  setBotAnchorPersistence(persistence: BotAnchorPersistence | null): void {
    this.botPersistence = persistence;
  }

  /**
   * Seeds one bot's maps from the previous session, once per gate lifetime.
   *
   * Lazy rather than at startup: the gate never learns the armed rule set, so
   * there is nothing to hydrate eagerly — the first evaluation of a rule pulls
   * its own record. A no-op for every rule the port does not claim, which is
   * what leaves the `notify` path exactly as it was: no reads, no writes.
   */
  private seedBotAnchors(document: RuleDocument): void {
    const persistence = this.botPersistence;
    if (!persistence || !persistence.isBotRule(document)) return;
    if (this.seededBotAnchors.has(document.id)) return;
    this.seededBotAnchors.add(document.id);

    const snapshot = persistence.load(document.id);
    if (!snapshot) return;
    if (snapshot.evaluatedAnchorMs !== null) this.lastEvaluatedAnchorMs.set(document.id, snapshot.evaluatedAnchorMs);
    if (snapshot.intrabarAnchorMs !== null) this.lastIntrabarAnchorMs.set(document.id, snapshot.intrabarAnchorMs);
    if (snapshot.intrabarFiredAnchorMs !== null) {
      this.lastIntrabarFiredAnchorMs.set(document.id, snapshot.intrabarFiredAnchorMs);
    }
  }

  /** This session's anchors for one rule, absent maps reading as no record. */
  private botSnapshot(ruleId: string): BotAnchorSnapshot {
    return {
      evaluatedAnchorMs: this.lastEvaluatedAnchorMs.get(ruleId) ?? null,
      intrabarAnchorMs: this.lastIntrabarAnchorMs.get(ruleId) ?? null,
      intrabarFiredAnchorMs: this.lastIntrabarFiredAnchorMs.get(ruleId) ?? null,
    };
  }

  /**
   * Persists one bot's anchors after an evaluation that succeeded.
   *
   * After success only, mirroring the maps: a transient failure records
   * nothing in either place, so the next tick retries both. A no-op for
   * every rule the port does not claim.
   */
  private persistBotAnchors(document: RuleDocument): void {
    const persistence = this.botPersistence;
    if (!persistence || !persistence.isBotRule(document)) return;
    persistence.save(document.id, this.botSnapshot(document.id));
  }

  /**
   * Evaluate `document` against `ctx`, unless `anchorMs` — the open time of
   * `ctx.candles[document.trigger_timeframe]`'s last closed candle, which the
   * caller already has — was already evaluated for this rule, or the rule has
   * not yet warmed up.
   *
   * `ctx.candles` must key the trigger series with the same spelling as
   * `document.trigger_timeframe` (both are canonical once the document has
   * gone through `ruleSchema.validate()`); a mismatched spelling reads as no
   * candles at all and withholds every verdict, not an error.
   *
   * Returns `undefined` in both skip cases: an anchor at or before the last one
   * decided is not a new
   * decision to report, and an unwarmed rule must produce no verdict at all
   * rather than one built from a partial buffer. The anchor is recorded only
   * after `ruleSchema.evaluate()` returns successfully, so a transient
   * failure (a core refusal, a wasm blip) is retried on the next tick within
   * the same candle rather than silently skipped until the next close.
   */
  evaluate(document: RuleDocument, ctx: EvaluationContext, anchorMs: number): Verdict | undefined {
    const closedCandles = ctx.candles[document.trigger_timeframe]?.length ?? 0;
    if (closedCandles < ruleSchema.warmupCandles(document)) return undefined;

    // BUG-0491: a reloaded session seeds the floor below from storage before
    // the dedupe reads it — otherwise this same anchor evaluates (and, for a
    // bot, orders) a second time.
    this.seedBotAnchors(document);
    // At or *before* the last anchor, not merely equal to it. Equality alone
    // dedupes the ticks within one candle and nothing else: any anchor that is
    // not exactly the previous one passes, so a replayed or corrected candle
    // fires a second time for an event the trader was already told about.
    //
    // That is not hypothetical. A reconnect clears the loop's high-water mark
    // (`forgetSeries`), the store refills the series, and evaluation resumes
    // from an anchor that has already been decided. Monotonic makes the whole
    // class impossible rather than making one path careful, and costs nothing:
    // a rule that legitimately needs to decide an anchor again is edited or
    // disarmed, and both call `forget`.
    const lastAnchorMs = this.lastEvaluatedAnchorMs.get(document.id);
    if (lastAnchorMs !== undefined && anchorMs <= lastAnchorMs) return undefined;

    const verdict = ruleSchema.evaluate(document, ctx);
    this.lastEvaluatedAnchorMs.set(document.id, anchorMs);
    this.persistBotAnchors(document);
    return verdict;
  }

  /**
   * Evaluate `document` against a context whose trigger series ends with the
   * candle still forming — FEAT-0477's `evaluation_mode: "intrabar"`.
   *
   * `anchorMs` is that forming candle's open time, so it stays the same across
   * every update of the candle. The dedupe is therefore deliberately weaker
   * than {@link evaluate}'s: strictly *before* the newest anchor is refused,
   * equal to it is allowed. Refusing the equal case here would let exactly one
   * tick per candle through and turn intrabar back into a slower, less
   * accurate close.
   *
   * What stops a rule announcing itself on every tick is split in two: a rule
   * whose conditions stop holding is simply re-evaluated (repaint), while a
   * rule that fired is recorded in a separate announced-record below and not
   * announced again on the same candle. `frequency`, which the core applies
   * from `ctx.state` (FEAT-0440), still governs across candles — but it cannot
   * carry the within-candle half, because the core answers `every_time` with
   * yes however often the rule has fired.
   *
   * The monotonic half is kept: a forming candle that already rolled over
   * cannot be reopened by a replayed or corrected update after a reconnect.
   */
  evaluateIntrabar(
    document: RuleDocument,
    ctx: EvaluationContext,
    anchorMs: number,
  ): Verdict | undefined {
    const seenCandles = ctx.candles[document.trigger_timeframe]?.length ?? 0;
    if (seenCandles < ruleSchema.warmupCandles(document)) return undefined;

    // BUG-0491: same lazy hydration as the close path above.
    this.seedBotAnchors(document);
    const lastAnchorMs = this.lastIntrabarAnchorMs.get(document.id);
    if (lastAnchorMs !== undefined && anchorMs < lastAnchorMs) return undefined;

    // At most one announcement per candle, every frequency alike: a replayed
    // or corrected update of a candle that already announced must not speak
    // again, and neither must the next tick of a candle still forming.
    const lastFiredMs = this.lastIntrabarFiredAnchorMs.get(document.id);
    if (lastFiredMs !== undefined && anchorMs <= lastFiredMs) return undefined;

    const verdict = ruleSchema.evaluate(document, ctx);
    // BUG-0491: persist on anchor advance or on fire only — re-saving the
    // same forming anchor on every tick would be a storage write per tick per
    // bot. The store skips no-change writes too, so this is the second of two
    // guards, not the only one.
    const advanced = lastAnchorMs === undefined || anchorMs > lastAnchorMs;
    this.lastIntrabarAnchorMs.set(document.id, anchorMs);
    if (verdict.verdict === "fires") this.lastIntrabarFiredAnchorMs.set(document.id, anchorMs);
    if (advanced || verdict.verdict === "fires") this.persistBotAnchors(document);
    return verdict;
  }

  /**
   * Forget a rule's last-evaluated anchors, e.g. when it is edited or disarmed.
   *
   * All records, always — the three maps and, for bots, the persisted anchors
   * (BUG-0491). A caller that forgets a rule wants that rule to be decidable
   * again, and leaving one of them behind would make the answer depend on
   * which mode the document happened to carry when it was forgotten, or on
   * whether the session reloaded since.
   */
  forget(ruleId: string): void {
    this.lastEvaluatedAnchorMs.delete(ruleId);
    this.lastIntrabarAnchorMs.delete(ruleId);
    this.lastIntrabarFiredAnchorMs.delete(ruleId);
    this.seededBotAnchors.delete(ruleId);
    // BUG-0491: the durable record goes with the maps — a forgotten rule is
    // decidable again after a reload too, not just this session. Storage-side
    // this drops anchors only and keeps the fire count; a rule carrying no
    // anchors is a no-op without a write.
    this.botPersistence?.clear(ruleId);
  }
}

export const ruleEvaluationGate = new RuleEvaluationGate();
