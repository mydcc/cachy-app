/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
 * FEAT-0746 — the two row operations that are not editing.
 *
 * Pause/resume flips `enabled` and nothing else. `armRule` compares via
 * `strategyOf`, which strips `enabled`, so the evaluation anchors and the fired
 * count survive: pausing cannot be used to fire the same candle twice, and
 * resuming cannot re-arm a spent `once` rule.
 *
 * Duplicate builds a *new* document. The core's content hash excludes `id`,
 * `name`, `enabled`, `provenance` and `schema_version`, so the copy deliberately
 * keeps the source's meaning while getting a fresh identity, a provenance link
 * to the source hash, and `enabled: false`. A copy that armed itself is an
 * alert the trader did not review (ADR-0012: nothing acts until a human arms
 * it). Both writes are read back: `safeLocalStorage.setItem` reports a failed
 * write as `false`, not as a throw, and a success toast over an unstored rule
 * is the silence this codebase keeps closing.
 *
 * Class A (ADR-0001): both writes stay in `localStorage`.
 */

import {
  isRuleRefusedError,
  RuleCoreUnavailableError,
  ruleSchema,
} from "../../lib/rules/ruleSchema";
import type { RuleDocument } from "../../lib/rules/types";
import { logger } from "../logger";
import {
  armRule,
  readRuleStore,
  removeRule,
  RuleConflictError,
} from "./armRule";
import { isBot } from "./botStore";
import {
  readDrawingAnchorLedger,
  recordDrawingAnchor,
} from "./drawingAnchors";
import { freeRuleId } from "./ruleIdentity";

export type SetRuleEnabledReason =
  | "unknown"
  | "bot"
  | "unreadable"
  | "conflict"
  | "write-failed";

export type SetRuleEnabledResult =
  | { ok: true; rule: RuleDocument }
  | { ok: false; reason: SetRuleEnabledReason };

/** Why a rule could not be duplicated. */
export type DuplicateRefusal =
  | "unknown"
  | "bot"
  | "unreadable"
  | "anchor-failed"
  | "invalid"
  | "core-unavailable";

export type DuplicateResult =
  | { ok: true; rule: RuleDocument }
  | { ok: false; reason: DuplicateRefusal };

/** `readRuleStore` casts JSON without validating it; entries may be null. */
function findRule(
  rules: readonly RuleDocument[],
  ruleId: string,
): RuleDocument | undefined {
  return rules.find(
    (rule) =>
      rule !== null && typeof rule === "object" && rule.id === ruleId,
  );
}

/** Every id worth avoiding, ignoring malformed entries. */
function takenIds(rules: readonly RuleDocument[]): Set<string> {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (rule !== null && typeof rule === "object" && typeof rule.id === "string") {
      ids.add(rule.id);
    }
  }
  return ids;
}

/**
 * Pause or resume a notification rule.
 *
 * Mirrors `setBotEnabled`: only `enabled` moves, the write goes through
 * `armRule`, and an unknown id returns a reason instead of throwing at a stale
 * row. The expected document is passed to `armRule`, so a concurrent edit or a
 * firing-path disarm in another tab is a refusal, not a silent revert.
 *
 * The write is read back because `safeLocalStorage.setItem` reports quota
 * failure as `false` without throwing.
 */
export function setRuleEnabled(
  ruleId: string,
  enabled: boolean,
): SetRuleEnabledResult {
  let rules: RuleDocument[];
  try {
    rules = readRuleStore();
  } catch (e) {
    logger.warn("alerts", "rules could not be read for pause/resume", e);
    return { ok: false, reason: "unreadable" };
  }

  const rule = findRule(rules, ruleId);
  if (!rule) return { ok: false, reason: "unknown" };
  if (isBot(rule)) return { ok: false, reason: "bot" };

  const updated: RuleDocument = { ...rule, enabled };
  try {
    armRule(updated, rule);
  } catch (e) {
    if (e instanceof RuleConflictError) return { ok: false, reason: "conflict" };
    logger.warn("alerts", "rule could not be paused/resumed", e);
    return { ok: false, reason: "unreadable" };
  }

  try {
    const stored = findRule(readRuleStore(), ruleId);
    if (!stored || stored.enabled !== enabled) {
      return { ok: false, reason: "write-failed" };
    }
  } catch (e) {
    logger.warn("alerts", "pause/resume could not be verified", e);
    return { ok: false, reason: "unreadable" };
  }

  return { ok: true, rule: updated };
}

/**
 * Copy the stored rule `ruleId` into a new, paused document.
 *
 * A drawing-bound source keeps its binding: the new rule gets its own anchor
 * entry pointing at the same drawing, with a best-effort rollback of the copy
 * if the ledger write fails. Without that, a duplicated line alert would
 * silently become a fixed-price alert at the level the line had when it was
 * copied — the silent freeze BUG-0498 refuses.
 *
 * The source is never written back. `derived_from_hash` records the canonical
 * source's content hash; `created_at_ms` is the copy's own. The content hash
 * itself is unchanged because only identity, name, arm state and provenance
 * differ.
 */
export function duplicateRule(
  ruleId: string,
  name?: string,
): DuplicateResult {
  let rules: RuleDocument[];
  try {
    rules = readRuleStore();
  } catch (e) {
    logger.warn("alerts", "rules could not be read for duplication", e);
    return { ok: false, reason: "unreadable" };
  }

  const source = findRule(rules, ruleId);
  if (!source) return { ok: false, reason: "unknown" };
  if (isBot(source)) return { ok: false, reason: "bot" };
  if (
    source.action &&
    source.action.consequence_level !== "notify"
  ) {
    // A future `send` rule belongs to the order surface; a copy from the alert
    // list must not duplicate an order intent.
    return { ok: false, reason: "bot" };
  }

  // Keyed by rule id, so an unreadable ledger means "cannot tell whether this
  // rule follows a line"; refusing is the only honest answer.
  const anchors = readDrawingAnchorLedger();
  if (!anchors.present) return { ok: false, reason: "unreadable" };
  const anchor = anchors.ledger[ruleId];

  if (!ruleSchema.isReady()) return { ok: false, reason: "core-unavailable" };

  const now = Date.now();
  let copy: RuleDocument;
  try {
    // Canonicalise first so the lineage hash names a document the core would
    // accept, not a non-canonical spelling of it.
    const canonical = ruleSchema.validate(source);
    const lineageHash = ruleSchema.contentHash(canonical);
    copy = {
      ...canonical,
      id: freeRuleId(takenIds(rules)),
      name: name ?? canonical.name,
      enabled: false,
      provenance: {
        ...canonical.provenance,
        created_at_ms: now,
        derived_from_hash: lineageHash,
      },
    };
    copy = ruleSchema.validate(copy);
  } catch (e) {
    if (e instanceof RuleCoreUnavailableError) {
      return { ok: false, reason: "core-unavailable" };
    }
    if (isRuleRefusedError(e)) return { ok: false, reason: "invalid" };
    logger.warn("alerts", "rule could not be prepared for duplication", e);
    return { ok: false, reason: "invalid" };
  }

  try {
    armRule(copy);
  } catch (e) {
    logger.warn("alerts", "duplicated rule could not be stored", e);
    return { ok: false, reason: "unreadable" };
  }

  // `armRule` does not report a failed `setItem`. Verify before touching the
  // anchor ledger, or a quota failure would leave a binding for a rule that
  // does not exist.
  try {
    if (!findRule(readRuleStore(), copy.id)) {
      return { ok: false, reason: "unreadable" };
    }
  } catch (e) {
    logger.warn("alerts", "duplicated rule could not be verified", e);
    return { ok: false, reason: "unreadable" };
  }

  if (anchor) {
    const written = recordDrawingAnchor(copy.id, {
      drawingId: anchor.drawingId,
      symbol: anchor.symbol,
      createdAtMs: now,
    });
    if (!written.ok) {
      try {
        removeRule(copy.id);
      } catch (e) {
        logger.warn("alerts", "duplicate rollback failed", e);
      }
      return { ok: false, reason: "anchor-failed" };
    }
  }

  return { ok: true, rule: copy };
}
