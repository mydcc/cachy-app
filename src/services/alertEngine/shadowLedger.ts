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
 * FEAT-0387 — the record the shadow period produces.
 *
 * The question the shadow run has to answer is not "does the evaluator work"
 * but "does close-driven evaluation agree with the per-tick path it replaces".
 * That is a question about *two* sequences, so both are written here: what the
 * legacy engine actually fired, and what the rule loop would have fired. A
 * ledger holding only the new path could show that it fires, never that it
 * fires the same things.
 *
 * The migration pins migrated rules to `1m` Close (FEAT-0388), so the expected
 * disagreements are known in advance and are exactly what this measures:
 * a legacy firing with a later shadow counterpart is the up-to-one-minute
 * delay; a legacy firing with no counterpart at all is a mid-candle
 * touch-and-recover that close evaluation does not see.
 *
 * Class A: `localStorage` only. Which levels a trader watches and when they
 * were hit is user data — it is never reported anywhere, not as telemetry and
 * not as a debug log (ADR-0001).
 */

import { browser } from "$app/environment";
import { logger } from "../logger";

export const SHADOW_LEDGER_STORAGE_KEY = "cachy_shadow_firings_v1";

export const SHADOW_LEDGER_SCHEMA_VERSION = 1;

/**
 * How many records are kept. Oldest are dropped first.
 *
 * Bounded because `localStorage` is: an unbounded append that grows until the
 * quota throws would take the trader's *alerts* down with it, since the same
 * storage holds them (BUG-0008 is the same shape of bug in a toast array).
 * 500 records is several weeks of ordinary alerting and a few hundred KB at
 * most.
 */
export const SHADOW_LEDGER_MAX_RECORDS = 500;

/**
 * Which path produced the record.
 *
 * `shadow` is a rule verdict that notified nobody, `rule` one that did. They
 * are kept apart rather than merged on cutover: a ledger spanning the switch
 * has to stay readable afterwards, and "would have fired" and "did fire" are
 * not the same event no matter how similar the row looks.
 */
export type FiringSource = "legacy" | "shadow" | "rule";

export interface ShadowFiringRecord {
  source: FiringSource;
  /** When this was written, epoch ms. Not when the candle closed. */
  recordedAtMs: number;
  symbol: string;
  /** Rule id for a shadow record, legacy alert id for a legacy one. */
  id: string;
  /** Shadow only: the trigger timeframe evaluated. */
  timeframe?: string;
  /**
   * Shadow only: open time of the closed candle the verdict was computed on.
   * This, not `recordedAtMs`, is what a legacy record's timestamp has to be
   * compared against — the delay being measured is candle-close versus tick.
   */
  anchorMs?: number;
  /** Shadow only: the verdict, kept verbatim so a refusal reason survives. */
  verdict?: string;
  /** Legacy only: the price that tripped the alert. */
  price?: string;
}

export interface ShadowLedger {
  schema_version: number;
  records: ShadowFiringRecord[];
}

export function emptyShadowLedger(): ShadowLedger {
  return { schema_version: SHADOW_LEDGER_SCHEMA_VERSION, records: [] };
}

function isRecord(value: unknown): value is ShadowFiringRecord {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<ShadowFiringRecord>;
  return (
    (candidate.source === "legacy" ||
      candidate.source === "shadow" ||
      candidate.source === "rule") &&
    typeof candidate.recordedAtMs === "number" &&
    typeof candidate.symbol === "string" &&
    typeof candidate.id === "string"
  );
}

/**
 * Reads the ledger, keeping every record that survives validation.
 *
 * A single corrupt record does not discard the rest — the value of this file
 * is the sequence, and one bad row is not a reason to lose a week of evidence.
 * A structurally unusable file is treated as empty and rebuilt.
 */
export function readShadowLedger(): ShadowLedger {
  if (!browser) return emptyShadowLedger();

  try {
    const raw = localStorage.getItem(SHADOW_LEDGER_STORAGE_KEY);
    if (raw === null) return emptyShadowLedger();

    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return emptyShadowLedger();

    const records = (parsed as Partial<ShadowLedger>).records;
    if (!Array.isArray(records)) return emptyShadowLedger();

    return {
      schema_version: SHADOW_LEDGER_SCHEMA_VERSION,
      records: records.filter(isRecord),
    };
  } catch (e) {
    logger.warn("alerts", "[Shadow] Ledger unreadable — starting a fresh one", e);
    return emptyShadowLedger();
  }
}

/**
 * Appends one record, dropping the oldest once the cap is reached.
 *
 * Never throws and never propagates a storage failure: this is measurement,
 * and measurement must not be able to break either alerting path it observes.
 * Returns whether the write landed, so a caller that cares can tell.
 */
export function recordFiring(record: ShadowFiringRecord): boolean {
  if (!browser) return false;

  try {
    const ledger = readShadowLedger();
    const records = [...ledger.records, record];
    const trimmed =
      records.length > SHADOW_LEDGER_MAX_RECORDS
        ? records.slice(records.length - SHADOW_LEDGER_MAX_RECORDS)
        : records;

    localStorage.setItem(
      SHADOW_LEDGER_STORAGE_KEY,
      JSON.stringify({ schema_version: SHADOW_LEDGER_SCHEMA_VERSION, records: trimmed }),
    );
    return true;
  } catch (e) {
    logger.warn("alerts", "[Shadow] Could not record a firing", e);
    return false;
  }
}

/** Empties the ledger — for a fresh measurement window. */
export function clearShadowLedger(): boolean {
  if (!browser) return false;

  try {
    localStorage.removeItem(SHADOW_LEDGER_STORAGE_KEY);
    return true;
  } catch (e) {
    logger.warn("alerts", "[Shadow] Could not clear the ledger", e);
    return false;
  }
}

export interface ShadowComparison {
  legacyCount: number;
  shadowCount: number;
  /** Legacy firings with no shadow record for the same symbol and id. */
  legacyOnly: ShadowFiringRecord[];
  /** Shadow firings with no legacy record for the same symbol and id. */
  shadowOnly: ShadowFiringRecord[];
  /**
   * Delays in ms between a legacy firing and its shadow counterpart, computed
   * against the shadow record's `anchorMs` where present.
   */
  delaysMs: number[];
}

/**
 * Pairs the two sequences so the cutover decision rests on counts, not on
 * scrolling a console.
 *
 * Matching is by `symbol` and `id` — the migration reuses the alert's id as
 * the rule id (`legacy.rs`), so the two sides share a key. A record on one
 * side with no partner on the other is the interesting case and is returned
 * whole rather than counted away.
 */
export function compareShadowLedger(ledger: ShadowLedger = readShadowLedger()): ShadowComparison {
  const legacy = ledger.records.filter((r) => r.source === "legacy");
  const shadow = ledger.records.filter((r) => r.source === "shadow");

  const keyOf = (r: ShadowFiringRecord) => `${r.symbol}:${r.id}`;
  const shadowByKey = new Map<string, ShadowFiringRecord>();
  for (const record of shadow) {
    if (!shadowByKey.has(keyOf(record))) shadowByKey.set(keyOf(record), record);
  }
  const legacyKeys = new Set(legacy.map(keyOf));

  const delaysMs: number[] = [];
  const legacyOnly: ShadowFiringRecord[] = [];
  for (const record of legacy) {
    const counterpart = shadowByKey.get(keyOf(record));
    if (counterpart === undefined) {
      legacyOnly.push(record);
      continue;
    }
    const shadowAt = counterpart.anchorMs ?? counterpart.recordedAtMs;
    delaysMs.push(shadowAt - record.recordedAtMs);
  }

  return {
    legacyCount: legacy.length,
    shadowCount: shadow.length,
    legacyOnly,
    shadowOnly: shadow.filter((r) => !legacyKeys.has(keyOf(r))),
    delaysMs,
  };
}
