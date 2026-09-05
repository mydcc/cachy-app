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
import {
  readRuleOriginLedger,
  withRecordedOrigins,
  writeRuleOriginLedger,
  type RuleOriginEntry,
} from "./ruleOriginLedger";

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

function activeOf(alert: unknown): boolean | undefined {
  if (alert && typeof alert === "object" && "active" in alert) {
    const active = (alert as { active: unknown }).active;
    return typeof active === "boolean" ? active : undefined;
  }
  return undefined;
}

function createdAtMsOf(rule: unknown): number | undefined {
  if (rule && typeof rule === "object" && "provenance" in rule) {
    const provenance = (rule as { provenance: unknown }).provenance;
    if (provenance && typeof provenance === "object" && "created_at_ms" in provenance) {
      const value = (provenance as { created_at_ms: unknown }).created_at_ms;
      return typeof value === "number" ? value : undefined;
    }
  }
  return undefined;
}

// BUG-0402: FEAT-0027's price alerts always convert to the same condition
// shape (`Cross { right: Constant { value } }`, see technicals-wasm's
// rule/legacy.rs) — reading the threshold back out of a migrated rule this
// way is only ever wrong for a rule this migration did not produce, and
// such a rule fails these type checks and is correctly left alone.
function ruleThresholdOf(rule: unknown): string | undefined {
  if (!rule || typeof rule !== "object" || !("conditions" in rule)) return undefined;
  const conditions = (rule as { conditions: unknown }).conditions;
  if (!conditions || typeof conditions !== "object" || !("right" in conditions)) return undefined;
  const right = (conditions as { right: unknown }).right;
  if (!right || typeof right !== "object" || !("value" in right)) return undefined;
  const value = (right as { value: unknown }).value;
  return typeof value === "string" ? value : undefined;
}

function alertThresholdOf(alert: unknown): string | undefined {
  if (!alert || typeof alert !== "object" || !("condition" in alert)) return undefined;
  const condition = (alert as { condition: unknown }).condition;
  if (!condition || typeof condition !== "object" || !("price_reached" in condition)) return undefined;
  const value = (condition as { price_reached: unknown }).price_reached;
  return typeof value === "string" ? value : undefined;
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
 * A rule that already exists for an alert's id has two things kept in sync
 * with that alert on every run. Its `enabled` field mirrors the alert's
 * `active` flag directly — otherwise an alert that fires *after* its first
 * migration would leave a stale, still-armed rule behind, re-firing at the
 * FEAT-0387 cutover for something the trader already saw fire. Its
 * threshold (BUG-0402) is checked against the alert's current
 * `condition.price_reached` and, if the trader has since edited it,
 * resynced by re-running the same alert-to-rule conversion a first-time
 * convert uses — rather than patching the condition tree by hand here,
 * which would grow a second, partial copy of the alert-to-rule mapping in
 * TypeScript (ADR-0012 decision 1 reserves that to the wasm conversion).
 * Only the rule's `id` and its original `provenance.created_at_ms` are
 * carried over into the resync; everything else the alert can express is
 * re-derived. The threshold check is cheap and wasm stays unloaded unless a
 * drift is actually found, so an unedited alert costs nothing extra on
 * every app start. Deletion is not handled here: a rule whose alert has
 * since been removed from `cachy_alerts_v1` entirely is left as is. What
 * changed with FEAT-0401 is that the two are now *distinguishable*:
 * every rule this migration writes is recorded in `cachy_rule_origin_v1`, so
 * a reader can tell a migrated-then-orphaned rule from one a rule editor
 * authored directly. Deciding what to do with an orphan — disable it, drop
 * it, surface it — is still the cutover's call (FEAT-0387), not this
 * migration's. This function supplies the evidence and stops there.
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
    const toResync: { alert: unknown; index: number }[] = [];
    const syncedRules = [...existingRules];
    let rulesChanged = false;

    // FEAT-0401: one timestamp for the whole run, so every rule written and
    // every ledger entry recorded below agree on when this migration ran.
    const runAtMs = Date.now();
    const originLedger = readRuleOriginLedger();
    const originRecords: { ruleId: string; entry: RuleOriginEntry }[] = [];

    /**
     * Merges this run's origin records into the ledger and persists it.
     * Called at every exit that has written rules — including the ones that
     * give up early, because a back-fill record stays true whether or not the
     * conversion below ever got to run.
     *
     * The append-only rule lives in `withRecordedOrigins`, not here: callers
     * push a record for every link they can prove and let the merge decide
     * what is new, so there is exactly one place that can drop an entry.
     */
    const persistOrigins = (): void => {
      if (originRecords.length === 0) return;
      const { ledger, added } = withRecordedOrigins(originLedger, originRecords);
      if (added === 0) return;
      if (writeRuleOriginLedger(ledger)) {
        logger.debug("alerts", `Recorded ${added} rule origin(s) in the migration ledger`);
      }
    };

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
        const rule = syncedRules[existingIndex];
        const alertThreshold = alertThresholdOf(alert);
        const ruleThreshold = ruleThresholdOf(rule);
        const thresholdDrifted =
          alertThreshold !== undefined && ruleThreshold !== undefined && alertThreshold !== ruleThreshold;

        if (thresholdDrifted) {
          // BUG-0402: the alert's price moved since this rule was converted
          // (or last resynced). Hand off to the resync pass below, which
          // re-runs the wasm conversion rather than patching the condition
          // tree here — that also carries `enabled` across correctly, so no
          // separate enabled-sync is needed for this alert this run.
          toResync.push({ alert, index: existingIndex });
        } else {
          const active = activeOf(alert);
          const enabled =
            rule && typeof rule === "object" ? (rule as { enabled?: unknown }).enabled : undefined;
          if (active !== undefined && enabled !== active) {
            syncedRules[existingIndex] = { ...(rule as Record<string, unknown>), enabled: active };
            rulesChanged = true;
            logger.debug(
              "alerts",
              `Synced rule ${id}'s enabled state to match its alert's active flag (${active})`,
            );
          }
        }

        // FEAT-0401: this rule was migrated by a run that predates the
        // ledger. Its alert is still here, so the link is provable now —
        // once the trader deletes that alert it never can be again, and the
        // rule becomes indistinguishable from a hand-authored one forever.
        // Treating an id match as "this rule is that alert's rule" is the
        // same assumption the syncs above already ship on.
        originRecords.push({
          ruleId: id,
          entry: { alertId: id, migratedAtMs: runAtMs, backfilled: true },
        });
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

    if (toConvert.length === 0 && toResync.length === 0) {
      if (rulesChanged) {
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(syncedRules));
      }
      persistOrigins();
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
      persistOrigins();
      return;
    }

    // BUG-0402: resync every already-migrated rule from its alert's current
    // state before converting new ones. The original `provenance.created_at_ms`
    // is carried over so a resync never looks like a re-creation; everything
    // else the alert can express is re-derived fresh.
    for (const { alert, index } of toResync) {
      const id = idOf(alert);
      const currentRule = syncedRules[index];
      const createdAtMs = createdAtMsOf(currentRule) ?? runAtMs;
      try {
        const ruleJson = ruleModule.rule_from_alert_json(
          JSON.stringify(alert),
          DEFAULT_TRIGGER_TIMEFRAME,
          createdAtMs,
        );
        const freshRule: unknown = JSON.parse(ruleJson);
        if (JSON.stringify(freshRule) !== JSON.stringify(currentRule)) {
          syncedRules[index] = freshRule;
          rulesChanged = true;
          logger.debug("alerts", `Resynced rule ${id} to match its alert's current condition`);
        }
      } catch (e) {
        logger.error(
          "alerts",
          `Skipping resync for rule during migration (${describeAlert(alert)})`,
          e,
        );
      }
    }

    const migratedRules: unknown[] = [];

    for (const alert of toConvert) {
      try {
        const ruleJson = ruleModule.rule_from_alert_json(
          JSON.stringify(alert),
          DEFAULT_TRIGGER_TIMEFRAME,
          runAtMs,
        );
        const rule: unknown = JSON.parse(ruleJson);
        migratedRules.push(rule);

        // FEAT-0401: the key is read back off the produced document, not off
        // the alert. The conversion currently reuses the alert's id, but the
        // ledger has to be keyed by whatever actually landed in
        // `cachy_rules_v1` — that is the id a later reader looks up.
        const ruleId = idOf(rule);
        const alertId = idOf(alert);
        if (ruleId !== undefined && alertId !== undefined) {
          originRecords.push({ ruleId, entry: { alertId, migratedAtMs: runAtMs } });
        }
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

    // Rules first, ledger second, deliberately: if the ledger write is the
    // one that fails, the trader still has their migrated rules and the
    // bookkeeping is back-filled on the next run. The other order would risk
    // a ledger claiming rules that were never written.
    persistOrigins();
  } catch (e) {
    logger.error("alerts", "Alert migration failed unexpectedly", e);
  }
}
