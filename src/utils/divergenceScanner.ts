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

/*
 * Copyright (C) 2026 MYDCT
 *
 * Divergence Scanner
 * Detects Regular and Hidden Divergences between Price and Indicators.
 */

import { Decimal } from "decimal.js";
import type { Kline, NumberArray } from "./indicators";

export type DivergenceType = "Regular" | "Hidden";
export type DivergenceSide = "Bullish" | "Bearish";

export interface DivergenceResult {
  indicator: string;
  type: DivergenceType;
  side: DivergenceSide;
  startIdx: number; // Index of the first pivot (older)
  endIdx: number; // Index of the second pivot (newer)
  priceStart: number;
  priceEnd: number;
  indStart: number;
  indEnd: number;
}

interface Pivot {
  index: number;
  value: number;
  type: "High" | "Low";
}

export class DivergenceScanner {
  // Lookback for pivot detection (e.g. 5 means 5 bars left and 5 bars right must be lower/higher)
  // But for real-time scanning we often look at "confirmed" pivots which are naturally lagged.
  // Simple pivot: High > N bars left & High > N bars right.

  static findPivots(values: NumberArray, range: number = 2): Pivot[] {
    const pivots: Pivot[] = [];
    if (values.length < range * 2 + 1) return pivots;

    for (let i = range; i < values.length - range; i++) {
      const current = values[i];

      // Check High
      let isHigh = true;
      for (let j = 1; j <= range; j++) {
        if (values[i - j] > current || values[i + j] > current) {
          isHigh = false;
          break;
        }
      }
      if (isHigh) pivots.push({ index: i, value: current, type: "High" });

      // Check Low
      let isLow = true;
      for (let j = 1; j <= range; j++) {
        if (values[i - j] < current || values[i + j] < current) {
          isLow = false;
          break;
        }
      }
      if (isLow) pivots.push({ index: i, value: current, type: "Low" });
    }
    return pivots;
  }

  /**
   * Scans for divergences.
   * @param priceData Highs (for Bearish) or Lows (for Bullish) usually, or Closes.
   * @param indicatorData The indicator values matching priceData indices.
   * @param lookbackMax Max distance between two pivots to consider (e.g. 50 bars).
   */
  static scan(
    priceHighs: NumberArray,
    priceLows: NumberArray,
    indicatorValues: NumberArray,
    indicatorName: string,
  ): DivergenceResult[] {
    const results: DivergenceResult[] = [];
    const PIVOT_RANGE = 2; // Strictness of pivot
    const MAX_LOOKBACK = 60; // Max bars between points
    const MIN_LOOKBACK = 5; // Min bars between points

    const indPivots = this.findPivots(indicatorValues, PIVOT_RANGE);

    // We really want to match Indicator Pivots to Price behavior.
    // It's robust to find pivots on the Indicator, and then check Price slope between those same indices (or max/min in that windows).
    // Let's iterate Indicator Pivots pairs.

    // --- Bullish Divergences (Compare Lows) ---
    const lowPivots = indPivots.filter((p) => p.type === "Low");
    for (let i = lowPivots.length - 1; i > 0; i--) {
      const p2 = lowPivots[i];
      let bestRegular: DivergenceResult | null = null;
      let bestHidden: DivergenceResult | null = null;

      // Look for p1 within range
      for (let j = i - 1; j >= 0; j--) {
        const p1 = lowPivots[j];
        if (p2.index - p1.index > MAX_LOOKBACK) break; // Too far
        if (p2.index - p1.index < MIN_LOOKBACK) continue; // Too close

        const indLow1 = p1.value;
        const indLow2 = p2.value;

        // Get corresponding Price Lows at those EXACT indices?
        // Often price low is slightly offset from indicator low.
        // Professional scanners look for the lowest price within a small window (+-2) of the indicator pivot.

        const searchWindow = 2;
        const priceLow1 = getMinInWindow(priceLows, p1.index, searchWindow);
        const priceLow2 = getMinInWindow(priceLows, p2.index, searchWindow);

        // Regular Bullish: Price Lower Low, Indicator Higher Low
        if (priceLow2 < priceLow1 && indLow2 > indLow1) {
          // Keep the widest (furthest p1) by overwriting
          bestRegular = {
            indicator: indicatorName,
            type: "Regular",
            side: "Bullish",
            startIdx: p1.index,
            endIdx: p2.index,
            priceStart: priceLow1,
            priceEnd: priceLow2,
            indStart: indLow1,
            indEnd: indLow2,
          };
        }

        // Hidden Bullish: Price Higher Low, Indicator Lower Low
        if (priceLow2 > priceLow1 && indLow2 < indLow1) {
          bestHidden = {
            indicator: indicatorName,
            type: "Hidden",
            side: "Bullish",
            startIdx: p1.index,
            endIdx: p2.index,
            priceStart: priceLow1,
            priceEnd: priceLow2,
            indStart: indLow1,
            indEnd: indLow2,
          };
        }
      }

      if (bestRegular) results.push(bestRegular);
      if (bestHidden) results.push(bestHidden);
    }

    // --- Bearish Divergences (Compare Highs) ---
    const highPivots = indPivots.filter((p) => p.type === "High");
    for (let i = highPivots.length - 1; i > 0; i--) {
      const p2 = highPivots[i];
      let bestRegular: DivergenceResult | null = null;
      let bestHidden: DivergenceResult | null = null;

      for (let j = i - 1; j >= 0; j--) {
        const p1 = highPivots[j];
        if (p2.index - p1.index > MAX_LOOKBACK) break;
        if (p2.index - p1.index < MIN_LOOKBACK) continue;

        const indHigh1 = p1.value;
        const indHigh2 = p2.value;

        const searchWindow = 2;
        const priceHigh1 = getMaxInWindow(priceHighs, p1.index, searchWindow);
        const priceHigh2 = getMaxInWindow(priceHighs, p2.index, searchWindow);

        // Regular Bearish: Price Higher High, Indicator Lower High
        if (priceHigh2 > priceHigh1 && indHigh2 < indHigh1) {
          bestRegular = {
            indicator: indicatorName,
            type: "Regular",
            side: "Bearish",
            startIdx: p1.index,
            endIdx: p2.index,
            priceStart: priceHigh1,
            priceEnd: priceHigh2,
            indStart: indHigh1,
            indEnd: indHigh2,
          };
        }

        // Hidden Bearish: Price Lower High, Indicator Higher High
        if (priceHigh2 < priceHigh1 && indHigh2 > indHigh1) {
          bestHidden = {
            indicator: indicatorName,
            type: "Hidden",
            side: "Bearish",
            startIdx: p1.index,
            endIdx: p2.index,
            priceStart: priceHigh1,
            priceEnd: priceHigh2,
            indStart: indHigh1,
            indEnd: indHigh2,
          };
        }
      }

      if (bestRegular) results.push(bestRegular);
      if (bestHidden) results.push(bestHidden);
    }

    // Filter to return only the most recent pertinent ones?
    // Or return all found in history? The caller determines relevance.
    // Usually we only care if the END index is "recent" (e.g. within last 10 bars).

    return results.filter((r) => r.endIdx >= indicatorValues.length - 15);
  }
}

// Helpers to avoid slice allocation in loops
function getMinInWindow(
  data: NumberArray,
  center: number,
  radius: number,
): number {
  const start = Math.max(0, center - radius);
  const end = Math.min(data.length - 1, center + radius);
  let min = data[start];
  for (let k = start + 1; k <= end; k++) {
    if (data[k] < min) min = data[k];
  }
  return min;
}

function getMaxInWindow(
  data: NumberArray,
  center: number,
  radius: number,
): number {
  const start = Math.max(0, center - radius);
  const end = Math.min(data.length - 1, center + radius);
  let max = data[start];
  for (let k = start + 1; k <= end; k++) {
    if (data[k] > max) max = data[k];
  }
  return max;
}
