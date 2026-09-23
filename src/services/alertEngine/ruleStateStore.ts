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

import { browser } from "$app/environment";
import type { BotAnchorSnapshot, RuleState } from "../../lib/rules/types";
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
  return state;
}

/** A finite anchor instant, or absent. Non-finite is corrupt, not zero. */
function asAnchorMs(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  };

  if (browser) {
    states[ruleId] = next;
    writeRuleStates(states);
  }
  return next;
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
