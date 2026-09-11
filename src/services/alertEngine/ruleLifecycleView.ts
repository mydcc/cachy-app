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
 * FEAT-0393 AC 2 — what Manage should call each alert.
 *
 * Manage lists legacy alerts (`cachy_alerts_v1`), because that is still the
 * store the panel was built on. The lifecycle a trader needs to see lives on
 * the *rule* the alert was migrated into, so this joins the two and answers in
 * the vocabulary the list renders.
 *
 * An expired rule is deliberately **not** disarmed anywhere. Disarming it would
 * drop it into the history list, where every row reads "fired" — which is
 * precisely the confusion AC 2 names: a setup that lapsed untriggered is not a
 * setup that paid off, and a trader deciding whether the level held cannot be
 * told the wrong one.
 */

import { browser } from "$app/environment";
import type { RuleDocument } from "../../lib/rules/types";
import { logger } from "../logger";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { readRuleOriginLedger } from "./ruleOriginLedger";
import { readRuleStates } from "./ruleStateStore";

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
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
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
 * Status per *legacy alert id*, for every alert a rule was migrated from.
 *
 * Alerts with no rule behind them are absent rather than `armed`: the caller
 * distinguishes "this row has nothing to say" from "this row is armed", and an
 * entry invented here would claim knowledge of a lifecycle that does not exist.
 *
 * Computed in one pass over both stores rather than per row: Manage re-derives
 * this whenever the alert list changes, and a per-row read would parse the
 * whole rule set once per alert.
 */
export function alertLifecycleStatuses(nowMs: number = Date.now()): Map<string, AlertLifecycleStatus> {
  const statuses = new Map<string, AlertLifecycleStatus>();

  const entries = readRuleOriginLedger().entries;
  if (Object.keys(entries).length === 0) return statuses;

  const states = readRuleStates();
  const rulesById = new Map<string, RuleDocument>();
  for (const rule of readRules()) {
    if (rule !== null && typeof rule === "object" && typeof rule.id === "string") {
      rulesById.set(rule.id, rule);
    }
  }

  for (const [ruleId, entry] of Object.entries(entries)) {
    const alertId = entry?.alertId;
    if (typeof alertId !== "string") continue;

    const rule = rulesById.get(ruleId);
    if (rule === undefined) continue;

    statuses.set(alertId, lifecycleOf(rule, states[ruleId]?.fired_count ?? 0, nowMs));
  }
  return statuses;
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
