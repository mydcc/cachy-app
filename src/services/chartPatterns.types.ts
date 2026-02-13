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

export type ChartPatternDrawFunction = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  addInteractive: AddInteractiveElement,
  colors: ThemeColors
) => void;

export interface ChartPatternData {
  id: string;
  name: string;
  description: string;
  characteristics: string[];
  trading: string;
  advancedConsiderations?: string;
  performanceStats?: string;
  category: string;
}

export interface ChartPatternDefinition extends ChartPatternData {
  drawFunction: ChartPatternDrawFunction;
}
