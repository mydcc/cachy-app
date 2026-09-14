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
 * BUG-0444 — one condition read as the Price builder's form, or `null`.
 *
 * Its own module for the reason `indicatorFormLeaf.ts` is: two readers must
 * agree on it exactly, and it imports neither of them.
 *
 * - `conditionSlots.slotOf` decides whether the price builder claims a
 *   condition, and
 * - `readPriceForm` hydrates the builder from the claimed one.
 *
 * The builder lives here too, and that is the point. A claim used to be a list
 * of operand kinds, and the reader added constraints of its own on top (only
 * `gte`/`lte`), so a condition could be claimed that the tab then hydrated
 * blank and deleted on mount. The field and the series were not read at all, so
 * a mark-price condition was claimed and rewritten as a last-price one.
 *
 * Instead of mirroring each constraint, `priceReadingOf` reads a candidate form
 * and asks the builder to write it back: the condition is claimed only when the
 * rebuild is the same condition. A constraint added to the builder later
 * narrows the claim with it, with nobody having to remember to.
 */

import Decimal from "decimal.js";
import type {
  Condition,
  PriceField,
  PriceSource,
  TimeframeString,
} from "../rules/types";

export type PriceConditionKind =
  "rises_above" | "falls_below" | "rise_reaches" | "fall_reaches";

export interface PriceFormState {
  kind: PriceConditionKind;
  /** The threshold as typed, so a half-entered "60." is never mangled. */
  threshold: string;
  lookback: number;
}

/**
 * Everything the builder needs to write a condition.
 *
 * `field` and `source` are panel state (`alertPanelState.priceField`,
 * `priceSeries`) rather than form state, but a condition carries its own copy,
 * so reading one back has to return them.
 */
export interface PriceReading {
  form: PriceFormState;
  field: PriceField;
  source: PriceSource;
}

/**
 * The number as a decimal, or `null` while it is not one yet. `Decimal` throws
 * on unparseable input, and this runs on every keystroke.
 */
export function parsePriceThreshold(raw: string): Decimal | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    const value = new Decimal(trimmed);
    return value.isFinite() ? value : null;
  } catch {
    return null;
  }
}

/**
 * The condition a reading describes, or `null` when it is not usable yet.
 * Never throws: the panel rebuilds on every edit.
 *
 * Thresholds are written with `toFixed()`, never `toString()`, which switches to
 * `1.23456789e-7` below 1e-7: that spelling would travel into the content hash
 * and on to a core that expects plain decimal strings.
 */
export function buildPriceCondition(
  { form, field, source }: PriceReading,
  timeframe: TimeframeString,
): Condition | null {
  const value = parsePriceThreshold(form.threshold);
  if (value === null) return null;

  // `source` is left off entirely for the last series, so a rule that reads it
  // serialises exactly as it did before this field existed and keeps its hash.
  const seriesPart = source === "mark" ? { source } : {};

  if (form.kind === "rises_above" || form.kind === "falls_below") {
    // A negative or zero price is not a level anything crosses.
    if (value.lte(0)) return null;
    return {
      kind: "cross",
      left: { kind: "price", field, ...seriesPart },
      direction: form.kind === "rises_above" ? "above" : "below",
      right: { kind: "constant", value: value.toFixed() },
      timeframe,
    };
  }

  // A move of zero percent is every candle, which is an alarm that never stops
  // rather than one that never fires.
  if (value.lte(0)) return null;
  if (!Number.isInteger(form.lookback) || form.lookback < 1) return null;

  const signed = form.kind === "rise_reaches" ? value : value.negated();
  return {
    kind: "compare",
    left: { kind: "percent_change", field, ...seriesPart, lookback: form.lookback },
    op: form.kind === "rise_reaches" ? "gte" : "lte",
    right: { kind: "constant", value: signed.toFixed() },
    timeframe,
  };
}

/**
 * The reading the builder would rebuild `condition` from, or `null` when no
 * reading rebuilds it exactly.
 */
export function priceReadingOf(condition: Condition): PriceReading | null {
  if (condition.kind !== "cross" && condition.kind !== "compare") return null;
  const candidate = candidateReading(condition);
  if (candidate === null) return null;
  const rebuilt = buildPriceCondition(candidate, condition.timeframe);
  if (rebuilt === null) return null;
  return canonicalJson(rebuilt) === canonicalJson(condition) ? candidate : null;
}

/** A reading from the operand shapes alone; `priceReadingOf` checks it. */
function candidateReading(
  condition: Extract<Condition, { kind: "cross" | "compare" }>,
): PriceReading | null {
  if (condition.right.kind !== "constant") return null;
  const threshold = displayThreshold(condition.right.value);

  if (condition.kind === "cross" && condition.left.kind === "price") {
    return {
      form: {
        kind: condition.direction === "above" ? "rises_above" : "falls_below",
        threshold,
        lookback: 1,
      },
      field: condition.left.field,
      source: condition.left.source ?? "last",
    };
  }

  if (condition.kind === "compare" && condition.left.kind === "percent_change") {
    // A fall is written as the rise operand against a negative threshold, so
    // reading it back takes the sign off again: the trader typed a positive 5.
    // A sign that does not match the operator fails the rebuild check.
    const magnitude = threshold.startsWith("-") ? threshold.slice(1) : threshold;
    return {
      form: {
        kind: condition.op === "lte" ? "fall_reaches" : "rise_reaches",
        threshold: magnitude,
        lookback: condition.left.lookback,
      },
      field: condition.left.field,
      source: condition.left.source ?? "last",
    };
  }

  return null;
}

/**
 * A threshold for display: plain digits, trailing zeros dropped. An unparseable
 * value is passed through, so the rebuild check refuses it instead of the form
 * showing a blank.
 */
function displayThreshold(raw: string): string {
  return parsePriceThreshold(raw)?.toFixed() ?? raw;
}

/**
 * JSON with sorted keys and every constant spelled canonically, for comparison
 * only. "60000.00" and "60000" are the same level, so a rule spelled the long
 * way is still this builder's.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key): [string, unknown] => {
      const isConstantValue =
        key === "value" && record.kind === "constant" && typeof record.value === "string";
      if (isConstantValue) return [key, displayThreshold(record.value as string)];
      return [key, canonicalise(record[key])];
    });
  return Object.fromEntries(entries);
}
