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
 * FEAT-0819 stage 5 + FEAT-0820 — pure Decimal preview, ATR spacing suggestion,
 * and chart level derivation for grid bots.
 *
 * Pure functions over `Decimal` and rule/candle types; imports zero stores and
 * zero services so both editor surfaces and chart views share one exact model.
 */

import { Decimal } from "decimal.js";

import {
  gridExposure,
  gridLines,
  gridSlots,
  gridWorstCase,
  minimumViableSpacing,
  narrowestSpacing,
  type GridExposure,
  type GridLadderRefusal,
  type GridSlot,
  type GridWorstCase,
} from "./gridLadder";
import { computeIndicatorSeries } from "../rules/indicatorSeries";
import type {
  Condition,
  EvaluationCandle,
  GridDocument,
  GridSide,
  GridSpacing,
  TimeframeString,
} from "../rules/types";

export const MIN_GRID_LEVEL_COUNT = 2;
export const MAX_GRID_LEVEL_COUNT = 100;
export const DEFAULT_GRID_ATR_PERIOD = 14;

export interface ParsedGridClientId {
  gridId: string;
  slotIndex: number;
  leg: "open" | "close";
}

const GRID_CLIENT_ID_RE = /^grid:(.+):s(\d+):(open|close)$/;

/** Parse deterministic `grid:<gridId>:s<slotIndex>:(open|close)` client IDs. */
export function parseGridOrderClientId(
  clientOrderId: string | undefined | null,
): ParsedGridClientId | null {
  if (typeof clientOrderId !== "string") return null;
  const match = GRID_CLIENT_ID_RE.exec(clientOrderId);
  if (!match) return null;
  const slotIndex = Number(match[2]); // audit: safe — regex-verified integer slot index, not a financial value
  if (!Number.isSafeInteger(slotIndex) || slotIndex < 0) return null;
  return {
    gridId: match[1],
    slotIndex,
    leg: match[3] as "open" | "close",
  };
}

export interface GridPreviewInput {
  side: GridSide;
  lowerPrice: string;
  upperPrice: string;
  levelCount: number;
  spacing: GridSpacing;
  budgetAmount: string;
  stopOut: readonly Condition[];
  feeRate: Decimal;
  accountEquity: Decimal;
  priceStep?: Decimal;
  quantityStep?: Decimal;
}

export interface GridPreviewSuccess {
  ok: true;
  lines: Decimal[];
  slots: GridSlot[];
  effectiveLower: Decimal;
  effectiveUpper: Decimal;
  lowerMovedInward: boolean;
  upperMovedInward: boolean;
  narrowestSpacingPct: Decimal | null;
  minViableSpacingPct: Decimal | null;
  spacingBelowFee: boolean;
  exposure: GridExposure;
  stopOutPrice: Decimal | null;
  worstCase: GridWorstCase | null;
  worstCaseSharePct: Decimal | null;
}

export type GridPreviewResult =
  | GridPreviewSuccess
  | { ok: false; reason: GridLadderRefusal };

function parsePositiveDecimal(raw: string): Decimal | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    const d = new Decimal(trimmed);
    return d.isFinite() && d.gt(0) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Extract a protective stop-out price threshold from `stop_out` conditions when
 * one is stated directly as a price comparison or cross against a constant.
 *
 * Returns `null` when all `stop_out` conditions are non-price conditions
 * (e.g. RSI, ADX, or account unrealized PnL), so the UI can state honestly
 * why a price-anchored worst-case loss requires a price stop-out.
 */
export function extractStopOutPrice(
  side: GridSide,
  conditions: readonly Condition[],
): Decimal | null {
  const candidates: Decimal[] = [];

  const visit = (cond: Condition): void => {
    if (cond.kind === "compare") {
      if (cond.left.kind === "price" && cond.right.kind === "constant") {
        const val = parsePositiveDecimal(cond.right.value);
        if (val !== null) candidates.push(val);
      } else if (cond.right.kind === "price" && cond.left.kind === "constant") {
        const val = parsePositiveDecimal(cond.left.value);
        if (val !== null) candidates.push(val);
      }
      return;
    }
    if (cond.kind === "cross") {
      if (cond.left.kind === "price" && cond.right.kind === "constant") {
        const val = parsePositiveDecimal(cond.right.value);
        if (val !== null) candidates.push(val);
      } else if (cond.right.kind === "price" && cond.left.kind === "constant") {
        const val = parsePositiveDecimal(cond.left.value);
        if (val !== null) candidates.push(val);
      }
      return;
    }
    if (cond.kind === "group") {
      for (const child of cond.of) visit(child);
    }
  };

  for (const c of conditions) visit(c);
  if (candidates.length === 0) return null;

  // Any one stop_out holding triggers the stop-out (`stop_out` is OR-joined at top level).
  // For worst-case loss across multiple price thresholds, pick the furthest protective level
  // (lowest price for long, highest price for short) so worst-case loss is never understated.
  let chosen = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (side === "long" ? candidates[i].lt(chosen) : candidates[i].gt(chosen)) {
      chosen = candidates[i];
    }
  }
  return chosen;
}

/**
 * Compute the pre-start ladder preview: inward bound rounding, fee-vs-spacing
 * viability, budget/fee reserve, and worst-case stop-out loss.
 */
export function computeGridPreview(input: GridPreviewInput): GridPreviewResult {
  const lower = parsePositiveDecimal(input.lowerPrice);
  const upper = parsePositiveDecimal(input.upperPrice);
  const budget = parsePositiveDecimal(input.budgetAmount);
  if (lower === null || upper === null || budget === null) {
    return { ok: false, reason: "invalid-input" };
  }
  if (
    !Number.isInteger(input.levelCount) ||
    input.levelCount < MIN_GRID_LEVEL_COUNT ||
    input.levelCount > MAX_GRID_LEVEL_COUNT
  ) {
    return { ok: false, reason: "invalid-range" };
  }

  const linesRes = gridLines(
    {
      lower,
      upper,
      levelCount: input.levelCount,
      spacing: input.spacing,
    },
    input.priceStep,
  );
  if (!linesRes.ok) return linesRes;

  const lines = linesRes.value;
  const effectiveLower = lines[0];
  const effectiveUpper = lines[lines.length - 1];
  const lowerMovedInward = effectiveLower.gt(lower);
  const upperMovedInward = effectiveUpper.lt(upper);

  const slotsRes = gridSlots(input.side, lines, budget, input.quantityStep);
  if (!slotsRes.ok) return slotsRes;

  const narrowest = narrowestSpacing(lines);
  const minViable = minimumViableSpacing(input.feeRate);
  const spacingBelowFee =
    narrowest !== null && minViable !== null && narrowest.lte(minViable);

  const exposure = gridExposure(slotsRes.value, input.feeRate);
  const stopOutPrice = extractStopOutPrice(input.side, input.stopOut);
  let worstCase: GridWorstCase | null = null;
  if (stopOutPrice !== null) {
    const wcRes = gridWorstCase(
      input.side,
      slotsRes.value,
      stopOutPrice,
      input.feeRate,
      input.accountEquity,
    );
    if (wcRes.ok) worstCase = wcRes.value;
  }

  return {
    ok: true,
    lines,
    slots: slotsRes.value,
    effectiveLower,
    effectiveUpper,
    lowerMovedInward,
    upperMovedInward,
    narrowestSpacingPct: narrowest !== null ? narrowest.times(100) : null,
    minViableSpacingPct: minViable !== null ? minViable.times(100) : null,
    spacingBelowFee,
    exposure,
    stopOutPrice,
    worstCase,
    worstCaseSharePct:
      worstCase?.shareOfAccount !== null && worstCase?.shareOfAccount !== undefined
        ? worstCase.shareOfAccount.times(100)
        : null,
  };
}

export interface GridAtrSuggestion {
  atr: Decimal;
  suggestedLevels: number;
  stepAmount: Decimal;
}

/**
 * Derive an optional ATR-based level count suggestion from existing closed
 * candles on the normative JS indicator path (`computeIndicatorSeries`).
 *
 * Returns `null` when candles have not warmed up ATR yet or the range is invalid.
 * Never mutates form state; the trader explicitly accepts the suggestion.
 */
export function suggestGridLevelsFromAtr(input: {
  lowerPrice: string;
  upperPrice: string;
  spacing: GridSpacing;
  timeframe: TimeframeString;
  candles: readonly EvaluationCandle[];
  feeRate: Decimal;
  period?: number;
}): GridAtrSuggestion | null {
  const lower = parsePositiveDecimal(input.lowerPrice);
  const upper = parsePositiveDecimal(input.upperPrice);
  if (lower === null || upper === null || upper.lte(lower)) return null;
  const period = input.period ?? DEFAULT_GRID_ATR_PERIOD;
  if (input.candles.length < period) return null;

  const series = computeIndicatorSeries(
    {
      indicator: { id: "atr", params: { period } },
      timeframe: input.timeframe,
    },
    input.candles,
  );
  if (!series.supported) return null;

  let latestAtr: Decimal | null = null;
  for (let i = series.values.length - 1; i >= 0; i--) {
    const v = series.values[i];
    if (v !== null) {
      const parsed = parsePositiveDecimal(v);
      if (parsed !== null) {
        latestAtr = parsed;
        break;
      }
    }
  }
  if (latestAtr === null) return null;

  const span = upper.minus(lower);
  const rawLevels = span.div(latestAtr).floor();
  const clampedNumeric = Decimal.min(
    MAX_GRID_LEVEL_COUNT,
    Decimal.max(MIN_GRID_LEVEL_COUNT, rawLevels),
  ).toNumber(); // audit: safe — integer level count clamped to [2, 100], not money

  let candidate = clampedNumeric;
  const minViable = minimumViableSpacing(input.feeRate);
  if (minViable !== null && minViable.gt(0)) {
    while (candidate > MIN_GRID_LEVEL_COUNT) {
      const checkLines = gridLines({
        lower,
        upper,
        levelCount: candidate,
        spacing: input.spacing,
      });
      if (!checkLines.ok) {
        candidate -= 1;
        continue;
      }
      const narrowest = narrowestSpacing(checkLines.value);
      if (narrowest !== null && narrowest.gt(minViable)) break;
      candidate -= 1;
    }
  }

  return {
    atr: latestAtr,
    suggestedLevels: candidate,
    stepAmount: span.div(candidate),
  };
}

export interface GridChartLevelDescriptor {
  id: string;
  gridId: string;
  gridName: string;
  levelIndex: number;
  price: Decimal;
  filled: boolean;
}

/**
 * Compute read-only horizontal chart levels for an active or paused grid.
 *
 * Returns `[]` when the grid is stopped (`"closed"` / `"stopping"`), not yet
 * started (`"armed"`), or `account_unavailable`, so stopping a grid removes
 * its lines immediately.
 */
export function deriveGridChartLevels(input: {
  grid: GridDocument;
  status: string;
  openSlots?: readonly number[];
  restingClientIds?: ReadonlySet<string>;
  priceStep?: Decimal;
}): GridChartLevelDescriptor[] {
  if (input.status !== "active" && input.status !== "paused") {
    return [];
  }

  let lower: Decimal;
  let upper: Decimal;
  try {
    lower = new Decimal(input.grid.lower_price);
    upper = new Decimal(input.grid.upper_price);
  } catch {
    return [];
  }

  const linesRes = gridLines(
    {
      lower,
      upper,
      levelCount: input.grid.level_count,
      spacing: input.grid.spacing,
    },
    input.priceStep,
  );
  if (!linesRes.ok) return [];

  const filledSlots = new Set<number>(input.openSlots ?? []);
  if (input.restingClientIds) {
    for (const cid of input.restingClientIds) {
      const parsed = parseGridOrderClientId(cid);
      if (parsed && parsed.gridId === input.grid.id && parsed.leg === "close") {
        filledSlots.add(parsed.slotIndex);
      }
    }
  }

  // A long slot `i` opens on `lines[i]`; a short slot `i` opens on `lines[i + 1]`.
  const filledLineIndices = new Set<number>();
  for (const slotIdx of filledSlots) {
    const lineIdx = input.grid.side === "long" ? slotIdx : slotIdx + 1;
    if (lineIdx >= 0 && lineIdx < linesRes.value.length) {
      filledLineIndices.add(lineIdx);
    }
  }

  return linesRes.value.map((price, index) => ({
    id: `grid-line:${input.grid.id}:${index}`,
    gridId: input.grid.id,
    gridName: input.grid.name,
    levelIndex: index,
    price,
    filled: filledLineIndices.has(index),
  }));
}
