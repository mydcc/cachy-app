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
 * FEAT-0028 — which indicator series a document needs, and under what identity.
 *
 * The evaluator does not compute indicators. `MarketView::indicator_at` reads a
 * map the caller fills, so a document full of indicator conditions evaluates to
 * `indeterminate` until somebody works out *which* series it reads and hands
 * them over. That is what this module answers.
 *
 * Walks the document's own structure rather than asking the core, for the same
 * reason `collectTimeframes` does: this runs once per rule per candle close on
 * the market hot path, and crossing into wasm to enumerate is not worth it. The
 * two must agree — a request missed here reads as "no value", which withholds
 * the verdict rather than faking one.
 *
 * Class A (ADR-0001): a rule document is strategy. Nothing here is logged with
 * its contents or sent anywhere.
 */

import type { IndicatorRef, RuleDocument, TimeframeString } from "./types";

/** One indicator series a document reads, at one timeframe. */
export interface IndicatorRequest {
  indicator: IndicatorRef;
  timeframe: TimeframeString;
}

/** What `output` means when a document leaves it off. Mirrors the core. */
export const DEFAULT_OUTPUT = "value";

/**
 * A stable identity for one requested series.
 *
 * Parameters are sorted by name so that two documents spelling the same
 * indicator in a different key order share one computation. This key never
 * crosses the wasm boundary — the wire format names each series by its full
 * `IndicatorRef` — so it is free to be whatever de-duplicates best here.
 */
export function indicatorKey(
  indicator: IndicatorRef,
  timeframe: TimeframeString,
): string {
  const params = Object.keys(indicator.params ?? {})
    .sort()
    .map((name) => `${name}=${String(indicator.params[name])}`)
    .join(",");
  return `${timeframe}|${indicator.id}|${params}|${indicator.output ?? DEFAULT_OUTPUT}`;
}

/**
 * Every indicator series named anywhere in a document, de-duplicated.
 *
 * De-duplication is the point, not a nicety: twenty rules on the same symbol
 * reading `rsi(14)` on `1h` are one computation per close, not twenty.
 *
 * Reads defensively. A document comes from `localStorage` and may predate any
 * given schema version, so an unexpected shape is skipped rather than thrown
 * on — the caller turns a missing series into an indeterminate verdict, which
 * is the safe direction.
 */
export function collectIndicators(rule: RuleDocument): IndicatorRequest[] {
  const found = new Map<string, IndicatorRequest>();

  const takeOperand = (operand: unknown, timeframe: string, depth = 0): void => {
    if (operand === null || typeof operand !== "object") return;
    // A window nests one level by schema (the core refuses a window of a
    // window), so a bound of two is purely defensive: the document comes
    // from `localStorage` and this collector promises to read defensively.
    if (depth > 2) return;
    const node = operand as {
      kind?: unknown;
      indicator?: unknown;
      of?: unknown;
    };

    // An indicator inside a window needs exactly the series a bare one needs.
    // Missing it would not raise anything: the series would never be computed,
    // `indicator_at` would find no value, and the condition would sit
    // indeterminate for ever — the silent failure ADR-0016 exists to avoid.
    if (node.kind === "window") {
      takeOperand(node.of, timeframe, depth + 1);
      return;
    }

    if (node.kind !== "indicator") return;

    const indicator = node.indicator as IndicatorRef | undefined;
    if (!indicator || typeof indicator.id !== "string") return;

    const key = indicatorKey(indicator, timeframe);
    if (!found.has(key)) found.set(key, { indicator, timeframe });
  };

  const walk = (condition: unknown): void => {
    if (condition === null || typeof condition !== "object") return;
    const node = condition as {
      timeframe?: unknown;
      left?: unknown;
      right?: unknown;
      of?: unknown;
    };

    if (Array.isArray(node.of)) {
      node.of.forEach(walk);
      return;
    }
    if (typeof node.timeframe !== "string") return;

    takeOperand(node.left, node.timeframe);
    takeOperand(node.right, node.timeframe);
  };

  walk(rule.conditions);
  walk(rule.veto);
  return [...found.values()];
}
