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

import { PATTERNS_DATA } from './chartPatterns.data';
import { DRAW_FUNCTIONS } from './chartPatterns.draw';
import type { ChartPatternDefinition, ChartPatternDrawFunction } from './chartPatterns.types';

export type {
  InteractiveElement,
  ThemeColors,
  AddInteractiveElement,
  ChartPatternDefinition
} from './chartPatterns.types';

export { DEFAULT_PATTERN_COLORS } from './chartPatterns.helpers';

// Helper for fallback pattern drawing
const noopDraw: ChartPatternDrawFunction = () => {};

export const CHART_PATTERNS: ChartPatternDefinition[] = PATTERNS_DATA.map(data => {
  const drawFunction = DRAW_FUNCTIONS[data.id];
  if (!drawFunction) {
    console.error(`ChartPattern: No draw function found for ID "${data.id}"`);
    return {
      ...data,
      drawFunction: noopDraw
    };
  }
  return {
    ...data,
    drawFunction
  };
});
