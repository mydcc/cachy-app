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
 * FEAT-0387 cutover — which legacy alerts the rule engine has actually taken
 * over.
 *
 * A cutover done with one global switch has two failure modes, and both are
 * worse than the delay it removes:
 *
 * - **Double fire.** Both paths evaluate the same alert and the trader is
 *   notified twice for one event.
 * - **Silent gap.** The legacy path is switched off for an alert the rule
 *   engine does not actually hold — a migration that skipped a malformed
 *   entry, a rule the trader deleted, a rule left disabled by the orphan
 *   reconciliation. The alarm is then armed in the trader's mind and nowhere
 *   else. That is BUG-0382 exactly, caused by us this time.
 *
 * So the switch is not global. An alert leaves the legacy engine only when a
 * specific, armed rule is proven to cover it, and stays on the legacy path
 * otherwise. Coverage is derived, never stored: a stored flag would be one
 * more thing that can disagree with reality, and the two stores it is derived
 * from are the reality.
 *
 * Class A: reads `localStorage` and nothing else.
 */

import { browser } from "$app/environment";
import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { RuleDocument } from "../../lib/rules/types";
import { logger } from "../logger";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { readRuleOriginLedger } from "./ruleOriginLedger";

/** Whether the market store has a live series for a rule's symbol+timeframe. */
export type SeriesObservedPredicate = (symbol: string, timeframe: string) => boolean;

/**
 * The safe default: until a caller supplies the real, market-store-backed
 * check, no series counts as observed, so coverage stays empty rather than
 * silently assuming a subscription exists. This file has no import on the
 * market store on purpose (it sits on `initAlertEngine()`'s SSR-early-return
 * import graph), so the real predicate always comes from the one caller that
 * already bridges to it — `ruleLoopWiring.isSeriesObserved`, wired in by
 * `alerts.svelte.ts`.
 */
const assumeNothingObserved: SeriesObservedPredicate = () => false;

/**
 * The ids of legacy alerts the rule engine now evaluates.
 *
 * An alert is covered when three things all hold: the origin ledger names a
 * rule that came from it, that rule is still armed in `cachy_rules_v1`, and
 * the market store is observed to be producing candles for the rule's exact
 * symbol and trigger timeframe. All three are load-bearing — the ledger alone
 * only proves a rule once existed, a disabled rule evaluates nothing, and an
 * armed rule whose series never arrives can never produce a verdict. Treating
 * any one of them as coverage on its own is the silent gap.
 *
 * Returns an empty set on any doubt, including when `isSeriesObserved` is left
 * at its default. An empty set means "the legacy engine keeps everything",
 * which is the state the app has shipped in all along and cannot be a
 * regression.
 */
export function readCoveredAlertIds(
  isSeriesObserved: SeriesObservedPredicate = assumeNothingObserved,
): ReadonlySet<string> {
  const none: ReadonlySet<string> = new Set();
  if (!browser) return none;

  // The rule store can name an armed rule for an alert while the evaluator
  // that would actually run it has failed to load — a slow or failed wasm
  // fetch, independent of the legacy engine's own load. Reporting coverage in
  // that state would take the alert off the legacy path for an engine that
  // will never evaluate it: the double failure this whole module exists to
  // rule out, arrived at through two subsystems that load independently.
  if (!ruleSchema.isReady()) {
    logger.warn("alerts", "[Cutover] Rule schema core not loaded — no alert reported as covered");
    return none;
  }

  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (raw === null) return none;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      logger.warn("alerts", "[Cutover] Rule store is not a list — legacy engine keeps every alert");
      return none;
    }

    // Keeps the full document, not just the id: deciding coverage needs the
    // rule's symbol and trigger timeframe below, to ask whether that exact
    // series is actually being observed.
    const armedRulesById = new Map<string, RuleDocument>();
    for (const rule of parsed as RuleDocument[]) {
      if (rule === null || typeof rule !== "object") continue;
      if (typeof rule.id !== "string") continue;
      if (rule.enabled === false) continue;
      armedRulesById.set(rule.id, rule);
    }

    const covered = new Set<string>();
    const ledger = readRuleOriginLedger();
    for (const [ruleId, entry] of Object.entries(ledger.entries)) {
      const rule = armedRulesById.get(ruleId);
      if (rule === undefined) continue;
      if (typeof entry?.alertId !== "string") continue;
      if (typeof rule.symbol !== "string" || typeof rule.trigger_timeframe !== "string") continue;
      if (!isSeriesObserved(rule.symbol, rule.trigger_timeframe)) continue;
      covered.add(entry.alertId);
    }
    return covered;
  } catch (e) {
    logger.error("alerts", "[Cutover] Coverage check failed — legacy engine keeps every alert", e);
    return none;
  }
}

/**
 * Hands one alert back to the legacy engine by disarming the rule that covered
 * it. Returns whether anything changed.
 *
 * Called when the trader edits or deletes a legacy alert. Editing is the case
 * that matters: the migration re-syncs a rule's threshold with its alert at
 * startup (BUG-0402), so between an edit and the next start the rule still
 * holds the *old* level. Leaving it armed would fire the price the trader just
 * changed away from — the bug BUG-0402 fixed, reintroduced through the
 * cutover. Disarming restores the legacy path immediately, and the next start
 * re-syncs the rule and takes coverage back.
 *
 * The rule is disabled, never deleted: the trader's own rule set is not this
 * function's to prune, and the orphan reconciliation already has a considered
 * answer for rules whose alert is gone.
 */
export function releaseCoverage(alertId: string): boolean {
  if (!browser) return false;

  try {
    const ledger = readRuleOriginLedger();
    const ruleIds = Object.entries(ledger.entries)
      .filter(([, entry]) => entry?.alertId === alertId)
      .map(([ruleId]) => ruleId);
    if (ruleIds.length === 0) return false;

    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (raw === null) return false;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;

    let changed = false;
    const updated = (parsed as RuleDocument[]).map((rule) => {
      if (rule === null || typeof rule !== "object") return rule;
      if (!ruleIds.includes(rule.id) || rule.enabled === false) return rule;
      changed = true;
      return { ...rule, enabled: false };
    });
    if (!changed) return false;

    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(updated));
    logger.log("alerts", `[Cutover] Alert ${alertId} handed back to the legacy engine`);
    return true;
  } catch (e) {
    logger.error("alerts", `[Cutover] Could not release coverage for ${alertId}`, e);
    return false;
  }
}

/**
 * The legacy alert a rule was migrated from, if the ledger knows of one.
 *
 * `undefined` for a rule authored directly — there is no alert to keep in
 * step with, and inventing one would disarm something the trader never linked.
 */
export function originAlertIdOf(ruleId: string): string | undefined {
  if (!browser) return undefined;

  try {
    const alertId = readRuleOriginLedger().entries[ruleId]?.alertId;
    return typeof alertId === "string" ? alertId : undefined;
  } catch (e) {
    logger.error("alerts", `[Cutover] Could not read the origin of ${ruleId}`, e);
    return undefined;
  }
}

/**
 * Disarms one rule in `cachy_rules_v1`. Returns whether anything changed.
 *
 * Used when a rule has fired: the rule engine is one-shot like the engine it
 * replaces, and the disarm has to reach storage rather than memory, because
 * the loop re-reads the rule set on every candle close.
 */
export function disarmRule(ruleId: string): boolean {
  if (!browser) return false;

  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (raw === null) return false;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;

    let changed = false;
    const updated = (parsed as RuleDocument[]).map((rule) => {
      if (rule === null || typeof rule !== "object") return rule;
      if (rule.id !== ruleId || rule.enabled === false) return rule;
      changed = true;
      return { ...rule, enabled: false };
    });
    if (!changed) return false;

    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (e) {
    logger.error("alerts", `[Cutover] Could not disarm rule ${ruleId}`, e);
    return false;
  }
}

/**
 * The alerts the legacy engine should still evaluate.
 *
 * This is the whole cutover: what the rule engine covers is removed here, and
 * everything else keeps working exactly as it did. Nothing is deleted — an
 * alert dropped from the engine is still in `cachy_alerts_v1` and comes back
 * the moment its rule is disarmed or deleted.
 */
export function alertsForLegacyEngine<T extends { id: string }>(
  alerts: readonly T[],
  covered: ReadonlySet<string> = readCoveredAlertIds(),
): T[] {
  if (!Array.isArray(alerts)) return [];
  return alerts.filter((alert) => alert !== null && typeof alert === "object" && !covered.has(alert.id));
}
