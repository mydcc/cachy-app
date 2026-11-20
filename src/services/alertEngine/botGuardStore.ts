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
 * FEAT-0822 — the guard log, durable and bounded.
 *
 * Every suppressed or refused action lands here with its reason, so
 * "why did my bot not fire?" has an answer that survives a reload. The same
 * reason repeating on the newest row updates its count instead of
 * appending — "the suppressed repeat appears once in the guard log" is the
 * acceptance criterion, and a per-candle flood is the failure it stops.
 *
 * Never throws, in either direction: an unreadable ledger reads as empty
 * (a view must degrade, not take a tab down), and a failed write is logged
 * and skipped (a persistence hiccup must not take down the evaluation that
 * is about to happen anyway). An unreadable ledger is diagnostic history,
 * not money-path state, so the next write re-seeds it rather than refusing
 * forever — documented here because the rule-store writer holds itself to
 * the stricter "may not clobber" line, and this one deliberately does not.
 */

import { browser } from "$app/env";
import type { TranslationKey } from "../../locales/schema";
import { logger } from "../logger";

export const BOT_GUARD_STORAGE_KEY = "cachy_bot_guards_v1";

/**
 * The guard reasons, in a row's register: the toast keys say who fired and
 * what it refused to place, but a row already names the bot, so these say
 * only the bound itself. One map, shared by every surface that renders a
 * guard reason, so the sidebar row and the control center can never
 * disagree about a word.
 */
export const BOT_GUARD_REASON_KEYS: Record<string, TranslationKey> = {
    "slot-reserved": "botsList.guard.slotReserved",
    "policy-once": "botsList.guard.policyOnce",
    "limit-entries-day": "botsList.guard.limitEntriesDay",
    "limit-positions": "botsList.guard.limitPositions",
    "limit-risk": "botsList.guard.limitRisk",
    "limit-budget": "botsList.guard.limitBudget",
    "submission-in-flight": "botsList.guard.submissionInFlight",
    "position-already-open": "botsList.guard.positionAlreadyOpen",
    // FEAT-0823 — the confirmation discards: a signal the market refused is
    // an answer the same log exists to give.
    "confirmation-against-direction": "botsList.guard.confirmationAgainstDirection",
    "signal-stopped-out": "botsList.guard.signalStoppedOut",
    // FEAT-0814 — the trigger held and the rule's own veto refused it.
    vetoed: "botsList.guard.vetoed",
};

export const BOT_GUARD_SCHEMA_VERSION = 1;

/**
 * How many records one rule keeps. Oldest dropped first — a rule that hits
 * a limit on every candle would otherwise push its own older history out
 * within hours, and the oldest entries are exactly the ones a trader
 * debugging "when did this start?" needs first.
 */
export const BOT_GUARD_MAX_PER_RULE = 20;

/** One suppressed or refused action, counted while it repeats. */
export interface BotGuardRecord {
  reason: string;
  /** How often this reason fired since the record opened. */
  count: number;
  firstAtMs: number;
  lastAtMs: number;
  /** The candle the newest occurrence was anchored on, when one exists. */
  anchorMs?: number;
}

interface GuardLedger {
  schema_version: number;
  per_rule: Record<string, BotGuardRecord[]>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecord(value: unknown): value is BotGuardRecord {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.reason === "string" &&
    typeof value.count === "number" &&
    Number.isFinite(value.count) &&
    value.count >= 1 &&
    typeof value.firstAtMs === "number" &&
    Number.isFinite(value.firstAtMs) &&
    typeof value.lastAtMs === "number" &&
    Number.isFinite(value.lastAtMs)
  );
}

function emptyLedger(): GuardLedger {
  return { schema_version: BOT_GUARD_SCHEMA_VERSION, per_rule: {} };
}

/**
 * `localStorage` reached directly, not through `utils/storageWrapper`.
 *
 * Deliberate, and worth a line of why: the wrapper is a member of the
 * import-graph's frozen cycle, so a store-layer module importing it joins
 * that cycle (measured: the 0822 guard ledger grew it 196 → 197 and CI's
 * baseline guard refused the bump). Every access here is already inside the
 * try/catch discipline below — reads degrade to an empty ledger, writes
 * return false and log — so the wrapper's guarded access adds nothing this
 * module does not already do itself.
 */
function storage(): Storage | null {
  if (!browser) return null;
  try {
    return localStorage;
  } catch {
    // Security-context or quota errors surface on access, not on the call.
    return null;
  }
}

function readLedger(): GuardLedger {
  try {
    const raw = storage()?.getItem(BOT_GUARD_STORAGE_KEY) ?? null;
    if (raw === null) return emptyLedger();
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return emptyLedger();
    return parsed as unknown as GuardLedger;
  } catch {
    // A view must degrade, not throw — the log is a diagnostic surface.
    return emptyLedger();
  }
}

function writeLedger(ledger: GuardLedger): boolean {
  try {
    const s = storage();
    if (s === null) return false;
    s.setItem(BOT_GUARD_STORAGE_KEY, JSON.stringify(ledger));
    return true;
  } catch (e) {
    logger.error("alerts", "[BotGuards] Persisting the guard log failed", e);
    return false;
  }
}

/**
 * One rule's guard history, newest first. Corrupt records drop alone; an
 * unreadable ledger reads as no history.
 */
export function readBotGuards(ruleId: string): BotGuardRecord[] {
  if (!browser) return [];
  const ledger = readLedger();
  const rows = ledger.per_rule?.[ruleId];
  if (!Array.isArray(rows)) return [];
  // Stored oldest-first (append and trim from the front); the reader hands
  // back newest-first, because "why did my bot not just fire?" is a
  // question about the newest row first.
  return rows.filter(isRecord).reverse();
}

/**
 * Records one suppressed or refused action. The newest record with the
 * same reason counts it (`count`, `lastAtMs`, `anchorMs`) rather than
 * appending; a reason that repeats after another reason intervened opens a
 * fresh row, because the chronology is the log's whole value.
 */
export function recordBotGuard(ruleId: string, reason: string, anchorMs?: number): void {
  if (!browser) return;
  try {
    const ledger = readLedger();
    ledger.per_rule ??= {};
    // Corrupt rows drop alone, and the filtered array is what the rest of
    // this function works on — a filter into a local would push the new
    // record into a copy the ledger never sees.
    ledger.per_rule[ruleId] = (ledger.per_rule[ruleId] ?? []).filter(isRecord);
    const rows = ledger.per_rule[ruleId];

    const newest = rows.length > 0 ? rows[rows.length - 1] : undefined;
    const now = Date.now();
    if (newest !== undefined && newest.reason === reason) {
      newest.count += 1;
      newest.lastAtMs = now;
      if (anchorMs !== undefined) newest.anchorMs = anchorMs;
    } else {
      rows.push({
        reason,
        count: 1,
        firstAtMs: now,
        lastAtMs: now,
        ...(anchorMs !== undefined ? { anchorMs } : {}),
      });
      if (rows.length > BOT_GUARD_MAX_PER_RULE) {
        rows.splice(0, rows.length - BOT_GUARD_MAX_PER_RULE);
      }
    }

    writeLedger(ledger);
  } catch (e) {
    logger.error("alerts", `[BotGuards] Recording a guard event for ${ruleId} failed`, e);
  }
}

/**
 * Drops one rule's diagnostic history entirely.
 *
 * Called from `deleteBot`: the history is the *dead bot's* answer to "why
 * did my bot not act", and a rule id the trader reuses later must not
 * inherit it — the new bot's refusals are its own story. Never throws, for
 * the same reason the recorder never does: a diagnostic ledger must not
 * take down the deletion it rides along with.
 */
export function clearBotGuards(ruleId: string): void {
  if (!browser) return;
  try {
    const ledger = readLedger();
    if (ledger.per_rule === undefined || ledger.per_rule[ruleId] === undefined) {
      return;
    }
    delete ledger.per_rule[ruleId];
    writeLedger(ledger);
  } catch (e) {
    logger.error("alerts", `[BotGuards] Clearing guard history for ${ruleId} failed`, e);
  }
}
