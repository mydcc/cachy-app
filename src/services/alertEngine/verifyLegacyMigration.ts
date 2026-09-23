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
 * FEAT-0399 — proof, per device, that retiring the legacy alert path loses
 * nothing.
 *
 * `FEAT-0388` migrated `cachy_alerts_v1` into `cachy_rules_v1` and recorded
 * every alert id it converted in `cachy_alerts_migrated_v1`. FEAT-0399 then
 * deletes the legacy engine, store and creation form. Its third acceptance
 * criterion is the one that cannot be satisfied by reading a version number:
 *
 * > Every entry in `cachy_alerts_v1` is present in `cachy_alerts_migrated_v1`
 * > **on every edition** before the read/write path is deleted, *not merely
 * > assumed*.
 *
 * "Not merely assumed" is what this module is. It cannot be checked once, on
 * a maintainer's machine, because the data in question lives in each
 * trader's browser and nowhere else (Class A, ADR-0001) — there is no
 * telemetry that could answer it and there must not be. So the check runs
 * where the data is: on every start, right after the migration, on the
 * device that owns the alerts.
 *
 * What the deletion actually removes is the *code* that reads and writes
 * `cachy_alerts_v1`, not the key itself. So the hazard is never lost bytes —
 * it is a legacy alert that silently becomes unreachable: no rule evaluates
 * it, no panel lists it, and the trader keeps believing an alarm is armed.
 * That is precisely the set this module enumerates, and the reason the
 * migration itself must survive FEAT-0399 as the last remaining reader.
 */

import { browser } from "$app/environment";
import { logger } from "../logger";
import { ALERTS_STORAGE_KEY, readMigratedIds } from "./migrateAlertsToRules";
import { safeLocalStorage } from "../../utils/storageWrapper";

/**
 * - `clean` — every legacy alert has a ledger entry. This is the evidence
 *   the acceptance criterion asks for, and the only verdict that may be
 *   read as one.
 * - `unmigrated` — at least one legacy alert never became a rule. Naming
 *   them is the point: they are recoverable *because* they are named.
 * - `unreadable` — the key exists but did not parse. Nothing is proven
 *   either way, and this must never be collapsed into `clean`. Absence of
 *   proof is not proof of absence.
 */
export type LegacyMigrationVerdict = "clean" | "unmigrated" | "unreadable";

export interface LegacyMigrationReport {
  verdict: LegacyMigrationVerdict;
  /** Legacy entries found, including any without a usable id. */
  legacyCount: number;
  /**
   * Ids present in `cachy_alerts_v1` and absent from the ledger, sorted so
   * two runs over the same storage produce the same report.
   */
  unmigrated: string[];
  /**
   * Legacy entries carrying no string `id` at all. The migration skips
   * these, so they can never appear in `unmigrated` — but they are still
   * alerts a trader once armed, and counting them keeps `legacyCount` from
   * implying a reconciliation that did not happen.
   */
  unidentifiable: number;
}

/** A parsed legacy store, keeping "missing" and "unreadable" apart. */
type LegacyRead =
  | { kind: "absent" }
  | { kind: "unreadable" }
  | { kind: "present"; entries: unknown[] };

/**
 * Reads `cachy_alerts_v1` with one distinction `readAlertStoreSnapshot()`
 * deliberately does not make.
 *
 * That reader folds "unreadable" into `present: false`, which is right for
 * *its* question — it decides whether to suspend rules, and the safe answer
 * to "I cannot tell" is to leave them armed. Here the question is the
 * opposite shape: an unreadable store must not be reported as verified,
 * because the whole value of this module is that a clean verdict means
 * something. Same key, different safe direction, so a second reader rather
 * than a flag on the first.
 */
function readLegacyStore(): LegacyRead {
  let raw: string | null;
  try {
    raw = safeLocalStorage.getItem(ALERTS_STORAGE_KEY);
  } catch (e) {
    logger.warn("alerts", "[FEAT-0399] Legacy alert store could not be opened", e);
    return { kind: "unreadable" };
  }
  if (raw === null) return { kind: "absent" };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      logger.warn("alerts", "[FEAT-0399] Legacy alert store is not a list — migration unverified");
      return { kind: "unreadable" };
    }
    return { kind: "present", entries: parsed };
  } catch (e) {
    logger.warn("alerts", "[FEAT-0399] Legacy alert store did not parse — migration unverified", e);
    return { kind: "unreadable" };
  }
}

/**
 * Checks this device's legacy alert store against the migration ledger.
 *
 * Returns `null` when there is nothing to verify — no legacy key at all,
 * which is every device that never ran the old alert system and every
 * device whose trader has since cleared it. That silence is deliberate: a
 * report object for "you never had legacy alerts" would reach the panel and
 * ask a trader to care about a subsystem they have never seen.
 *
 * Never throws. This runs inside `initAlertEngine()`, and a bookkeeping
 * question must not be able to stop the engine that answers it.
 */
export function verifyLegacyMigration(): LegacyMigrationReport | null {
  if (!browser) return null;

  const store = readLegacyStore();
  if (store.kind === "absent") return null;
  if (store.kind === "unreadable") {
    return { verdict: "unreadable", legacyCount: 0, unmigrated: [], unidentifiable: 0 };
  }

  const ledger = readMigratedIds();
  if (ledger === null) {
    return {
      verdict: "unreadable",
      legacyCount: store.entries.length,
      unmigrated: [],
      unidentifiable: 0,
    };
  }

  const unmigrated = new Set<string>();
  let unidentifiable = 0;
  for (const entry of store.entries) {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id !== "string") {
      unidentifiable += 1;
      continue;
    }
    if (!ledger.has(id)) unmigrated.add(id);
  }

  return {
    verdict: unmigrated.size > 0 ? "unmigrated" : "clean",
    legacyCount: store.entries.length,
    unmigrated: [...unmigrated].sort(),
    unidentifiable,
  };
}

/**
 * Runs the check and logs its verdict, returning the report for the panel.
 *
 * The log line is the durable half: a trader who never opens the alert panel
 * still leaves a record of why an alarm stopped existing, and a clean run on
 * a device with legacy alerts is worth one line too — it is the evidence
 * that the retirement was safe *here*, which is the only place it can be
 * established.
 */
export function reportLegacyMigrationState(): LegacyMigrationReport | null {
  const report = verifyLegacyMigration();
  if (report === null) return null;

  if (report.verdict === "clean") {
    logger.log(
      "alerts",
      `[FEAT-0399] Legacy alert store verified: ${report.legacyCount} entries, all migrated`,
    );
  } else if (report.verdict === "unmigrated") {
    logger.warn(
      "alerts",
      `[FEAT-0399] ${report.unmigrated.length} legacy alert(s) never migrated and no longer evaluate: ` +
        report.unmigrated.join(", "),
    );
  } else {
    logger.warn(
      "alerts",
      "[FEAT-0399] Legacy alert store could not be verified against the migration ledger",
    );
  }

  if (report.unidentifiable > 0) {
    logger.warn(
      "alerts",
      `[FEAT-0399] ${report.unidentifiable} legacy entr(ies) carry no id and were never migratable`,
    );
  }

  return report;
}
