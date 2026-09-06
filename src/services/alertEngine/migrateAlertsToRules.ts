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

import { browser } from "$app/environment";
import { logger } from "../logger";

const ALERTS_STORAGE_KEY = "cachy_alerts_v1";
const RULES_STORAGE_KEY = "cachy_rules_v1";

// FEAT-0388: append-only record of legacy alert ids that have a
// corresponding rule document, independent of what later happens to that
// rule. See `recordMigratedIds` for why this can't be reconstructed from
// `cachy_rules_v1` alone.
const MIGRATED_LEDGER_KEY = "cachy_alerts_migrated_v1";

// FEAT-0388: the old engine evaluated on every tick and had no notion of a
// timeframe; the rule schema requires one (ADR-0012 decision 3). "1m" is
// used as a fixed default rather than an inferred heuristic, per the
// backlog decision that this is the caller's choice with no natural default.
const DEFAULT_TRIGGER_TIMEFRAME = "1m";

interface RuleFromAlertModule {
  rule_from_alert_json(alertJson: string, timeframe: string, createdAtMs: number): string;
}

type RuleModuleLoader = () => Promise<RuleFromAlertModule>;

const loadRuleModule: RuleModuleLoader = async () => {
  const wasmJsPath = "/wasm/technicals_wasm.js";
  const wasmBinaryPath = "/wasm/technicals_wasm_bg.wasm";

  const mod = (await import(/* @vite-ignore */ wasmJsPath)) as {
    default: (wasmBinaryPath: string) => Promise<void>;
  } & RuleFromAlertModule;
  await mod.default(wasmBinaryPath);
  return mod;
};

function readJsonArray(key: string): unknown[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function idOf(entry: unknown): string | undefined {
  if (entry && typeof entry === "object" && "id" in entry) {
    const id = (entry as { id: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function activeOf(alert: unknown): boolean | undefined {
  if (alert && typeof alert === "object" && "active" in alert) {
    const active = (alert as { active: unknown }).active;
    return typeof active === "boolean" ? active : undefined;
  }
  return undefined;
}

function describeAlert(alert: unknown): string {
  return idOf(alert) ?? "<unidentifiable entry>";
}

/**
 * Records legacy alert ids as migrated, merging into whatever the ledger
 * already holds. Never removes an id: a rule the trader deletes later from
 * `cachy_rules_v1` must still read as "migrated, then deleted" here, not
 * "never migrated" — that distinction is the whole reason this ledger
 * exists instead of deriving the answer from `cachy_rules_v1` directly (see
 * FEAT-0388's Reconciliation ledger note).
 *
 * No-ops when every id is already recorded, so a run that converts nothing
 * new does not touch storage.
 */
function recordMigratedIds(ids: Set<string>): void {
  if (ids.size === 0) return;

  let existing: Set<string>;
  try {
    const stored = readJsonArray(MIGRATED_LEDGER_KEY);
    existing = new Set(stored.filter((entry): entry is string => typeof entry === "string"));
  } catch (e) {
    logger.error("alerts", "Failed to parse cachy_alerts_migrated_v1 during migration", e);
    existing = new Set();
  }

  const merged = new Set(existing);
  for (const id of ids) merged.add(id);
  if (merged.size === existing.size) return;

  try {
    localStorage.setItem(MIGRATED_LEDGER_KEY, JSON.stringify([...merged].sort()));
  } catch (e) {
    logger.error("alerts", "Failed to persist cachy_alerts_migrated_v1 during migration", e);
  }
}

/**
 * Migrates alerts stored under `cachy_alerts_v1` into rule documents under
 * `cachy_rules_v1`. `cachy_alerts_v1` is never modified or deleted — it
 * stays a dormant fallback per FEAT-0388.
 *
 * Idempotency is per-alert-id against `cachy_rules_v1`, not a single global
 * "already migrated" flag: an alert armed after an earlier run has no
 * matching rule id yet and is picked up on the next one. A permanent marker
 * would silently stop converting anything armed after the first run ever
 * fired — the same shape of failure this migration exists to prevent, just
 * moved to its own tail.
 *
 * A rule that already exists for an alert's id has its `enabled` field kept
 * in sync with that alert's current `active` flag on every run — otherwise
 * an alert that fires *after* its first migration would leave a stale,
 * still-armed rule behind, re-firing at the FEAT-0387 cutover for something
 * the trader already saw fire. Deletion is not handled here: a rule whose
 * alert has since been removed from `cachy_alerts_v1` entirely is left as
 * is, since nothing here can safely tell a migrated-then-orphaned rule
 * apart from one a future rule editor authored directly — that
 * reconciliation belongs to whatever reads `cachy_rules_v1` first (FEAT-0387).
 *
 * Every alert id that ends this run with a matching rule document — freshly
 * converted or already migrated in an earlier run — is recorded in
 * `cachy_alerts_migrated_v1` via `recordMigratedIds`. A duplicate skipped
 * above never reaches that ledger, since it never got a rule of its own.
 *
 * Never throws — this is called unconditionally from `initAlertEngine()`
 * before the alert engine itself loads, and a migration hiccup must not
 * block that.
 */
export async function migrateAlertsToRuleDocuments(
  loadModule: RuleModuleLoader = loadRuleModule,
): Promise<void> {
  if (!browser) return;

  try {
    let alerts: unknown[];
    try {
      alerts = readJsonArray(ALERTS_STORAGE_KEY);
    } catch (e) {
      logger.error("alerts", "Failed to parse cachy_alerts_v1 during migration", e);
      return;
    }
    if (alerts.length === 0) return;

    let existingRules: unknown[];
    try {
      existingRules = readJsonArray(RULES_STORAGE_KEY);
    } catch (e) {
      logger.error("alerts", "Failed to parse cachy_rules_v1 during migration", e);
      existingRules = [];
    }

    const rulesById = new Map<string, number>();
    existingRules.forEach((rule, index) => {
      const id = idOf(rule);
      if (id !== undefined && !rulesById.has(id)) rulesById.set(id, index);
    });

    const claimedIds = new Set(rulesById.keys());
    const toConvert: unknown[] = [];
    const syncedRules = [...existingRules];
    const migratedIds = new Set<string>();
    let rulesChanged = false;

    for (const alert of alerts) {
      const id = idOf(alert);
      if (id === undefined) {
        // No id to reconcile by — attempt it anyway; the wasm conversion
        // will refuse it and it lands in the per-item malformed-entry log.
        toConvert.push(alert);
        continue;
      }

      const existingIndex = rulesById.get(id);
      if (existingIndex !== undefined) {
        migratedIds.add(id);
        const active = activeOf(alert);
        const rule = syncedRules[existingIndex];
        const enabled = rule && typeof rule === "object" ? (rule as { enabled?: unknown }).enabled : undefined;
        if (active !== undefined && enabled !== active) {
          syncedRules[existingIndex] = { ...(rule as Record<string, unknown>), enabled: active };
          rulesChanged = true;
          logger.debug("alerts", `Synced rule ${id}'s enabled state to match its alert's active flag (${active})`);
        }
        continue;
      }

      if (claimedIds.has(id)) {
        // Two stored alerts sharing an id (a weak id generator upstream can
        // produce this) would otherwise both migrate and mint duplicate
        // rule ids. Keep the first, skip and log the rest.
        logger.debug("alerts", `Skipping alert ${id} during migration: duplicate id within cachy_alerts_v1`);
        continue;
      }

      claimedIds.add(id);
      toConvert.push(alert);
    }

    if (toConvert.length === 0) {
      if (rulesChanged) {
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(syncedRules));
      }
      recordMigratedIds(migratedIds);
      return;
    }

    let ruleModule: RuleFromAlertModule;
    try {
      ruleModule = await loadModule();
    } catch (e) {
      logger.error("alerts", "Failed to load wasm module for alert migration", e);
      if (rulesChanged) {
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(syncedRules));
      }
      recordMigratedIds(migratedIds);
      return;
    }

    const createdAtMs = Date.now();
    const migratedRules: unknown[] = [];

    for (const alert of toConvert) {
      try {
        const ruleJson = ruleModule.rule_from_alert_json(
          JSON.stringify(alert),
          DEFAULT_TRIGGER_TIMEFRAME,
          createdAtMs,
        );
        migratedRules.push(JSON.parse(ruleJson));
        const convertedId = idOf(alert);
        if (convertedId !== undefined) migratedIds.add(convertedId);
      } catch (e) {
        logger.error(
          "alerts",
          `Skipping malformed alert during migration (${describeAlert(alert)})`,
          e,
        );
      }
    }

    if (migratedRules.length > 0 || rulesChanged) {
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([...syncedRules, ...migratedRules]));
    }
    recordMigratedIds(migratedIds);
  } catch (e) {
    logger.error("alerts", "Alert migration failed unexpectedly", e);
  }
}
