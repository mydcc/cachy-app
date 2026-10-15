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
import { CHART_PATTERNS, DEFAULT_PATTERN_COLORS, getThemeColors } from './chartPatterns';
import { PATTERNS_DATA } from './chartPatterns.data';
import { DRAW_FUNCTIONS } from './chartPatterns.draw';
import type { ChartPatternLabels } from './chartPatterns.types';
import de from '../locales/locales/de.json';

// On-canvas annotation labels resolve via chartPatterns.labels.* locale
// entries at the ChartPatternChart call site; draw functions take them as
// an explicit parameter so the canvas module stays text-free.
const labels = de.chartPatterns.labels as unknown as ChartPatternLabels;

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
  } as unknown as typeof Path2D;
}
if (typeof CanvasRenderingContext2D === 'undefined') {
  global.CanvasRenderingContext2D = class CanvasRenderingContext2D {} as unknown as typeof CanvasRenderingContext2D;
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
        pattern.drawFunction(ctx, width, height, addInteractive, colors, labels);
      }).not.toThrow();
    });
  });

  it('never paints the legacy hardcoded reference gray', () => {
    const painted: string[] = [];
    const ctx = createMockContext() as unknown as Record<string, unknown>;
    for (const prop of ["fillStyle", "strokeStyle"] as const) {
      let current = "";
      Object.defineProperty(ctx, prop, {
        get: () => current,
        set: (v: string) => {
          current = v;
          painted.push(String(v));
        },
        configurable: true,
      });
    }
    const addInteractive = vi.fn();
    CHART_PATTERNS.forEach((pattern) => {
      pattern.drawFunction(
        ctx as unknown as CanvasRenderingContext2D,
        800,
        600,
        addInteractive,
        DEFAULT_PATTERN_COLORS,
        labels,
      );
    });
    expect(painted.filter((v) => v.toLowerCase() === "#e0e0e0")).toEqual([]);
    // Not just absence: the reference lines must still be drawn, in the
    // theme's neutral tone, so deleting the calls cannot keep this green.
    expect(painted).toContain(DEFAULT_PATTERN_COLORS.neutral);
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
      pattern.drawFunction(ctx as unknown as CanvasRenderingContext2D, width, height, addInteractive, colors, labels);

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

describe('getThemeColors', () => {
  const reader = (values: Record<string, string>) => (name: string) => values[name] ?? '';

  it('keeps a distinct grid and border', () => {
    const colors = getThemeColors(
      reader({
        '--text-primary': '#e2e8f0',
        '--border-color': '#64748b',
        '--bg-tertiary': '#1e293b',
        '--text-secondary': '#a0adc0',
      }),
    );
    expect(colors.grid).toBe('#64748b');
    expect(colors.border).toBe('#64748b');
  });

  it('falls back to neutral when border equals the card', () => {
    // Several themes wire --border-color to --bg-tertiary itself, which
    // would dissolve grid and separators into the background.
    const colors = getThemeColors(
      reader({
        '--bg-tertiary': '#44475a',
        '--border-color': '#44475a',
        '--text-secondary': '#c8aed6',
      }),
    );
    expect(colors.grid).toBe('#c8aed6');
    expect(colors.border).toBe('#c8aed6');
  });

  it('leaves the documented defaults untouched when nothing resolves', () => {
    // SSR and bare stubs resolve nothing: the guard must not rewrite the
    // catalogue fallback (the defaults sit below the floor by design).
    const colors = getThemeColors(reader({}));
    expect(colors.grid).toBe(DEFAULT_PATTERN_COLORS.grid);
    expect(colors.border).toBe(DEFAULT_PATTERN_COLORS.border);
  });

  it('resolves var() chains before guarding', () => {
    // Most themes wire tokens to each other; the raw reference would hand
    // the canvas an unpaintable `var(...)` string and bypass the guard.
    const colors = getThemeColors(
      reader({
        '--bg-tertiary': '#44475a',
        '--border-color': 'var(--bg-tertiary)',
        '--text-secondary': '#c8aed6',
      }),
    );
    expect(colors.grid).toBe('#c8aed6');
    expect(colors.border).toBe('#c8aed6');
  });
});
