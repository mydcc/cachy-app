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

/**
 * Theme resolution for candlestick-pattern highlight colors.
 *
 * The static pattern catalogue (src/services/candlestickPatterns.ts) was
 * written with hardcoded hues (yellow/green/red/lime, opaque and
 * translucent). The canvas cannot read `var(...)`, so this module maps
 * those known hues onto theme tokens at render time and re-applies the
 * data's original alpha — every theme then paints the same semantics in
 * its own palette. Unknown values (including `var(--…)` references and
 * future hues) pass through untouched, so data the table does not know
 * keeps rendering exactly as before.
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
  /** 0–1, defaults to 1 for hex and rgb() inputs. */
  a: number;
}

interface HueToken {
  rgb: [number, number, number];
  token: string;
}

const HUE_TOKENS: HueToken[] = [
  { rgb: [250, 204, 21], token: "--warning-color" },
  { rgb: [34, 197, 94], token: "--success-color" },
  // Lime gap highlights read as bullish, same as the success default the
  // gap renderer falls back to when a feature carries no color.
  { rgb: [163, 230, 53], token: "--success-color" },
  { rgb: [239, 68, 68], token: "--danger-color" },
];

/** Parses #rgb, #rrggbb, rgb() and rgba() (spaces optional). Null otherwise. */
export function parseColorToRgb(input: string): RgbColor | null {
  const text = input.trim().toLowerCase();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((c) => c + c)
            .join("")
        : hex[1];
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = text.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9]*\.?[0-9]+)\s*)?\)$/,
  );
  if (rgb) {
    const [, r, g, b, a] = rgb;
    if (Number(r) > 255 || Number(g) > 255 || Number(b) > 255) return null;
    return { r: Number(r), g: Number(g), b: Number(b), a: a === undefined ? 1 : Number(a) };
  }
  return null;
}

/** The theme token for a known hardcoded data hue, else null. */
export function tokenForHardcodedHue(raw: string): string | null {
  const parsed = parseColorToRgb(raw);
  if (!parsed) return null;
  const hit = HUE_TOKENS.find(
    ({ rgb }) => rgb[0] === parsed.r && rgb[1] === parsed.g && rgb[2] === parsed.b,
  );
  return hit ? hit.token : null;
}

export function rgbaString({ r, g, b, a }: RgbColor): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export type ThemeVarResolver = (token: string, fallback: string) => string;

/**
 * Resolves a KeyFeature color/borderColor against the active theme,
 * preserving the data's original alpha. Theme references pass through to
 * `resolveVar`; unknown literals pass through unchanged.
 */
export function resolveFeatureColor(
  raw: string,
  resolveVar: ThemeVarResolver,
): string {
  return resolveFeatureColorWithAlpha(raw, null, resolveVar);
}

/** Same as resolveFeatureColor but forces the alpha (e.g. gap strokes). */
export function resolveFeatureColorWithAlpha(
  raw: string,
  alpha: number | null,
  resolveVar: ThemeVarResolver,
): string {
  const text = raw.trim();
  if (text.startsWith("var(") || text.startsWith("--")) {
    return resolveVar(text, text);
  }
  const parsed = parseColorToRgb(text);
  if (!parsed) return raw;
  const token = tokenForHardcodedHue(text);
  if (!token) return raw;
  const resolved = parseColorToRgb(resolveVar(token, raw)) ?? parsed;
  return rgbaString({ ...resolved, a: alpha ?? parsed.a });
}
