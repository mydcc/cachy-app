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
 * FEAT-0387 cutover — what happens to a migrated rule whose source alert the
 * trader has since deleted from `cachy_alerts_v1`.
 *
 * The decision is *suspend and report*: the rule is disabled and kept, never
 * deleted and never left armed. Deleting it would destroy the only record that
 * the trader ever watched that level; leaving it armed would fire an alarm the
 * trader believes they removed. Both are the BUG-0382 failure mode, in
 * opposite directions.
 *
 * The evidence this reads is `cachy_rule_origin_v1`
 * (`ruleOriginLedger.ts`, FEAT-0401). A migrated rule and a hand-authored one
 * both carry `provenance.source: human`, so provenance alone cannot tell them
 * apart — the ledger can, and it survives the rule's deletion on purpose.
 *
 * ## Why suspending is gated
 *
 * "The source alert is missing" has two causes that look identical per rule
 * and mean opposite things:
 *
 * 1. The trader deleted that alert. Suspending its rule is correct.
 * 2. `cachy_alerts_v1` itself is gone — a fresh device, cleared site data, a
 *    `cachy_rules_v1` backup restored without its counterpart. Suspending then
 *    disarms the trader's entire alert set in one silent pass.
 *
 * No per-rule test can separate them, because the evidence is in the *shape of
 * the whole set*, not in any single rule. Two gates therefore sit in front of
 * the suspension, and both fail towards leaving rules armed: an alarm that
 * fires when the trader expected it gone is noise, an alarm that was silently
 * disarmed is the trader standing uncovered without knowing it. Only the
 * second one can cost money.
 *
 * Class A throughout: reads and writes stay on the device.
 */

import { browser } from "$app/environment";
import { logger } from "../logger";
import type { RuleDocument } from "../../lib/rules/types";
import { ALERTS_STORAGE_KEY, RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { readRuleOriginLedger, type RuleOriginLedger } from "./ruleOriginLedger";

/**
 * The alert store as it was actually found, not merely the ids in it.
 *
 * `present: false` means the `cachy_alerts_v1` key was absent or unreadable —
 * emphatically *not* the same as a key holding an empty list. A key that is
 * there and empty is a trader who deleted their last alert; a key that is not
 * there at all is a store that never existed on this device or is gone. The
 * first is a normal state, the second is the one that must never trigger a
 * mass suspension, and a plain `Set` cannot tell them apart.
 */
export interface AlertStoreSnapshot {
  present: boolean;
  ids: ReadonlySet<string>;
}

/**
 * The share of migrated rules that may be orphaned before the run is treated
 * as evidence of a lost store rather than of deletions.
 *
 * Held as an integer fraction and compared by cross-multiplication, so the
 * threshold is exact at every set size — no float rounding decides whether a
 * trader's alarms stay armed. One in two: deleting more than half of a
 * non-trivial alert set in one sitting is rarer than losing the store.
 */
export const MAX_ORPHAN_RATIO_NUMERATOR = 1;
export const MAX_ORPHAN_RATIO_DENOMINATOR = 2;

/**
 * Below this many migrated rules, the ratio is not evidence of anything —
 * with three rules, two ordinary deletions already read as 67 %. Small sets
 * skip the ratio gate and rely on the store-presence gate, which is the one
 * that actually detects a lost store.
 */
export const ORPHAN_RATIO_MIN_SAMPLE = 4;

/** Why a run left orphan candidates armed instead of suspending them. */
export type OrphanWithholdReason = "alert-store-missing" | "orphan-ratio-exceeded";

export interface OrphanReconciliation {
  /** A new list — the input is never mutated (immutability rule). */
  rules: RuleDocument[];
  /** Ids of the rules this run suspended, for the trader-facing report. */
  suspended: string[];
  /**
   * Orphan candidates deliberately left armed because the set as a whole
   * looked untrustworthy. These still belong in the cutover report: withheld
   * is a decision, not a non-event, and the trader is the one who can say
   * which of the two causes it was.
   */
  withheld: string[];
  /** Set when `withheld` is non-empty. */
  withheldReason?: OrphanWithholdReason;
}

/**
 * Whether `rule` was created by the migration and its source alert is no
 * longer in the store.
 *
 * A rule the ledger does not know was authored directly and can never be an
 * orphan, whatever the alert store looks like.
 */
function isOrphanCandidate(
  rule: RuleDocument,
  store: AlertStoreSnapshot,
  ledger: RuleOriginLedger,
): boolean {
  const origin = ledger.entries[rule.id];
  if (origin === undefined) return false;
  return !store.ids.has(origin.alertId);
}

/**
 * True when the orphan share is too large to be explained by deletions.
 *
 * `candidates / migrated > 1/2`, evaluated as `candidates * 2 > migrated * 1`
 * so the comparison stays in integers.
 */
function exceedsOrphanRatio(candidates: number, migrated: number): boolean {
  if (migrated < ORPHAN_RATIO_MIN_SAMPLE) return false;
  return candidates * MAX_ORPHAN_RATIO_DENOMINATOR > migrated * MAX_ORPHAN_RATIO_NUMERATOR;
}

/**
 * Returns the rule set with every orphan disabled, plus what it suspended and
 * what it deliberately did not.
 *
 * A rule that is already disabled is left exactly as it is: not re-suspended
 * and not reported, so a trader who disarmed a rule themselves never sees it
 * in the cutover report as if we had done it.
 *
 * Never throws. A malformed rule list, a malformed ledger or an unexpected
 * failure returns the input unchanged rather than a partially reconciled set —
 * this runs during startup, and no bookkeeping is worth failing the load that
 * brings a trader's alarms back up.
 */
export function reconcileOrphanedRules(
  rules: readonly RuleDocument[],
  store: AlertStoreSnapshot,
  ledger: RuleOriginLedger,
): OrphanReconciliation {
  const unchanged = (): OrphanReconciliation => ({
    rules: Array.isArray(rules) ? [...rules] : [],
    suspended: [],
    withheld: [],
  });

  try {
    if (!Array.isArray(rules) || rules.length === 0) return unchanged();
    if (ledger === null || typeof ledger !== "object" || typeof ledger.entries !== "object") {
      logger.warn("alerts", "[Cutover] Rule origin ledger unusable — no rule suspended");
      return unchanged();
    }
    if (store === null || typeof store !== "object" || !(store.ids instanceof Set)) {
      logger.warn("alerts", "[Cutover] Alert store snapshot unusable — no rule suspended");
      return unchanged();
    }

    // Only rules that are both armed and known to the ledger take part: a
    // disabled rule is the trader's own decision, and a hand-authored one is
    // outside this reconciliation entirely. Counting either would distort the
    // ratio in the direction of suspending more.
    const migrated = rules.filter(
      (rule) =>
        rule !== null &&
        typeof rule === "object" &&
        typeof rule.id === "string" &&
        rule.enabled !== false &&
        ledger.entries[rule.id] !== undefined,
    );
    if (migrated.length === 0) return unchanged();

    const candidateIds = new Set(
      migrated.filter((rule) => isOrphanCandidate(rule, store, ledger)).map((rule) => rule.id),
    );
    if (candidateIds.size === 0) return unchanged();

    const withheldReason: OrphanWithholdReason | undefined = !store.present
      ? "alert-store-missing"
      : exceedsOrphanRatio(candidateIds.size, migrated.length)
        ? "orphan-ratio-exceeded"
        : undefined;

    if (withheldReason !== undefined) {
      logger.warn(
        "alerts",
        `[Cutover] ${candidateIds.size} of ${migrated.length} migrated rule(s) look orphaned (${withheldReason}) — left armed, reporting instead of suspending`,
      );
      return { rules: [...rules], suspended: [], withheld: [...candidateIds], withheldReason };
    }

    const suspended: string[] = [];
    const reconciled = rules.map((rule) => {
      // Re-checks the shape rather than trusting the filter above: a single
      // malformed entry is passed through untouched, and must not cost the
      // remaining rules their reconciliation.
      if (rule === null || typeof rule !== "object") return rule;
      if (!candidateIds.has(rule.id)) return rule;
      suspended.push(rule.id);
      return { ...rule, enabled: false };
    });

    logger.log(
      "alerts",
      `[Cutover] Suspended ${suspended.length} of ${migrated.length} migrated rule(s) whose source alert no longer exists`,
    );
    return { rules: reconciled, suspended, withheld: [] };
  } catch (e) {
    logger.error("alerts", "[Cutover] Orphan reconciliation failed — rules left untouched", e);
    return unchanged();
  }
}

/**
 * Reads `cachy_alerts_v1` as a snapshot that keeps the distinction the
 * reconciliation depends on.
 *
 * `present` comes from whether the key exists, never from how many ids came
 * out of it: an empty list is a trader with no alerts left, a missing key is a
 * store that is gone, and only the second must hold back a suspension. A key
 * that exists but cannot be parsed counts as *not* present — unreadable is not
 * evidence of deletion, and the safe reading of "I cannot tell" is to leave
 * the trader's rules armed.
 */
export function readAlertStoreSnapshot(): AlertStoreSnapshot {
  const empty: AlertStoreSnapshot = { present: false, ids: new Set() };
  if (!browser) return empty;

  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (raw === null) return empty;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      logger.warn("alerts", "[Cutover] Alert store is not a list — treated as unreadable");
      return empty;
    }

    const ids = new Set<string>();
    for (const entry of parsed) {
      const id = (entry as { id?: unknown } | null)?.id;
      if (typeof id === "string") ids.add(id);
    }
    return { present: true, ids };
  } catch (e) {
    logger.warn("alerts", "[Cutover] Alert store unreadable — no rule suspended", e);
    return empty;
  }
}

/**
 * Runs the reconciliation against the stored rule set and persists the result.
 *
 * Writes only when something was actually suspended, so an ordinary start
 * touches no storage at all. Returns the report either way — `withheld` is a
 * decision the trader has to see, and it produces no write by design.
 *
 * Never throws: this runs inside `initAlertEngine()`, and no bookkeeping is
 * worth failing the startup that brings a trader's alarms back up.
 */
export function reconcileStoredRules(): OrphanReconciliation {
  const nothing: OrphanReconciliation = { rules: [], suspended: [], withheld: [] };
  if (!browser) return nothing;

  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (raw === null) return nothing;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      logger.warn("alerts", "[Cutover] Rule store is not a list — no rule suspended");
      return nothing;
    }

    const result = reconcileOrphanedRules(
      parsed as RuleDocument[],
      readAlertStoreSnapshot(),
      readRuleOriginLedger(),
    );

    if (result.suspended.length > 0) {
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(result.rules));
    }
    return result;
  } catch (e) {
    logger.error("alerts", "[Cutover] Reading rules for reconciliation failed", e);
    return nothing;
  }
}
