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

import { logger } from "../logger";

/**
 * FEAT-0399 — provenance for rules that came from legacy alerts.
 *
 * A migrated rule and a hand-authored one both carry
 * `provenance.source: human`, because a human armed both. That makes an
 * orphaned rule — one whose alert the trader has since deleted — impossible
 * to tell apart from a rule they authored on purpose. This ledger is the
 * missing evidence, and nothing more: it records *that* a rule id came from
 * an alert, and leaves what to do about it to the FEAT-0387 cutover.
 *
 * Class A: written and read on the device, never reported anywhere. Which
 * price levels someone watched is user data.
 */

export const RULE_ORIGIN_STORAGE_KEY = "cachy_rule_origin_v1";

/**
 * Versioned independently of the rule schema. A rule-schema migration has no
 * bearing on the shape of this bookkeeping, and coupling the two would force
 * a bump here every time `SchemaVersion::CURRENT` moves.
 */
export const RULE_ORIGIN_SCHEMA_VERSION = 1;

export interface RuleOriginEntry {
  /**
   * The alert this rule was converted from. Recorded even though
   * `rule_from_alert` currently reuses the alert's id as the rule id
   * (`legacy.rs`: `id: alert.id.clone()`) — the ledger states the
   * relationship rather than depending on that equality holding forever.
   */
  alertId: string;
  migratedAtMs: number;
  /**
   * Set when the entry was reconstructed for a rule migrated before this
   * ledger existed. `migratedAtMs` is then the run that noticed it, not the
   * run that converted it — an upper bound, not the real time. Recorded
   * explicitly so a later reader is never misled into treating an
   * approximation as a measurement.
   */
  backfilled?: true;
}

export interface RuleOriginLedger {
  schema_version: number;
  entries: Record<string, RuleOriginEntry>;
}

export function emptyLedger(): RuleOriginLedger {
  return { schema_version: RULE_ORIGIN_SCHEMA_VERSION, entries: {} };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntry(value: unknown): RuleOriginEntry | undefined {
  if (!isPlainObject(value)) return undefined;
  const { alertId, migratedAtMs, backfilled } = value;
  if (typeof alertId !== "string" || alertId === "") return undefined;
  if (typeof migratedAtMs !== "number" || !Number.isFinite(migratedAtMs)) return undefined;
  return backfilled === true
    ? { alertId, migratedAtMs, backfilled: true }
    : { alertId, migratedAtMs };
}

/**
 * Reads the ledger, keeping every entry that survives validation.
 *
 * A single corrupt entry does not discard the rest: each surviving entry is
 * still the only proof that its rule came from an alert, and dropping the
 * whole file over one bad row would silently turn every other migrated rule
 * into an apparently hand-authored one. A structurally unusable file (not an
 * object, unreadable JSON) is treated as empty and rebuilt.
 */
export function readRuleOriginLedger(): RuleOriginLedger {
  try {
    const raw = localStorage.getItem(RULE_ORIGIN_STORAGE_KEY);
    if (!raw) return emptyLedger();

    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || !isPlainObject(parsed.entries)) {
      logger.error(
        "alerts",
        `Discarding unusable ${RULE_ORIGIN_STORAGE_KEY}: expected an object with an 'entries' object`,
      );
      return emptyLedger();
    }

    const entries: Record<string, RuleOriginEntry> = {};
    let skipped = 0;
    for (const [ruleId, value] of Object.entries(parsed.entries)) {
      const entry = parseEntry(value);
      if (entry === undefined) {
        skipped += 1;
        continue;
      }
      entries[ruleId] = entry;
    }
    if (skipped > 0) {
      logger.error("alerts", `Skipped ${skipped} malformed entr(ies) in ${RULE_ORIGIN_STORAGE_KEY}`);
    }

    const version =
      typeof parsed.schema_version === "number" ? parsed.schema_version : RULE_ORIGIN_SCHEMA_VERSION;
    return { schema_version: version, entries };
  } catch (e) {
    logger.error("alerts", `Failed to read ${RULE_ORIGIN_STORAGE_KEY}; treating it as empty`, e);
    return emptyLedger();
  }
}

/**
 * Append-only merge. An existing entry is never rewritten, because that entry
 * is the orphan record: once its alert is gone, the entry is the only thing
 * that still says the rule was migrated rather than authored. Returns a new
 * ledger (immutability rule) and leaves the caller's original untouched.
 */
export function withRecordedOrigins(
  ledger: RuleOriginLedger,
  records: ReadonlyArray<{ ruleId: string; entry: RuleOriginEntry }>,
): { ledger: RuleOriginLedger; added: number } {
  let added = 0;
  const entries = { ...ledger.entries };

  for (const { ruleId, entry } of records) {
    if (ruleId === "" || Object.prototype.hasOwnProperty.call(entries, ruleId)) continue;
    entries[ruleId] = entry;
    added += 1;
  }

  return {
    ledger: { schema_version: ledger.schema_version, entries },
    added,
  };
}

/**
 * Persists the ledger. Never throws: a ledger that cannot be written is a
 * loss of bookkeeping, and must not cost the trader the migration it
 * accompanies. Returns whether the write landed.
 */
export function writeRuleOriginLedger(ledger: RuleOriginLedger): boolean {
  try {
    localStorage.setItem(RULE_ORIGIN_STORAGE_KEY, JSON.stringify(ledger));
    return true;
  } catch (e) {
    logger.error("alerts", `Failed to persist ${RULE_ORIGIN_STORAGE_KEY}`, e);
    return false;
  }
}
