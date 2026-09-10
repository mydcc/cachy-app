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
import type { EvaluationContext, RuleDocument, Verdict } from "./types";

export class RuleEvaluationGate {
  private readonly lastEvaluatedAnchorMs = new Map<string, number>();

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
    return verdict;
  }

  /** Forget a rule's last-evaluated anchor, e.g. when it is edited or disarmed. */
  forget(ruleId: string): void {
    this.lastEvaluatedAnchorMs.delete(ruleId);
  }
}

export const ruleEvaluationGate = new RuleEvaluationGate();
