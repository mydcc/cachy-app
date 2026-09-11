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
import type { RuleState } from "../../lib/rules/types";
import { logger } from "../logger";

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

  return {
    fired_count: typeof count === "number" && Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0,
    last_fired_anchor_ms: typeof anchor === "number" && Number.isFinite(anchor) ? anchor : null,
  };
}

/** Everything the store knows, normalised. Empty when unreadable. */
export function readRuleStates(): RuleStateMap {
  if (!browser) return {};

  try {
    const raw = localStorage.getItem(RULE_STATE_STORAGE_KEY);
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
    localStorage.setItem(RULE_STATE_STORAGE_KEY, JSON.stringify(states));
    return true;
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
