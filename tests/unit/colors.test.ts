import { describe, it, expect } from 'vitest';
import { hexToRgba } from '../../src/utils/colors';

describe('hexToRgba', () => {
  it('converts valid 6-character hex colors correctly', () => {
    expect(hexToRgba('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)');
    expect(hexToRgba('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(hexToRgba('#ff0000', 0.8)).toBe('rgba(255, 0, 0, 0.8)');
    expect(hexToRgba('#00ff00', 0.2)).toBe('rgba(0, 255, 0, 0.2)');
    expect(hexToRgba('#0000ff', 0)).toBe('rgba(0, 0, 255, 0)');
    expect(hexToRgba('#808080', 1)).toBe('rgba(128, 128, 128, 1)');
  });

  it('converts valid 3-character hex colors correctly', () => {
    expect(hexToRgba('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
    expect(hexToRgba('#000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(hexToRgba('#f00', 0.8)).toBe('rgba(255, 0, 0, 0.8)');
    expect(hexToRgba('#0f0', 0.2)).toBe('rgba(0, 255, 0, 0.2)');
    expect(hexToRgba('#00f', 0)).toBe('rgba(0, 0, 255, 0)');
  });

  it('returns fallback rgba(0, 0, 0, alpha) for invalid inputs missing #', () => {
    expect(hexToRgba('ffffff', 1)).toBe('rgba(0, 0, 0, 1)');
    expect(hexToRgba('fff', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('returns fallback rgba(0, 0, 0, alpha) for empty or undefined inputs', () => {
    expect(hexToRgba('', 1)).toBe('rgba(0, 0, 0, 1)');
    // @ts-expect-error - testing invalid JS inputs even though TS prevents it
    expect(hexToRgba(undefined, 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    // @ts-expect-error - testing invalid JS inputs
    expect(hexToRgba(null, 0.2)).toBe('rgba(0, 0, 0, 0.2)');
  });

  it('returns fallback rgba(0, 0, 0, alpha) for hex with invalid lengths', () => {
    expect(hexToRgba('#ffff', 1)).toBe('rgba(0, 0, 0, 1)');
    expect(hexToRgba('#ff', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(hexToRgba('#fffffff', 0.2)).toBe('rgba(0, 0, 0, 0.2)');
  });

  it('respects different alpha values properly', () => {
    expect(hexToRgba('#abcdef', 0)).toBe('rgba(171, 205, 239, 0)');
    expect(hexToRgba('#abcdef', 0.123)).toBe('rgba(171, 205, 239, 0.123)');
    expect(hexToRgba('#abcdef', 1)).toBe('rgba(171, 205, 239, 1)');
  });
});
