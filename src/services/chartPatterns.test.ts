import { describe, it, expect, vi } from 'vitest';
import { CHART_PATTERNS, DEFAULT_PATTERN_COLORS } from './chartPatterns';

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
