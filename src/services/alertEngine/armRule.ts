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

import type { RuleDocument } from "../../lib/rules/types";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";

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

function readRules(): RuleDocument[] {
  const raw = localStorage.getItem(RULES_STORAGE_KEY);
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
 * Stores `document` as an armed rule and returns the rules as they now stand.
 *
 * Replaces by `id` rather than always appending, so re-arming an edited draft
 * updates the rule instead of leaving the pre-edit copy armed beside it —
 * BUG-0402 was exactly that shape on the legacy path.
 *
 * The caller is responsible for having had the core accept the document
 * first (`alertPanelState.validateDraft()`); this function does not validate,
 * because a second opinion on validity is the divergence ADR-0012 forbids.
 */
export function armRule(document: RuleDocument): RuleDocument[] {
  const rules = readRules();
  const index = rules.findIndex((r) => r.id === document.id);
  const next =
    index === -1
      ? [...rules, document]
      : rules.map((r, i) => (i === index ? document : r));
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(next));
  return next;
}
