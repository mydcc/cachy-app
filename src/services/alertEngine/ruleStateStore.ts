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
 * FEAT-0440 — what each rule has already done, kept next to the sink that does it.
 *
 * `RuleState` is deliberately not a field of `RuleDocument`: the document is
 * the strategy, and the strategy's content hash must not move because an alarm
 * went off (FEAT-0393). So fire state lives in its own key, addressed by rule
 * id, and is handed to the core as `EvaluationContext.state` — the one place
 * `evaluate_with_lifecycle` reads frequency and expiry from.
 *
 * Class A (ADR-0001). Which alarms a trader armed and when they went off is
 * strategy; it never leaves the device, not as telemetry and not as a crash
 * report.
 */

import { browser } from "$app/env";
import type { BotAnchorSnapshot, RuleState } from "../../lib/rules/types";
import { localDayKey } from "./botGuards";
import { logger } from "../logger";
import { safeLocalStorage } from "../../utils/storageWrapper";

export const RULE_STATE_STORAGE_KEY = "cachy_rule_state_v1";

/** `ruleId` → what that rule has already done. */
export type RuleStateMap = Record<string, RuleState>;

/**
 * Never-fired, and the reason it is a shared frozen constant.
 *
 * The core reads an absent `state` as "never fired", which keeps a caller that
 * does not track state announcing rather than silently muted. Returning this
 * instead of `undefined` means callers do not each have to re-derive that
 * default, and freezing it means a caller that mutates what it was handed
 * corrupts nothing — this module owns the value.
 */
export const NEVER_FIRED: RuleState = Object.freeze({ fired_count: 0, last_fired_anchor_ms: null });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * One stored entry, with anything unrecognised dropped.
 *
 * A stored blob is user-writable — it is localStorage — so this validates at
 * the boundary rather than casting. A corrupt entry reads as never-fired,
 * which errs towards announcing: the failure mode of a wrong `fired_count` is
 * an alarm the trader never hears, and that is the worse of the two.
 */
function normalizeState(stored: unknown): RuleState {
  if (!isPlainObject(stored)) return { ...NEVER_FIRED };

  const count = stored.fired_count;
  const anchor = stored.last_fired_anchor_ms;

  const state: RuleState = {
    fired_count: typeof count === "number" && Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0,
    last_fired_anchor_ms: typeof anchor === "number" && Number.isFinite(anchor) ? anchor : null,
  };

  // BUG-0491 — sparse on purpose. Entries written before this fix carry none
  // of these keys, and they must keep reading exactly as before (the tests
  // below pin that shape with `toEqual`). A corrupt anchor reads as absent —
  // never-evaluated errs towards evaluating, the loud direction.
  const evaluated = asAnchorMs(stored.last_evaluated_anchor_ms);
  const intrabar = asAnchorMs(stored.last_intrabar_anchor_ms);
  const intrabarFired = asAnchorMs(stored.last_intrabar_fired_anchor_ms);
  if (evaluated !== null) state.last_evaluated_anchor_ms = evaluated;
  if (intrabar !== null) state.last_intrabar_anchor_ms = intrabar;
  if (intrabarFired !== null) state.last_intrabar_fired_anchor_ms = intrabarFired;

  // FEAT-0810 — the exit action ledger. Sparse for the same reason as the
  // anchors above: entries written before this field carry none and must
  // keep reading exactly as before. A corrupt entry reads as absent, which
  // errs towards acting — but the window that consults it also re-reads the
  // position, so an orphaned anchor can at worst mute an exit for a
  // position that no longer exists.
  const exitAnchors = asExitAnchors(stored.last_exit_action_anchors);
  if (exitAnchors !== undefined) state.last_exit_action_anchors = exitAnchors;

  // FEAT-0822 — the entry activity. Sparse for the same reason; a corrupt
  // activity reads as absent, which errs towards acting: the cost of a lost
  // count is one entry the document's own limits then bound.
  const activity = asBotEntries(stored.bot_entries);
  if (activity !== undefined) state.bot_entries = activity;
  return state;
}

/** A finite anchor instant, or absent. Non-finite is corrupt, not zero. */
function asAnchorMs(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The stored exit action ledger, or absent when it is not a plain object of
 * finite anchors. Tolerant per entry: one corrupt positionId is dropped, not
 * the whole ledger — the other positions' idempotency must survive one bad
 * row.
 */
function asExitAnchors(value: unknown): Record<string, number> | undefined {
  if (!isPlainObject(value)) return undefined;
  const anchors: Record<string, number> = {};
  let any = false;
  for (const [positionId, anchor] of Object.entries(value)) {
    if (typeof anchor !== "number" || !Number.isFinite(anchor)) continue;
    anchors[positionId] = anchor;
    any = true;
  }
  return any ? anchors : undefined;
}

/**
 * FEAT-0822 — one stored entry activity, or absent. A corrupt activity reads
 * as absent rather than half-kept: a count that cannot be trusted must not
 * quietly pretend to be zero either, and absent errs towards acting.
 */
function asBotEntries(
  value: unknown,
): { total: number; day: string; today: number } | undefined {
  if (!isPlainObject(value)) return undefined;
  const total = value.total;
  const today = value.today;
  const day = value.day;
  if (
    typeof total !== "number" ||
    !Number.isFinite(total) ||
    total < 0 ||
    typeof today !== "number" ||
    !Number.isFinite(today) ||
    today < 0 ||
    typeof day !== "string"
  ) {
    return undefined;
  }
  return { total: Math.floor(total), day, today: Math.floor(today) };
}

/** The stored gate anchors as the persistence port carries them. */
function snapshotOf(state: RuleState): BotAnchorSnapshot {
  return {
    evaluatedAnchorMs: asAnchorMs(state.last_evaluated_anchor_ms),
    intrabarAnchorMs: asAnchorMs(state.last_intrabar_anchor_ms),
    intrabarFiredAnchorMs: asAnchorMs(state.last_intrabar_fired_anchor_ms),
  };
}

/** Everything the store knows, normalised. Empty when unreadable. */
export function readRuleStates(): RuleStateMap {
  if (!browser) return {};

  try {
    const raw = safeLocalStorage.getItem(RULE_STATE_STORAGE_KEY);
    if (raw === null) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return {};

    const result: RuleStateMap = {};
    for (const [ruleId, entry] of Object.entries(parsed)) {
      result[ruleId] = normalizeState(entry);
    }
    return result;
  } catch (e) {
    logger.error("alerts", "[RuleState] Reading fire state failed", e);
    return {};
  }
}

/**
 * One rule's state, or never-fired.
 *
 * This is the reader the evaluation loop is configured with. It re-reads
 * storage per call for the same reason `readStoredRules` does: a cache here
 * would have to be invalidated from every place that can fire, edit or delete
 * a rule, and a stale `fired_count` mutes an alarm.
 */
export function readRuleState(ruleId: string): RuleState {
  const state = readRuleStates()[ruleId];
  return state ?? { ...NEVER_FIRED };
}

function writeRuleStates(states: RuleStateMap): boolean {
  try {
    return safeLocalStorage.setItem(RULE_STATE_STORAGE_KEY, JSON.stringify(states));
  } catch (e) {
    logger.error("alerts", "[RuleState] Persisting fire state failed", e);
    return false;
  }
}

/**
 * Counts one announcement against `ruleId` and returns the state after it.
 *
 * `anchorMs` is the trigger candle's open instant, not the wall clock: it is
 * what `TriggerFrequency::OncePerCandleClose` compares against, and a wall
 * clock would make the same candle answer differently depending on how long
 * the tab had been open.
 *
 * Returns the new state even when persisting failed, so the caller's disarm
 * decision does not silently depend on whether localStorage was full. A write
 * that failed means the rule will announce again on the next close — loud, and
 * the right direction for an alarm.
 */
export function recordRuleFiring(ruleId: string, anchorMs: number): RuleState {
  const states = browser ? readRuleStates() : {};
  const previous = states[ruleId] ?? NEVER_FIRED;
  const next: RuleState = {
    fired_count: (previous.fired_count ?? 0) + 1,
    last_fired_anchor_ms: anchorMs,
    // FEAT-0810 — a firing must not erase the exit ledger either: a bot
    // that fired and then exits reads its anchors back after this write.
    ...(previous.last_exit_action_anchors !== undefined
        ? { last_exit_action_anchors: previous.last_exit_action_anchors }
        : {}),
    // FEAT-0822 — nor the entry activity: the firing path announces, the
    // submit path counts entries, and neither may cost the other its half.
    ...(previous.bot_entries !== undefined ? { bot_entries: previous.bot_entries } : {}),
  };

  if (browser) {
    states[ruleId] = next;
    writeRuleStates(states);
  }
  return next;
}

/**
 * FEAT-0822 — the entries this bot has landed, durable.
 *
 * Zeros on absent or unreadable, which errs towards acting: the failure
 * mode of a lost count is an entry the document's own limits then bound,
 * not a bot that silently stops.
 */
export function botEntryActivity(ruleId: string): { total: number; day: string; today: number } {
  try {
    const activity = readRuleStates()[ruleId]?.bot_entries;
    if (activity === undefined) return { total: 0, day: "", today: 0 };
    // The day reset is the reader's to answer, not only the writer's: the
    // writer that would stamp a new day is the submission the spent cap
    // refuses, so a reader that returned the stored `today` verbatim would
    // keep a yesterday-spent cap refusing forever after local midnight.
    // `total` is day-less and stays; `today` answers the day it is.
    return activity.day === localDayKey()
      ? activity
      : { ...activity, today: 0 };
  } catch {
    return { total: 0, day: "", today: 0 };
  }
}

/**
 * FEAT-0822 — counts one landed entry against `ruleId`.
 *
 * Called from the submit path when a placement has actually opened a row —
 * never for a firing that submitted nothing, because the `once` policy and
 * the day cap count entries, not attempts.
 *
 * Read-modify-write with a full spread, like the exit anchor's writer: this
 * function owns exactly one field, and the narrow-carry discipline belongs
 * to the writers that deliberately drop fields (`saveBotAnchors`), not to
 * this one. Never throws — a persistence hiccup must not take down the
 * submission that just succeeded; the cost of a lost count is one entry
 * the document's own limits then bound.
 */
export function recordBotEntry(ruleId: string): void {
  if (!browser) return;
  try {
    const states = readRuleStates();
    const previous = states[ruleId] ?? { ...NEVER_FIRED };
    const today = localDayKey();
    const carried = previous.bot_entries;
    const next = {
      total: (carried?.total ?? 0) + 1,
      day: today,
      today: carried !== undefined && carried.day === today ? carried.today + 1 : 1,
    };
    states[ruleId] = { ...previous, bot_entries: next };
    writeRuleStates(states);
  } catch (e) {
    logger.error("alerts", `[RuleState] Recording entry for ${ruleId} failed`, e);
  }
}

/**
 * FEAT-0810 — records that a rule's exit acted on one position at an anchor.
 *
 * The durable half of the exit window's idempotency. Written before the
 * sink runs, so a sink that throws cannot erase the ledger entry — a retry
 * over the same anchor reads the record and stays quiet instead of closing
 * twice.
 *
 * Read-modify-write with a spread, unlike `recordRuleFiring`'s replacement:
 * a firing is a whole-entry event (the gate re-saves its own anchors after),
 * while an exit action is one position's fact and must not cost the rule its
 * fire count or its gate anchors.
 *
 * Never throws, for the same reason as `saveBotAnchors`: a persistence hiccup
 * must not take down the evaluation that just succeeded. The cost of a lost
 * write is one repeat action attempt, which the close path's own guards
 * (position re-read, in-flight) bound.
 */
export function recordExitActionAnchor(ruleId: string, positionId: string, anchorMs: number): void {
  if (!browser) return;
  try {
    const states = readRuleStates();
    const previous = states[ruleId] ?? NEVER_FIRED;
    states[ruleId] = {
      ...previous,
      last_exit_action_anchors: {
        ...(previous.last_exit_action_anchors ?? {}),
        [positionId]: anchorMs,
      },
    };
    writeRuleStates(states);
  } catch (e) {
    logger.error("alerts", `[RuleState] Recording exit action for ${ruleId} failed`, e);
  }
}

/**
 * FEAT-0810 — the anchor at which this rule's exit last acted on this
 * position, or `null` when it never did (or the ledger could not be read).
 *
 * Null errs towards acting, the loud direction — and the window that
 * consults it re-reads the position anyway, so a stale anchor can only mute
 * an exit for a position that no longer exists.
 */
export function exitActionAnchorFor(ruleId: string, positionId: string): number | null {
  if (!browser) return null;
  try {
    const anchor = readRuleStates()[ruleId]?.last_exit_action_anchors?.[positionId];
    return typeof anchor === "number" && Number.isFinite(anchor) ? anchor : null;
  } catch {
    return null;
  }
}

/**
 * BUG-0491 — one bot's durable gate anchors, or `undefined` when the entry
 * carries none.
 *
 * This is the gate persistence port's `load`: the gate seeds its in-memory
 * maps from it on first sight of a rule (lazy hydration), so a reload finds
 * the same anchors the pre-reload session decided. All-absent reads as
 * "never evaluated" — the loud direction.
 */
export function readBotAnchors(ruleId: string): BotAnchorSnapshot | undefined {
  if (!browser) return undefined;

  const state = readRuleStates()[ruleId];
  if (!state) return undefined;

  const snapshot = snapshotOf(state);
  if (
    snapshot.evaluatedAnchorMs === null &&
    snapshot.intrabarAnchorMs === null &&
    snapshot.intrabarFiredAnchorMs === null
  ) {
    return undefined;
  }
  return snapshot;
}

/**
 * BUG-0491 — records that a bot's gate decided `snapshot`'s anchors.
 *
 * Called after every successful bot evaluation, whatever the verdict was: a
 * `does_not_fire` is a decision too, and re-deciding it after a reload is the
 * same defect as re-firing. Skips the write when nothing changed, so a caller
 * that saves defensively does not churn storage.
 *
 * Never throws: every path through `readRuleStates`/`writeRuleStates` already
 * contains its own failure, and a persistence hiccup must not take down the
 * evaluation that just succeeded — the in-memory maps stay the truth for this
 * session either way.
 */
export function saveBotAnchors(ruleId: string, snapshot: BotAnchorSnapshot): void {
  if (!browser) return;

  const states = readRuleStates();
  const previous = states[ruleId] ?? { ...NEVER_FIRED };
  if (snapshotsEqual(snapshotOf(previous), snapshot)) return;

  const next: RuleState = {
    fired_count: previous.fired_count ?? 0,
    last_fired_anchor_ms: asAnchorMs(previous.last_fired_anchor_ms),
    // FEAT-0810 — this writer knows nothing about the exit ledger, so it
    // must not erase it: the anchors a bot's exits acted on survive every
    // anchor save. A full `...previous` spread would be broader, but it
    // would also keep gate-anchor fields this snapshot deliberately deletes
    // with `null` above — carrying exactly the one field this function
    // does not own is the narrow shape that keeps both promises.
    ...(previous.last_exit_action_anchors !== undefined
        ? { last_exit_action_anchors: previous.last_exit_action_anchors }
        : {}),
    // FEAT-0822 — same narrow carry for the entry activity.
    ...(previous.bot_entries !== undefined ? { bot_entries: previous.bot_entries } : {}),
  };
  // Mirrored exactly, sparsely: a `null` deletes the key rather than writing
  // one, so entries keep the pre-fix shape whenever they carry no anchors.
  if (snapshot.evaluatedAnchorMs !== null) next.last_evaluated_anchor_ms = snapshot.evaluatedAnchorMs;
  if (snapshot.intrabarAnchorMs !== null) next.last_intrabar_anchor_ms = snapshot.intrabarAnchorMs;
  if (snapshot.intrabarFiredAnchorMs !== null) {
    next.last_intrabar_fired_anchor_ms = snapshot.intrabarFiredAnchorMs;
  }
  states[ruleId] = next;
  writeRuleStates(states);
}

function snapshotsEqual(a: BotAnchorSnapshot, b: BotAnchorSnapshot): boolean {
  return (
    a.evaluatedAnchorMs === b.evaluatedAnchorMs &&
    a.intrabarAnchorMs === b.intrabarAnchorMs &&
    a.intrabarFiredAnchorMs === b.intrabarFiredAnchorMs
  );
}

/**
 * BUG-0491 — drops a rule's gate anchors and keeps its fire count.
 *
 * Called from the gate's `forget` (the rule was edited or disarmed and must
 * be decidable again). Unlike `clearRuleState` this must not reset
 * `fired_count`: forgetting anchors re-arms the dedupe, forgetting the count
 * would re-arm a spent `once` rule. A rule carrying no anchors is a no-op
 * without a write, so forgetting a `notify` rule changes nothing at all.
 */
export function clearBotAnchors(ruleId: string): void {
  if (!browser) return;

  const states = readRuleStates();
  const entry = states[ruleId];
  if (!entry) return;
  if (
    entry.last_evaluated_anchor_ms == null &&
    entry.last_intrabar_anchor_ms == null &&
    entry.last_intrabar_fired_anchor_ms == null
  ) {
    return;
  }

  delete entry.last_evaluated_anchor_ms;
  delete entry.last_intrabar_anchor_ms;
  delete entry.last_intrabar_fired_anchor_ms;
  writeRuleStates(states);
}
/** Forgets one rule's fire state — it was deleted, or the trader re-armed it. */
export function clearRuleState(ruleId: string): void {

  if (!browser) return;

  // Deliberate whole-entry drop, and the one caller that reaches it is the
  // alert panel's re-arm of a rule that was disarmed by its own firing
  // (FEAT-0747's history path). A trader pressing Arm there is asking for
  // the rule *fresh* — fire state, and with it every derived counter, gone:
  // for a bot that includes `bot_entries`, so a re-arm resets the day cap
  // and the `once` policy's expiry. That is re-arm semantics, not an
  // accident: a bot the trader wants to keep bounded keeps its counters by
  // NOT being re-armed through this path (pause/resume writes `enabled`
  // only and never comes here).
  const states = readRuleStates();
  if (!(ruleId in states)) return;

  delete states[ruleId];
  writeRuleStates(states);
}

/**
 * Drops state for rules that no longer exist.
 *
 * Without this the map grows for the life of the installation: a rule deleted
 * from `cachy_rules_v1` leaves its counter behind, and a later rule reusing the
 * id — a re-import, a restored backup — would start life already spent.
 */
export function pruneRuleStates(knownRuleIds: Iterable<string>): void {
  if (!browser) return;

  const known = new Set(knownRuleIds);
  const states = readRuleStates();

  let changed = false;
  for (const ruleId of Object.keys(states)) {
    if (known.has(ruleId)) continue;
    delete states[ruleId];
    changed = true;
  }
  if (changed) writeRuleStates(states);
}
