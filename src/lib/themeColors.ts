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
 * Shared CSS-variable to RGB/hex resolution for the WebGL layer.
 *
 * The Three.js renderers sit outside the CSS cascade, but must follow the
 * active theme. Four components had each grown their own copy of this logic
 * (`TradeFlowBackground`, `AmbientTopline`, `burn.ts`, chart overlays); this
 * module is the single source of truth.
 *
 * Everything here is deliberately DOM-optional: the helpers accept a
 * `StyleReader` so pure tests can pass a stub, and the default path guards on
 * `document` for SSR.
 */

/** Minimal surface of `CSSStyleDeclaration` the resolvers need. */
export interface StyleReader {
  getPropertyValue(name: string): string;
}

export type Rgb = [number, number, number];

export const DEFAULT_COLOR_FALLBACK = "#000000";

const CSS_VAR_PATTERN = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/;

/**
 * Parse `#rgb`, `#rrggbb` (alpha ignored) or `rgb()/rgba()` to an RGB triple.
 * Handles `%` channels (`rgb(100% 0% 0%)`); any extra tokens after the third
 * are ignored, so an alpha — percentage or not — does not shift the channels.
 * Returns `null` for anything else — callers fall back to their own default.
 */
export function parseColorToRgb(color: string): Rgb | null {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length >= 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    return null;
  }
  const channels = Array.from(trimmed.matchAll(/(\d*\.?\d+)\s*(%?)/g));
  if (channels.length >= 3) {
    return channels.slice(0, 3).map(([, raw, unit]) => {
      const value = parseFloat(raw);
      const scaled = unit === "%" ? (value / 100) * 255 : value;
      return Math.max(0, Math.min(255, Math.round(scaled)));
    }) as Rgb;
  }
  return null;
}

/**
 * Perceived lightness (HSL-style midpoint). `> threshold` marks a light color,
 * which the additive-blended effects use to switch to normal blending.
 */
export function isLightColor(color: Rgb | string, threshold = 0.5): boolean {
  const rgb = typeof color === "string" ? parseColorToRgb(color) : color;
  if (!rgb) return false;
  const [r, g, b] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 > threshold;
}

function defaultStyleReader(): StyleReader | null {
  if (typeof document === "undefined") return null;
  return getComputedStyle(document.documentElement);
}

/**
 * Resolve a token to a concrete color string.
 *
 * The argument may be a literal color (returned as-is) or a custom-property
 * name such as `--accent-color`. A value that is itself `var(--other, fb)`
 * is resolved one level deep — a plain `getComputedStyle().getPropertyValue`
 * returns the specified value for unregistered custom properties, so the
 * indirection has to be unwrapped by hand.
 */
export function readCssColor(
  token: string,
  fallback: string = DEFAULT_COLOR_FALLBACK,
  style?: StyleReader,
): string {
  if (!token.startsWith("--")) return token.trim() || fallback;

  const reader = style ?? defaultStyleReader();
  if (!reader) return fallback;

  const raw = reader.getPropertyValue(token).trim();
  if (!raw) return fallback;

  const match = raw.match(CSS_VAR_PATTERN);
  if (match) {
    return reader.getPropertyValue(match[1]).trim() || match[2]?.trim() || fallback;
  }
  return raw.startsWith("var(") ? fallback : raw;
}

export interface ThemePalette {
  success: string;
  danger: string;
  accent: string;
  warning: string;
  info: string;
}

const PALETTE_TOKENS: Record<keyof ThemePalette, string> = {
  success: "--success-color",
  danger: "--danger-color",
  accent: "--accent-color",
  warning: "--warning-color",
  info: "--info-color",
};

const PALETTE_FALLBACKS: Record<keyof ThemePalette, string> = {
  success: "#22c55e",
  danger: "#ef4444",
  accent: "#ff8800",
  warning: "#eab308",
  info: "#0ea5e9",
};

let cachedPalette: ThemePalette | null = null;

/**
 * Read the semantic theme palette. Cached, because the callers run it inside
 * render loops and `getComputedStyle` forces a style recalculation. Call
 * `invalidateThemePalette()` from the theme `MutationObserver` — a theme swap
 * is the only thing that changes these values.
 */
export function getThemePalette(style?: StyleReader): ThemePalette {
  if (cachedPalette) return cachedPalette;
  const reader = style ?? defaultStyleReader();
  const read = (key: keyof ThemePalette) =>
    reader
      ? readCssColor(PALETTE_TOKENS[key], PALETTE_FALLBACKS[key], reader)
      : PALETTE_FALLBACKS[key];
  cachedPalette = {
    success: read("success"),
    danger: read("danger"),
    accent: read("accent"),
    warning: read("warning"),
    info: read("info"),
  };
  return cachedPalette;
}

/** Drop the cached palette so the next `getThemePalette()` re-reads the DOM. */
export function invalidateThemePalette(): void {
  cachedPalette = null;
}
