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
 * FEAT-0747 — the Manage list's model, kept out of the component.
 *
 * The tab used to prepare one row inline and split it into two hard-coded
 * tabs. It now answers "what is armed, what fired, what is broken?" over an
 * arbitrary number of rules, so the answering has to be testable without
 * mounting a component and the template may not map or filter in `{#each}`.
 *
 * Everything here is pure: rows in, rows out, no storage, no runes. The
 * sentence translator is passed in so the module stays locale-agnostic; the
 * logger is the only ambient dependency, used when a sentence cannot render.
 */

import type {
  AlarmRow,
  AlertLifecycleStatus,
  StoredRule,
} from "../../../services/alertEngine/ruleLifecycleView";
import type { ShadowFiringRecord } from "../../../services/alertEngine/shadowLedger";
import { SHADOW_LEDGER_MAX_RECORDS } from "../../../services/alertEngine/shadowLedger";
import type { SentenceTranslator } from "../../../lib/rules/ruleSentence";
import { logger } from "../../../services/logger";
import { renderRuleSentence } from "../../../lib/rules/ruleSentence";
import type { EvaluationMode, RuleDocument } from "../../../lib/rules/types";
import type { TranslationKey } from "../../../locales/schema";

/**
 * The condition shapes this list can phrase.
 *
 * `renderRuleSentence` dereferences the condition graph, so the guard only
 * proves the outermost shape; `sentenceFor` catches the rest per row rather
 * than letting one hand-edited rule take the whole list down.
 */
const PHRASABLE_KINDS = new Set([
  "compare",
  "cross",
  "pattern",
  "position",
  "account",
  "group",
]);

/**
 * What kind of rule a row is.
 *
 * A drawing alert is an ordinary constant-threshold rule whose threshold is
 * rewritten from the drawing (`drawingAnchors.ts`), so it can only be told
 * apart by the anchor ledger — hence `isDrawing` is passed in rather than
 * guessed from the condition.
 */
export type AlertKind =
  | "price"
  | "indicator"
  | "pattern"
  | "combo"
  | "position"
  | "account"
  | "drawing"
  | "unknown";

/** Which ordering the list applies. */
export type ManageSort = "symbol" | "last-fired" | "expiry";

/** The order the status chips appear in, and their labels. */
export const STATUS_OPTIONS: readonly AlertLifecycleStatus[] = [
  "armed",
  "suspended",
  "expired",
  "fired",
];

export const STATUS_KEYS: Record<AlertLifecycleStatus, TranslationKey> = {
  armed: "dashboard.alerts.manageList.status.armed",
  expired: "dashboard.alerts.expired",
  suspended: "dashboard.alerts.suspended",
  fired: "dashboard.alerts.fired",
};

/** The order the type chips appear in, and their labels. */
export const KIND_OPTIONS: readonly AlertKind[] = [
  "price",
  "indicator",
  "pattern",
  "combo",
  "drawing",
  "position",
  "account",
  "unknown",
];

export const KIND_KEYS: Record<AlertKind, TranslationKey> = {
  price: "dashboard.alerts.manageList.kind.price",
  indicator: "dashboard.alerts.manageList.kind.indicator",
  pattern: "dashboard.alerts.manageList.kind.pattern",
  combo: "dashboard.alerts.manageList.kind.combo",
  position: "dashboard.alerts.manageList.kind.position",
  account: "dashboard.alerts.manageList.kind.account",
  drawing: "dashboard.alerts.manageList.kind.drawing",
  unknown: "dashboard.alerts.manageList.kind.unknown",
};

/** Multi-select filters. An empty array means "this group does not filter". */
export interface ManageFilters {
  status: readonly AlertLifecycleStatus[];
  kind: readonly AlertKind[];
  timeframe: readonly string[];
  evaluation: readonly EvaluationMode[];
}

export const NO_FILTERS: ManageFilters = Object.freeze({
  status: [],
  kind: [],
  timeframe: [],
  evaluation: [],
});

/** One row, with everything the template renders already prepared. */
export interface ManageRow extends AlarmRow {
  /** Null when the renderer cannot phrase this rule; the row still exists. */
  sentence: string | null;
  kind: AlertKind;
  timeframe: string;
  /** The stored value, kept raw so an unknown one can be shown verbatim. */
  evaluation: string;
  /** The stored value, kept raw so an unknown one can be shown verbatim. */
  frequency: string;
  validUntilMs: number | null;
  /** Wall clock of the most recent announcement, from the firing ledger. */
  lastFiredAtMs: number | null;
}

/** One Log entry: an announcement, or a fire the ledger predates. */
export interface FiringEntry {
  ruleId: string;
  symbol: string;
  timeframe: string;
  /** Wall clock of the announcement; null for a state-only fallback. */
  recordedAtMs: number | null;
  /** Open time of the candle the verdict was computed on. */
  anchorMs: number | null;
  verdict: string | null;
  /** The rule's current name, or null when the rule has none. */
  ruleName: string | null;
  /**
   * Whether the rule still exists, independently of its name.
   *
   * An unnamed rule (`name: ""`, the arming default) is not a deleted one; the
   * log shows its id and keeps the open link while it is still in the store.
   */
  ruleExists: boolean;
}

function isOperand(value: unknown): value is { kind?: unknown; of?: unknown } {
  return value !== null && typeof value === "object";
}

function mentionsIndicator(condition: Record<string, unknown>): boolean {
  return [condition.left, condition.right, condition.of].some(
    (operand) => isOperand(operand) && operand.kind === "indicator",
  );
}

export function kindOf(rule: StoredRule, isDrawing: boolean): AlertKind {
  if (isDrawing) return "drawing";

  const conditions = rule.conditions as { kind?: unknown } | null | undefined;
  if (!conditions || typeof conditions !== "object" || typeof conditions.kind !== "string") {
    return "unknown";
  }

  const condition = conditions as unknown as Record<string, unknown>;
  switch (conditions.kind) {
    case "pattern":
      return "pattern";
    case "group":
      return "combo";
    case "position":
      return "position";
    case "account":
      return "account";
    case "compare":
    case "cross":
      return mentionsIndicator(condition) ? "indicator" : "price";
    default:
      return "unknown";
  }
}

/**
 * The row's sentence, or null when it cannot be phrased.
 *
 * A pre-`action` legacy rule meant `notify`, so the display copy gets the same
 * fill `loadForEdit` applies rather than losing its detail. A failed render is
 * one row without a sentence, not an empty list.
 */
export function sentenceFor(rule: StoredRule, translator: SentenceTranslator): string | null {
  const conditions = rule.conditions as { kind?: unknown } | null | undefined;
  if (
    !conditions ||
    typeof conditions !== "object" ||
    typeof conditions.kind !== "string" ||
    !PHRASABLE_KINDS.has(conditions.kind)
  ) {
    return null;
  }

  try {
    const display = (
      rule.action ? rule : { ...rule, action: { consequence_level: "notify" } }
    ) as RuleDocument;
    return renderRuleSentence(display, translator);
  } catch (e) {
    // Not user-facing: the row simply has no sentence. Logged because the
    // alternative is a silent feature regression on every affected row.
    logger.warn("alerts", "Could not render a rule sentence", e);
    return null;
  }
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildManageRows(
  rows: readonly AlarmRow[],
  drawingRuleIds: ReadonlySet<string>,
  translator: SentenceTranslator,
  lastFiringById: ReadonlyMap<string, number>,
): ManageRow[] {
  return rows.map((row) => {
    const rule = row.rule;
    const evaluation =
      typeof rule.evaluation_mode === "string" ? rule.evaluation_mode : "close";
    return {
      ...row,
      sentence: sentenceFor(rule, translator),
      kind: kindOf(rule, drawingRuleIds.has(row.id)),
      timeframe: typeof rule.trigger_timeframe === "string" ? rule.trigger_timeframe : "",
      evaluation,
      frequency: typeof rule.frequency === "string" ? rule.frequency : "once",
      validUntilMs: finiteOrNull(rule.valid_until_ms),
      lastFiredAtMs: lastFiringById.get(row.id) ?? null,
    };
  });
}

/** Case-insensitive over symbol, rule name and note. */
export function matchesQuery(row: ManageRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;

  // A hand-edited store can hold a number or null where a string belongs; the
  // search must not take the whole list down with it.
  return [row.symbol, row.rule.name, row.note]
    .map((value) => (typeof value === "string" ? value : ""))
    .some((value) => value.toLowerCase().includes(needle));
}

function matchesGroup<T>(selected: readonly T[], value: T): boolean {
  return selected.length === 0 || selected.includes(value);
}

/** All groups compose with AND; inside one group the selected values are OR. */
export function filterManageRows(
  rows: readonly ManageRow[],
  filters: ManageFilters,
  query: string,
): ManageRow[] {
  return rows.filter(
    (row) =>
      matchesQuery(row, query) &&
      matchesGroup(filters.status, row.status) &&
      matchesGroup(filters.kind, row.kind) &&
      matchesGroup(filters.timeframe, row.timeframe) &&
      // Raw, so an unknown mode is never silently counted as "close".
      matchesGroup(filters.evaluation, row.evaluation),
  );
}

export function sortManageRows(rows: readonly ManageRow[], sort: ManageSort): ManageRow[] {
  const sorted = [...rows];

  sorted.sort((a, b) => {
    if (sort === "last-fired") {
      const delta = (b.lastFiredAtMs ?? -1) - (a.lastFiredAtMs ?? -1);
      if (delta !== 0) return delta;
    } else if (sort === "expiry") {
      const delta = (a.validUntilMs ?? Number.POSITIVE_INFINITY) -
        (b.validUntilMs ?? Number.POSITIVE_INFINITY);
      if (delta !== 0) return delta;
    }

    const symbolA = typeof a.symbol === "string" ? a.symbol : "";
    const symbolB = typeof b.symbol === "string" ? b.symbol : "";
    const bySymbol = symbolA.localeCompare(symbolB);
    if (bySymbol !== 0) return bySymbol;
    return String(a.id).localeCompare(String(b.id));
  });

  return sorted;
}

/** Distinct timeframes for the filter chips, in their natural order. */
export function timeframeOptions(rows: readonly ManageRow[]): string[] {
  return [...new Set(rows.map((row) => row.timeframe).filter((value) => value !== ""))].sort();
}

/** The most recent wall clock per rule, from the ledger's rule records. */
export function lastFiringByRule(
  records: readonly ShadowFiringRecord[],
): ReadonlyMap<string, number> {
  const latest = new Map<string, number>();

  for (const record of records) {
    if (record.source !== "rule") continue;
    const previous = latest.get(record.id);
    if (previous === undefined || record.recordedAtMs > previous) {
      latest.set(record.id, record.recordedAtMs);
    }
  }

  return latest;
}

/**
 * The Log tab: what was announced, newest first.
 *
 * Two sources, deliberately: the ledger is the record of *announcements*, and
 * a rule whose `fired_count` predates the ledger (or whose ledger write failed)
 * still appears from its last anchor. The ledger entry wins because it carries
 * the wall clock and the verdict; the fallback says so by leaving both null.
 *
 * A deleted rule keeps its ledger entries — deleting a rule is not asking to
 * erase the evidence that it fired. Its name is gone, so the entry shows the
 * id; the symbol survives because the ledger recorded it.
 */
export function buildFiringLog(
  records: readonly ShadowFiringRecord[],
  rows: readonly ManageRow[],
): FiringEntry[] {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const announced = new Set<string>();

  const ledgerEntries: FiringEntry[] = [];

  for (const record of records) {
    if (record.source !== "rule") continue;
    announced.add(record.id);
    const row = rowById.get(record.id);
    ledgerEntries.push({
      ruleId: record.id,
      symbol: record.symbol,
      timeframe: record.timeframe ?? row?.timeframe ?? "",
      recordedAtMs: record.recordedAtMs,
      anchorMs: finiteOrNull(record.anchorMs),
      verdict: record.verdict ?? null,
      ruleName: row?.rule.name?.trim() || null,
      ruleExists: row !== undefined,
    });
  }

  const fallbackEntries: FiringEntry[] = [];
  for (const row of rows) {
    if (row.firedCount <= 0 || announced.has(row.id)) continue;
    fallbackEntries.push({
      ruleId: row.id,
      symbol: row.symbol,
      timeframe: row.timeframe,
      recordedAtMs: null,
      anchorMs: row.lastFiredAnchorMs,
      verdict: null,
      ruleName: row.rule.name?.trim() || null,
      ruleExists: true,
    });
  }

  const byNewestFirst = (a: FiringEntry, b: FiringEntry) => {
    const wallClockA = a.recordedAtMs ?? Number.NEGATIVE_INFINITY;
    const wallClockB = b.recordedAtMs ?? Number.NEGATIVE_INFINITY;
    if (wallClockA !== wallClockB) return wallClockB - wallClockA;
    return (b.anchorMs ?? Number.NEGATIVE_INFINITY) - (a.anchorMs ?? Number.NEGATIVE_INFINITY);
  };

  ledgerEntries.sort(byNewestFirst);
  fallbackEntries.sort(byNewestFirst);

  /*
   * The cap applies to ledger records, which is what its label promises. The
   * fallbacks are recovered fires whose ledger write never happened; slicing
   * after merging would discard exactly those first, because they sort last.
   */
  return [...ledgerEntries.slice(0, SHADOW_LEDGER_MAX_RECORDS), ...fallbackEntries];
}
