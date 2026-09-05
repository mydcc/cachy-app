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

function describeAlert(alert: unknown): string {
  return idOf(alert) ?? "<unidentifiable entry>";
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

    const existingIds = new Set(existingRules.map(idOf).filter((id): id is string => id !== undefined));
    const claimedIds = new Set(existingIds);
    const pending: unknown[] = [];

    for (const alert of alerts) {
      const id = idOf(alert);
      if (id === undefined) {
        // No id to reconcile by — attempt it anyway; the wasm conversion
        // will refuse it and it lands in the per-item malformed-entry log.
        pending.push(alert);
        continue;
      }
      if (existingIds.has(id)) {
        logger.debug("alerts", `Skipping alert ${id} during migration: a rule with this id already exists in cachy_rules_v1`);
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
      pending.push(alert);
    }
    if (pending.length === 0) return;

    let ruleModule: RuleFromAlertModule;
    try {
      ruleModule = await loadModule();
    } catch (e) {
      logger.error("alerts", "Failed to load wasm module for alert migration", e);
      return;
    }

    const createdAtMs = Date.now();
    const migratedRules: unknown[] = [];

    for (const alert of pending) {
      try {
        const ruleJson = ruleModule.rule_from_alert_json(
          JSON.stringify(alert),
          DEFAULT_TRIGGER_TIMEFRAME,
          createdAtMs,
        );
        migratedRules.push(JSON.parse(ruleJson));
      } catch (e) {
        logger.error(
          "alerts",
          `Skipping malformed alert during migration (${describeAlert(alert)})`,
          e,
        );
      }
    }

    if (migratedRules.length > 0) {
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([...existingRules, ...migratedRules]));
    }
  } catch (e) {
    logger.error("alerts", "Alert migration failed unexpectedly", e);
  }
}
