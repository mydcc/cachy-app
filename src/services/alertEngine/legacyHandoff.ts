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
 * FEAT-0399 — the one-time pass that catches alarms the cutover parked.
 *
 * While both engines existed, `ruleCoverage.releaseCoverage()` disabled a
 * migrated rule whenever the trader edited or deleted its legacy alert. That
 * was correct then: the rule's threshold was stale until the next start
 * re-synced it (BUG-0402), and the legacy engine picked the alert back up in
 * the meantime, so the alarm never stopped being evaluated — it only changed
 * engines.
 *
 * FEAT-0399 removes the engine that was catching them. A rule parked that way
 * and never re-armed would simply stop existing as an alarm, with nothing in
 * the UI saying so — BUG-0382's exact shape. So on the first start after the
 * legacy path is gone, every rule that is disabled while its source alert is
 * still active is handed back to the rule engine, which is now the only engine
 * there is.
 *
 * Runs exactly once per device, guarded by its own marker rather than by the
 * migration ledger. It has to be once: after this pass, a disabled migrated
 * rule means the trader disabled it in the panel, and re-arming that on every
 * start would override them from a flag frozen in a store they can no longer
 * edit.
 */

import { browser } from "$app/environment";
import { logger } from "../logger";
import type { RuleDocument } from "../../lib/rules/types";
import { ALERTS_STORAGE_KEY, RULES_STORAGE_KEY, readMigratedIds } from "./migrateAlertsToRules";
import { readRuleOriginLedger } from "./ruleOriginLedger";
import { safeLocalStorage } from "../../utils/storageWrapper";

/** Marks the handoff as done, so it never overrides the trader afterwards. */
export const LEGACY_HANDOFF_KEY = "cachy_alerts_handoff_v1";

export interface LegacyHandoffReport {
  /** Rule ids re-armed because their source alert was still active. */
  rearmed: string[];
}

/** Ids of legacy alerts still flagged active, or `null` if unreadable. */
function readActiveAlertIds(): Set<string> | null {
  try {
    const raw = safeLocalStorage.getItem(ALERTS_STORAGE_KEY);
    if (raw === null) return new Set();

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const active = new Set<string>();
    for (const entry of parsed) {
      const record = entry as { id?: unknown; active?: unknown } | null;
      if (typeof record?.id === "string" && record.active === true) active.add(record.id);
    }
    return active;
  } catch (e) {
    logger.warn("alerts", "[FEAT-0399] Legacy alert store unreadable — handoff skipped", e);
    return null;
  }
}

/**
 * Re-arms migrated rules the cutover left parked, once per device.
 *
 * Returns `null` when the pass did not run — already done, not in a browser,
 * or a store it depends on could not be read. A run that finds nothing still
 * marks itself done: the condition it looks for cannot reappear once the
 * legacy editor is gone, so a device with nothing to fix has nothing to
 * re-check either. An *unreadable* store leaves the marker unset instead, so
 * the pass can still run on a later start once whatever broke has settled.
 *
 * Never throws. This runs inside `initAlertEngine()`.
 */
export function runLegacyHandoff(): LegacyHandoffReport | null {
  if (!browser) return null;

  try {
    if (safeLocalStorage.getItem(LEGACY_HANDOFF_KEY) !== null) return null;

    const migrated = readMigratedIds();
    const activeAlertIds = readActiveAlertIds();
    if (migrated === null || activeAlertIds === null) return null;

    const raw = safeLocalStorage.getItem(RULES_STORAGE_KEY);
    if (raw === null) {
      markDone([]);
      return { rearmed: [] };
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const originLedger = readRuleOriginLedger();
    const rearmed: string[] = [];

    const updated = parsed.map((entry) => {
      const rule = entry as RuleDocument | null;
      if (rule === null || typeof rule !== "object") return entry;
      if (rule.enabled !== false) return entry;

      // Only a rule this migration produced can have been parked by the
      // cutover. One authored in the panel and disabled there is the trader's
      // own decision and is never touched.
      const alertId = originLedger.entries[rule.id]?.alertId;
      if (typeof alertId !== "string") return entry;
      if (!migrated.has(alertId)) return entry;
      if (!activeAlertIds.has(alertId)) return entry;

      rearmed.push(rule.id);
      return { ...rule, enabled: true };
    });

    if (rearmed.length > 0) {
      safeLocalStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(updated));
      logger.warn(
        "alerts",
        `[FEAT-0399] Re-armed ${rearmed.length} alarm(s) the cutover had parked on the legacy engine: ` +
          rearmed.join(", "),
      );
    }

    markDone(rearmed);
    return { rearmed };
  } catch (e) {
    logger.error("alerts", "[FEAT-0399] Legacy handoff failed", e);
    return null;
  }
}

function markDone(rearmed: readonly string[]): void {
  try {
    safeLocalStorage.setItem(
      LEGACY_HANDOFF_KEY,
      JSON.stringify({ atMs: Date.now(), rearmed: [...rearmed] }),
    );
  } catch (e) {
    logger.warn("alerts", "[FEAT-0399] Could not mark the legacy handoff done", e);
  }
}
