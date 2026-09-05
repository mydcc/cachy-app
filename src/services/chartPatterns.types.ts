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

export interface InteractiveElement {
  path: Path2D;
  tooltip: string;
  isLine?: boolean;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  color?: string;
  width?: number;
}

export interface ThemeColors {
  text: string;
  grid: string;
  border: string;
  bullish: string;
  bullishLight: string;
  bullishFill: string;
  bearish: string;
  bearishLight: string;
  bearishFill: string;
  neutral: string;
  neutralLight: string;
  highlight: string;
  gray: string;
  background: string;
}

export type AddInteractiveElement = (el: InteractiveElement) => void;

/**
 * Stable keys for on-canvas chart annotations (drawn labels and hover
 * tooltips). Resolved via chartPatterns.labels.* locale entries at the
 * ChartPatternChart call site, so draw.ts stays free of hardcoded text.
 */
export const CHART_PATTERN_LABEL_KEYS = [
  "decline",
  "gradualReversal",
  "advance",
  "breakout",
  "breakoutDirection",
  "break",
  "bullishReversal",
  "bullishBreakout",
  "bearishReversal",
  "bearishBreakout",
  "firstHigh",
  "firstLow",
  "fallingSupport",
  "failedBreakout",
  "failedBreakoutBullishReversal",
  "flagpole",
  "handle",
  "high1",
  "high2",
  "high3",
  "island",
  "islandConsolidation",
  "invCup",
  "head",
  "leftShoulderShort",
  "rightShoulderShort",
  "leftShoulder",
  "rightShoulder",
  "rightShoulderDeveloping",
  "finalTrendLeg",
  "possibleContinuationShort",
  "potentialSupport",
  "potentialResistance",
  "neckline",
  "necklineUnbroken",
  "newTrend",
  "upperLeftSide",
  "upperRightSide",
  "lowerLeftSide",
  "lowerRightSide",
  "pipe1High",
  "pipe1Low",
  "pipe2High",
  "pipe2Low",
  "pipes",
  "weakCandle",
  "strongReversal",
  "strongBullishMove",
  "strongBearishMove",
  "heavySelloff",
  "strongTrend",
  "risingResistance",
  "steepDecline",
  "steepAdvance",
  "cup",
  "low1",
  "low2",
  "low3",
  "trend",
  "trendAfterGap",
  "trendBeforeGap",
  "trendReversal",
  "reversalCandle",
  "support",
  "supportLine",
  "priorTrend",
  "furtherDecline",
  "resistance",
  "resistanceLine",
  "secondHigh",
  "secondLow",
  "n1",
  "n2",
  "n3",
  "labelA",
  "labelB",
  "adam",
  "bounce",
  "bump",
  "drive1",
  "drive2",
  "drive3",
  "eve",
  "exhaustionGapLabel",
  "h1",
  "h2",
  "h3",
  "horn1",
  "horn2",
  "gap1",
  "gap2",
  "l1",
  "l2",
  "l3",
  "leadInTrend",
  "retracementA",
  "retracementB",
  "run",
  "runPhase",
  "runawayGapLabel",
  "spikeBottomLabel",
  "spikeTopLabel",
  "adamTop",
  "adamBottom",
] as const;

export type ChartPatternLabelKey =
  (typeof CHART_PATTERN_LABEL_KEYS)[number];

export type ChartPatternLabels = Record<ChartPatternLabelKey, string>;

export type ChartPatternDrawFunction = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  addInteractive: AddInteractiveElement,
  colors: ThemeColors,
  labels: ChartPatternLabels
) => void;

export interface ChartPatternRef {
  id: string;
}

export interface ChartPatternDefinition extends ChartPatternRef {
  drawFunction: ChartPatternDrawFunction;
}
