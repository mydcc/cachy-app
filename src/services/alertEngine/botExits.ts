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
 * FEAT-0810 — turning an exit firing into a close, or a refusal that says why.
 *
 * The money-path module of the bot epic, and it behaves like one: every path
 * out either closes through the same lane a manual close takes or names the
 * reason it did not, once per rule per reason. No privileged path, no
 * broadened permissions — the gate, the step-size rule and the venue's own
 * guards all see exactly what a trader's close button produces.
 *
 * The same discipline `botOrders.ts` established: a service may not import a
 * store, so everything stateful arrives as a port and the store layer
 * (`alerts.svelte.ts`) assembles the environment. This module imports types
 * and nothing else from the engine — it stays a leaf the ratchet can see.
 */

import { Decimal } from "decimal.js";

import { logger } from "../logger";
import type { BotExitFiring, OwnedBotPosition } from "./ruleEvaluationLoop";

/** Why a bot's exit did not close. Developer-facing English. */
export type BotExitRefusal =
  | "paper-trading-off"
  | "no-exits"
  | "level-not-supported"
  | "position-gone"
  | "size-not-positive"
  | "close-in-flight"
  | "close-refused";

/** The close lane's parameters, as `TradeService.closePosition` spells them. */
export interface BotCloseParams {
  symbol: string;
  positionSide: "long" | "short";
  /** Present exactly for a partial close: the Decimal quantity to reduce by. */
  amount?: Decimal;
  /** Present exactly for a full close: the lane re-reads the size itself. */
  forceFullClose?: boolean;
}

/**
 * The store reads this module needs, as ports rather than imports — see
 * `botOrders.ts` for the boundary's reasons. Required, not defaulted.
 */
export interface BotExitEnvironment {
  paperEnabled: () => boolean;
  /**
   * Closes through the single-close lane a manual close takes. The lane owns
   * `reduceOnly`, the gate, the step-size rule and the venue's guards — this
   * module never builds an order itself, because a bot that could would be a
   * second, privileged close path the gate has never seen.
   */
  close: (params: BotCloseParams) => Promise<unknown>;
  /**
   * The owned position, re-read at exit time. The firing is a snapshot of
   * what the book said at evaluation; between evaluation and here the trader
   * may have closed by hand, the stop may have fired, the position may have
   * been partially reduced — the book is the owner of record, and it gets
   * the last word.
   */
  ownedPosition: (ruleId: string, positionId: string) => OwnedBotPosition | undefined;
  /**
   * FEAT-0812 — reports a close that actually went through, so the journal
   * can record that the bot ended this trade.
   *
   * Required rather than optional, and called only on success. Optional would
   * make a forgotten wiring silent, and the symptom would be a track record
   * that quietly credits every bot exit to the trader. Called on an attempt,
   * a refused close would label the trader's own later close as the bot's.
   */
  recordBotExit: (positionId: string) => void;
}

/**
 * How much of the position one firing closes, in Decimal — the money
 * discipline the epic runs on. `all` closes everything (the lane re-reads
 * the size); `partial` is the document's own fraction of what the book
 * holds now, never of what the rule's entry size was.
 */
export function closeAmountFor(firing: BotExitFiring, amount: string): Decimal | undefined {
  if (firing.close !== "partial") return new Decimal(amount);
  // A partial without a fraction has no size to close: `undefined` is the
  // honest answer, and `submitBotExit` refuses it rather than defaulting to
  // the full amount — a malformed document must fail closed, not escalate.
  if (firing.fraction === undefined) return undefined;
  return new Decimal(firing.fraction).times(new Decimal(amount));
}

/**
 * Turns one exit firing into a close, or says why it could not.
 *
 * Returns the refusal rather than throwing it, for the same reason
 * `submitBotOrder` does: the caller is a sink on the market hot path, and
 * one bot's close must not cost every other rule its evaluation.
 */
export async function submitBotExit(
  firing: BotExitFiring,
  env: BotExitEnvironment,
): Promise<BotExitRefusal | null> {
  if (!env.paperEnabled()) return "paper-trading-off";

  // The loop only fires what the document carries; a firing without either
  // is a wiring bug, and it gets its own reason instead of borrowing
  // another one — a refusal that names the wrong cause sends whoever reads
  // the log looking for a position that was never the problem.
  if ((firing.rule.exits?.length ?? 0) === 0 && firing.rule.take_profit === undefined) {
    return "no-exits";
  }
  if (firing.rule.action.consequence_level === "notify") return "level-not-supported";

  const position = env.ownedPosition(firing.rule.id, firing.positionId);
  if (position === undefined) {
    // Not a refusal worth reporting as one: a manual close and a stop-out
    // both end the exit story this way, and the spec is explicit that the
    // bot observes "no owned position" and evaluates nothing further. The
    // caller's once-per-reason filter keeps the log quiet for the steady
    // state where the anchor map simply has not caught up yet.
    return "position-gone";
  }

  const amount = closeAmountFor(firing, position.amount);
  // `undefined` is a partial with no fraction: the validator makes the
  // combination unreachable, but a malformed document must not escalate a
  // partial into a full close by defaulting — an unmeasurable size is
  // refused, the position stays open (fail closed, BUG-0509's discipline).
  if (amount === undefined || !amount.isFinite() || amount.lte(0)) return "size-not-positive";

  try {
    await env.close(
      firing.close === "partial"
        ? { symbol: firing.symbol, positionSide: position.side, amount }
        : { symbol: firing.symbol, positionSide: position.side, forceFullClose: true },
    );
  } catch (e) {
    // The close lane throws its own (translation-key) errors — gate
    // refusals, stale sizes, venue rejections. The refusal the trader sees
    // is this one reason; the underlying error goes to the log, where its
    // key names the actual cause. The position stays open, which is the
    // safe direction: a close that did not happen is a trade that still
    // exists, and the next anchor will try again.
    logger.error(
      "alerts",
      `[BotExits] Close refused for rule ${firing.rule.id} on ${firing.symbol}`,
      e,
    );
    return "close-refused";
  }

  // FEAT-0812 — the close went through, so the journal gets the one fact it
  // cannot derive: this exit was the bot's, not the trader's. After the await
  // on purpose; a refusal above returns before reaching this line.
  env.recordBotExit(firing.positionId);

  return null;
}

/**
 * The default refusal sink: the log, and nobody else. The wiring replaces it
 * with one that also toasts, exactly like the entry path's `logRefusal`.
 */
export const logExitRefusal = (firing: BotExitFiring, refusal: BotExitRefusal): void => {
  logger.warn(
    "alerts",
    `[BotExits] Rule ${firing.rule.id} (${firing.rule.name}) exit refused: ${refusal}`,
  );
};

/**
 * Wraps the exit sink so a firing also closes — the sibling of
 * `withBotOrders`, on the other side of the trade.
 *
 * `reported` keeps each reason to one message per rule, per the spec's "a
 * refusal surfaces once per rule/reason and leaves the position open". A
 * bot refused on every close of a 1m series would otherwise produce a toast
 * a minute, and a warning that arrives that often is one a trader learns
 * to dismiss without reading.
 *
 * The in-flight guard is keyed by rule *and* position: one close at a time
 * per owned position. The anchor ledger already bounds re-entrancy across
 * anchors; this bounds it within one — two exits of the same bot on the
 * same position cannot both be traveling when only one can be the last to
 * reduce it.
 *
 * `onInFlight` receives the whole snapshot after every change, so the
 * lifecycle projection (`botsState.closing`, reserved since FEAT-0807) can
 * show the closing state without this module importing a store.
 */
export function withBotExits(
  env: BotExitEnvironment,
  onRefusal: (firing: BotExitFiring, refusal: BotExitRefusal) => void = logExitRefusal,
  onInFlight?: (ids: ReadonlySet<string>) => void,
): (firing: BotExitFiring) => void {
  // The guard is keyed by rule *and* position: one close at a time per
  // owned position, so two exits of the same bot on the same position
  // cannot both be traveling when only one can be the last to reduce it.
  const inFlight = new Set<string>();
  // The projection's vocabulary is the rule id — `botsState.closing` asks
  // "which bots are closing", not "which positions are being reduced". A
  // parallel set keeps the translation here, where the guard owns both
  // keys, rather than in every listener.
  const closingRules = new Set<string>();
  const reported = new Set<string>();
  onInFlight?.(closingRules);

  const report = (firing: BotExitFiring, refusal: BotExitRefusal): void => {
    // Per rule and reason, not per position: the trader armed one bot and
    // one refusal explains it, whichever of its positions produced it.
    const key = `${firing.rule.id}:${refusal}`;
    if (reported.has(key)) return;
    reported.add(key);
    onRefusal(firing, refusal);
  };

  return (firing) => {
    const guardKey = `${firing.rule.id}|${firing.positionId}`;
    if (inFlight.has(guardKey)) {
      report(firing, "close-in-flight");
      return;
    }

    inFlight.add(guardKey);
    closingRules.add(firing.rule.id);
    onInFlight?.(closingRules);

    void submitBotExit(firing, env)
      .then((refusal) => {
        if (refusal !== null) report(firing, refusal);
      })
      .catch((e) => {
        // `submitBotExit` returns refusals rather than throwing, so this is
        // a bug in the refusal path itself — named as such, never swallowed.
        logger.error("alerts", `[BotExits] Exit submission crashed for ${firing.rule.id}`, e);
      })
      .finally(() => {
        inFlight.delete(guardKey);
        // A second owned position still closing keeps the rule in the
        // closing state; the snapshot names what is true now.
        if (![...inFlight].some((key) => key.startsWith(`${firing.rule.id}|`))) {
          closingRules.delete(firing.rule.id);
        }
        try {
          onInFlight?.(closingRules);
        } catch (e) {
          // The notify sits after the release, so an observer that throws
          // must not turn a settled submission into an unhandled rejection
          // — the guard is already released, which is the state the throw
          // would otherwise have masked.
          logger.error("alerts", `[BotExits] In-flight observer failed for ${firing.rule.id}`, e);
        }
      });
  };
}
