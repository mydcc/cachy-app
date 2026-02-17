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

import { describe, it, expect, vi } from 'vitest';
import { CHART_PATTERNS, DEFAULT_PATTERN_COLORS } from './chartPatterns';
import { PATTERNS_DATA } from './chartPatterns.data';
import { DRAW_FUNCTIONS } from './chartPatterns.draw';

// Mock global constructors if not available
if (typeof Path2D === 'undefined') {
  global.Path2D = class Path2D {
    rect() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
    arc() {}
    quadraticCurveTo() {}
    bezierCurveTo() {}
  } as any;
}
if (typeof CanvasRenderingContext2D === 'undefined') {
  global.CanvasRenderingContext2D = class CanvasRenderingContext2D {} as any;
}

// Mock CanvasRenderingContext2D
const createMockContext = () => ({
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  rect: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 10 })),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  closePath: vi.fn(),
  arc: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  clearRect: vi.fn(),
  setLineDash: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: '',
  textBaseline: '',
});

describe('Chart Patterns Drawing', () => {
  it('should be able to draw all patterns without error', () => {
    const ctx = createMockContext() as unknown as CanvasRenderingContext2D;
    const width = 800;
    const height = 600;
    const addInteractive = vi.fn();
    const colors = DEFAULT_PATTERN_COLORS;

    CHART_PATTERNS.forEach(pattern => {
      expect(() => {
        pattern.drawFunction(ctx, width, height, addInteractive, colors);
      }).not.toThrow();
    });
  });

  it('should draw specific elements for Head and Shoulders', () => {
    const pattern = CHART_PATTERNS.find(p => p.id === 'headAndShoulders');
    expect(pattern).toBeDefined();

    const ctx = createMockContext();
    const width = 800;
    const height = 600;
    const addInteractive = vi.fn();
    const colors = DEFAULT_PATTERN_COLORS;

    if (pattern) {
      pattern.drawFunction(ctx as unknown as CanvasRenderingContext2D, width, height, addInteractive, colors);

      // Basic checks to ensure drawing methods are called
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalled();
    }
  });
});

describe('Chart Patterns Data Integrity', () => {
  it('should have a draw function for every pattern in data', () => {
    PATTERNS_DATA.forEach(pattern => {
      expect(DRAW_FUNCTIONS[pattern.id], `Missing draw function for ${pattern.id}`).toBeDefined();
      expect(typeof DRAW_FUNCTIONS[pattern.id]).toBe('function');
    });
  });
});
