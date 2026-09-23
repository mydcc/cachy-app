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
 * FEAT-0389 — arming a hand-authored rule document.
 *
 * Writes into `cachy_rules_v1`, the same store the migration writes and
 * `ruleLoopWiring.ts` reads, so a rule armed from the Super-Alert panel is
 * evaluated by the same loop as a migrated one. Two properties of the
 * surrounding code make that safe rather than merely convenient:
 *
 * - `ruleLoopWiring.ts` reads this key as the loop's rule source, so an armed
 *   rule is actually evaluated. A store nothing reads is BUG-0382 with extra
 *   steps.
 * - `reconcileOrphanedRules.ts:isOrphanCandidate` returns false for a rule with
 *   no entry in the origin ledger, so a hand-authored rule — which has no
 *   source alert by definition — is never suspended as an orphan.
 *
 * Class A (ADR-0001): rules are strategy and stay in `localStorage`.
 */

import { browser } from "$app/environment";
import type { RuleDocument } from "../../lib/rules/types";
import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import { logger } from "../logger";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { clearBotAnchors } from "./ruleStateStore";
import { ruleEvaluationLoop } from "./ruleEvaluationLoop";
import { safeLocalStorage } from "../../utils/storageWrapper";

/**
 * Raised when the rule store cannot be read as an array of rules.
 *
 * Deliberately fatal rather than "start from an empty array": overwriting a
 * store we failed to parse would silently delete every other armed rule the
 * trader has. A refused arm the trader can see beats a successful arm that
 * quietly disarms everything else.
 */
export class RuleStoreUnreadableError extends Error {
  public readonly translationKey = "dashboard.alerts.panel.storeUnreadable";
  constructor(cause?: unknown) {
    super(`rule store is not readable${cause ? `: ${String(cause)}` : ""}`);
    this.name = "RuleStoreUnreadableError";
  }
}

/**
 * The stored rule set, or a refusal.
 *
 * Exported because promotion reads the same store and must fail the same way:
 * a promotion that started from an empty array on a store it failed to parse
 * would write the new bot over every rule the trader has.
 */
export function readRuleStore(): RuleDocument[] {
  const raw = safeLocalStorage.getItem(RULES_STORAGE_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new RuleStoreUnreadableError(e);
  }
  if (!Array.isArray(parsed))
    throw new RuleStoreUnreadableError("stored value is not an array");
  return parsed as RuleDocument[];
}

/**
 * The strategy half of a rule document, canonically encoded.
 *
 * BUG-0486 — `armRule` handles create, edit and enable-toggle in one
 * function, but only a strategy edit may reset the evaluation anchors:
 * clearing them on a bare `enabled` flip would let a disarm+re-arm toggle
 * re-fire the same candle, i.e. a UI-built double order. Stripped before
 * comparing: `enabled` (a toggle is not a strategy change) and the
 * FEAT-0393 lifecycle fields (`trigger_methods`, `frequency`,
 * `valid_until_ms`, `note`), which `types.ts` documents as outside the
 * content hash — two rules differing only in how loudly they announce
 * themselves are the same strategy. A note edit on a just-fired once rule
 * must not make its already-seen candle decidable again. Keys are sorted
 * because the stored copy (JSON round-trip) and the incoming draft need
 * not share insertion order.
 */
function strategyOf(document: RuleDocument): string {
    const strategy: Record<string, unknown> = { ...(document as unknown as Record<string, unknown>) };
    delete strategy.enabled;
    delete strategy.trigger_methods;
    delete strategy.frequency;
    delete strategy.valid_until_ms;
    delete strategy.note;
    return JSON.stringify(sortKeys(strategy));
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([k, v]) => [k, sortKeys(v)]),
        );
    }
    return value;
}

/**
 * Drops a rule's evaluation anchors from both halves of the dedupe.
 *
 * BUG-0486 — `forget` clears the gate's in-memory maps and, while the loop
 * has the persistence port bound, the stored anchors too. Edits also land
 * while disarmed, when the port is unbound, so the stored half is cleared
 * directly here as well: a forgotten rule must be decidable again after a
 * reload too, not just this session.
 */
function forgetAnchors(ruleId: string): void {
    ruleEvaluationGate.forget(ruleId);
    clearBotAnchors(ruleId);
}

/**
 * Stores `document` as an armed rule and returns the rules as they now stand.
 *
 * Replaces by `id` rather than always appending, so re-arming an edited draft
 * updates the rule instead of leaving the pre-edit copy armed beside it —
 * BUG-0402 was exactly that shape on the legacy path.
 *
 * The caller is responsible for having had the core accept the document
 * first (`alertPanelState.validateDraft()`); this function does not validate,
 * because a second opinion on validity is the divergence ADR-0012 forbids.
 *
 * BUG-0486: replacing an edited draft whose *strategy* changed also resets
 * that rule's evaluation anchors (see `strategyOf`); bare toggles and
 * lifecycle-only edits keep them.
 */
export function armRule(document: RuleDocument): RuleDocument[] {
  const rules = readRuleStore();
  const index = rules.findIndex((r) => r.id === document.id);
  if (index !== -1 && strategyOf(rules[index]) !== strategyOf(document)) {
    // A real content change: the old strategy's anchors must not suppress
    // the new strategy's first signal. A bare enable-toggle keeps them —
    // see `strategyOf` — so toggling can never re-fire a seen candle.
    forgetAnchors(document.id);
  }
  const next =
    index === -1
      ? [...rules, document]
      : rules.map((r, i) => (i === index ? document : r));
  safeLocalStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(next));
  // BUG-0485: a (re-)armed rule is a new verdict waiting to happen. Whatever
  // made the previous revision inert — deleted drawing, uncomputable
  // indicator, refused document — may not hold for this one, so its record
  // goes with the write. If it is still inert the next close re-reports it,
  // silently: the once-per-session interruption is already spent.
  ruleEvaluationLoop.forgetUnevaluableRule(document.id);
  return next;
}

/**
 * Removes one rule from `cachy_rules_v1`. Returns the remaining rules.
 *
 * FEAT-0399: Manage's delete button used to remove the *legacy alert*, and the
 * rule behind it was disarmed separately by `releaseCoverage()`. With the
 * legacy store gone there is one store and one delete, so the button acts on
 * what the loop actually reads.
 *
 * Deletes rather than disarms, matching what the button has always meant to a
 * trader. A rule they merely want silenced is disarmed by the firing path
 * (`disarmRule`), never by this.
 */
export function removeRule(ruleId: string): RuleDocument[] {
  const rules = readRuleStore();
  const next = rules.filter((rule) => rule.id !== ruleId);
  if (next.length !== rules.length) {
    safeLocalStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(next));
    // The rule is gone: its anchors go with it, from both halves, so a
    // re-armed rule with a recycled id starts decidable.
    forgetAnchors(ruleId);
    // BUG-0485: and its inert record goes too — a deleted rule must not stay
    // listed as "can never fire".
    ruleEvaluationLoop.forgetUnevaluableRule(ruleId);
  }
  return next;
}

/**
 * Disarms one rule in `cachy_rules_v1`. Returns whether anything changed.
 *
 * Used when a rule has fired: the rule engine is one-shot, and the disarm has
 * to reach storage rather than memory, because the loop re-reads the rule set
 * on every candle close.
 *
 * Moved here from `ruleCoverage.ts` by FEAT-0399 — that module existed to
 * split alerts between two engines, and there is only one engine now. Reads
 * and writes the raw store rather than going through `readRuleStore()`, so a
 * single malformed entry cannot cost the trader every other rule in the file.
 */
export function disarmRule(ruleId: string): boolean {
  if (!browser) return false;

  try {
    const raw = safeLocalStorage.getItem(RULES_STORAGE_KEY);
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

    safeLocalStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(updated));
    // BUG-0485: a disarmed rule is not evaluated at all, so a stale "can
    // never fire" entry about it would be a verdict on nothing. Re-enabling
    // re-arms through `armRule`, which forgets again above.
    ruleEvaluationLoop.forgetUnevaluableRule(ruleId);
    return true;
  } catch (e) {
    logger.error("alerts", `Could not disarm rule ${ruleId}`, e);
    return false;
  }
}
