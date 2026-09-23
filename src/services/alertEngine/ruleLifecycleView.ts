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
 * FEAT-0393 AC 2 — what Manage should call each alarm.
 *
 * Manage used to list legacy alerts (`cachy_alerts_v1`) and join the lifecycle
 * in from the rule each was migrated into. FEAT-0399 removed that store, and
 * with it a gap nobody had closed: the panel has armed *rules* since FEAT-0389,
 * so an alarm armed there was never in the legacy store and never appeared in
 * the list at all. `alarmRows()` reads the rule set directly, which is both the
 * store that is written and the store that is evaluated.
 *
 * An expired rule is deliberately **not** disarmed anywhere. Disarming it would
 * drop it into the history list, where every row reads "fired" — which is
 * precisely the confusion AC 2 names: a setup that lapsed untriggered is not a
 * setup that paid off, and a trader deciding whether the level held cannot be
 * told the wrong one.
 */

import { browser } from "$app/environment";
import type { CompareOp, RuleDocument } from "../../lib/rules/types";
import { logger } from "../logger";
import { isBot } from "./botStore";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { readRuleStates } from "./ruleStateStore";
import { safeLocalStorage } from "../../utils/storageWrapper";

/**
 * The stored rule set, read here rather than through `ruleLoopWiring`.
 *
 * That module's reader is identical, but it is the market store's neighbour and
 * drags `marketState`, the toast service and the mark-candle cache in with it.
 * A badge on a list row does not get to pull the market hot path into the
 * panel's import graph, and `alerts.svelte.ts` code-splits that module away for
 * exactly this reason.
 */
function readRules(): RuleDocument[] {
  if (!browser) return [];

  try {
    const raw = safeLocalStorage.getItem(RULES_STORAGE_KEY);
    if (raw === null) return [];

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RuleDocument[]) : [];
  } catch (e) {
    logger.error("alerts", "[Lifecycle] Reading stored rules failed", e);
    return [];
  }
}

/**
 * What a trader should read on the row.
 *
 * `armed` is the ordinary case and carries no badge — a list where every row
 * is labelled is a list where no label is read.
 */
export type AlertLifecycleStatus = "armed" | "expired" | "fired";

/**
 * One row per stored rule, in the vocabulary Manage renders.
 *
 * Built in a single pass over the rule set and the state store rather than
 * per row: the list re-derives whenever the rule set changes, and a per-row
 * read would parse both stores once per alarm.
 *
 * A rule whose `conditions` are not a plain price comparison still gets a row
 * with no threshold rather than being hidden. A trader who armed something the
 * list cannot phrase must still be able to see and delete it — silently
 * dropping it would be the same silence FEAT-0399 exists to remove.
 *
 * Bots are the one thing filtered out, because a bot is not an alarm. FEAT-0396
 * stores them in this same key as rules with `consequence_level: "simulate"`,
 * and the Automation tab is where they are managed — a bot listed here would
 * carry a delete button that removes a strategy from the wrong surface. The
 * test is `!isBot`, never a positive test for `"notify"`: a migrated legacy
 * alert has no `action` at all, so asking what a rule *is* would hide it.
 */
export interface AlarmRow {
  /** Rule id — what the delete button acts on. */
  id: string;
  symbol: string;
  op?: CompareOp;
  threshold?: string;
  status: AlertLifecycleStatus;
  /** False for a rule that fired and disarmed, or one the trader turned off. */
  enabled: boolean;
  note?: string;
}

export function alarmRows(nowMs: number = Date.now()): AlarmRow[] {
  const states = readRuleStates();

  return readRules()
    .filter((rule): rule is RuleDocument => rule !== null && typeof rule === "object" && typeof rule.id === "string")
    .filter((rule) => !isBot(rule))
    .map((rule) => {
      const compare =
        rule.conditions !== null &&
        typeof rule.conditions === "object" &&
        (rule.conditions as { kind?: unknown }).kind === "compare"
          ? (rule.conditions as { op?: CompareOp; right?: { value?: unknown } })
          : undefined;
      const value = compare?.right?.value;

      return {
        id: rule.id,
        symbol: rule.symbol,
        op: compare?.op,
        threshold: typeof value === "string" ? value : undefined,
        status: lifecycleOf(rule, states[rule.id]?.fired_count ?? 0, nowMs),
        enabled: rule.enabled !== false,
        note: rule.note?.trim() || undefined,
      };
    });
}

/**
 * Fired beats expired.
 *
 * A rule that announced itself and *then* ran past its validity period did its
 * job; calling that "expired" would tell the trader an alarm they heard never
 * happened. Only a rule that lapsed with nothing to show is expired — which is
 * exactly what `Verdict::Expired` means in the core.
 */
export function lifecycleOf(rule: RuleDocument, firedCount: number, nowMs: number): AlertLifecycleStatus {
  if (firedCount > 0) return "fired";

  const validUntil = rule.valid_until_ms;
  if (typeof validUntil === "number" && Number.isFinite(validUntil) && nowMs > validUntil) {
    return "expired";
  }
  return "armed";
}
