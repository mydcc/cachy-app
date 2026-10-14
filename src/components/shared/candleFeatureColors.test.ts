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

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCssColor,
  tokenForHardcodedHue,
  resolveFeatureColor,
  resolveFeatureColorWithAlpha,
  HUE_TOKENS,
  type ThemeVarResolver,
} from "./candleFeatureColors";
import { CANDLESTICK_PATTERNS } from "../../services/candlestickPatterns";

/** Theme stub: unwraps var() like the component resolver, then looks up. */
const resolveVar: ThemeVarResolver = (token, fallback) => {
  const name = token.startsWith("var(") ? token.slice(4, -1).trim() : token;
  return (
    {
      "--warning-color": "rgb(10, 20, 30)",
      "--success-color": "#112233",
      "--danger-color": "rgb(40, 50, 60)",
    } as Record<string, string>
  )[name] ?? fallback;
};

describe("parseCssColor", () => {
  it("parses hex and functional notations, spaces optional", () => {
    expect(parseCssColor("#FACC15")).toEqual({ r: 250, g: 204, b: 21, a: 1 });
    expect(parseCssColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor("rgba(250,204,21,0.4)")).toEqual({ r: 250, g: 204, b: 21, a: 0.4 });
    expect(parseCssColor("rgba(250, 204, 21, 0.4)")).toEqual({ r: 250, g: 204, b: 21, a: 0.4 });
    expect(parseCssColor("rgb(34, 197, 94)")).toEqual({ r: 34, g: 197, b: 94, a: 1 });
  });

  it("rejects non-colors", () => {
    expect(parseCssColor("var(--warning-color)")).toBeNull();
    expect(parseCssColor("red")).toBeNull();
    expect(parseCssColor("rgb(999, 0, 0)")).toBeNull();
    expect(parseCssColor("")).toBeNull();
  });
});

describe("tokenForHardcodedHue", () => {
  it("maps every catalogue hue onto its theme token", () => {
    expect(tokenForHardcodedHue("#FACC15")).toBe("--warning-color");
    expect(tokenForHardcodedHue("rgba(250,204,21,0.3)")).toBe("--warning-color");
    expect(tokenForHardcodedHue("rgba(250, 204, 21, 0.4)")).toBe("--warning-color");
    expect(tokenForHardcodedHue("#22C55E")).toBe("--success-color");
    expect(tokenForHardcodedHue("rgba(34,197,94,0.3)")).toBe("--success-color");
    expect(tokenForHardcodedHue("rgba(163,230,53,0.3)")).toBe("--success-color");
    expect(tokenForHardcodedHue("#EF4444")).toBe("--danger-color");
    expect(tokenForHardcodedHue("rgba(239,68,68,0.4)")).toBe("--danger-color");
    expect(tokenForHardcodedHue("rgba(239, 68, 68, 0.2)")).toBe("--danger-color");
  });

  it("returns null for unknown hues", () => {
    expect(tokenForHardcodedHue("#123456")).toBeNull();
    expect(tokenForHardcodedHue("var(--warning-color)")).toBeNull();
  });
});

describe("resolveFeatureColor", () => {
  it("resolves a known hue through the theme and keeps the data alpha", () => {
    expect(resolveFeatureColor("rgba(250,204,21,0.4)", resolveVar)).toBe(
      "rgba(10, 20, 30, 0.4)",
    );
    expect(resolveFeatureColor("#FACC15", resolveVar)).toBe("rgba(10, 20, 30, 1)");
    expect(resolveFeatureColor("#22C55E", resolveVar)).toBe("rgba(17, 34, 51, 1)");
  });

  it("passes theme references through to the variable resolver", () => {
    expect(resolveFeatureColor("var(--warning-color)", resolveVar)).toBe("rgb(10, 20, 30)");
    expect(resolveFeatureColor("--danger-color", resolveVar)).toBe("rgb(40, 50, 60)");
  });

  it("passes unknown literals through unchanged", () => {
    expect(resolveFeatureColor("#123456", resolveVar)).toBe("#123456");
    expect(resolveFeatureColor("not-a-color", resolveVar)).toBe("not-a-color");
  });

  it("falls back to the data hue when the token does not resolve", () => {
    const unresolving: ThemeVarResolver = (_token, fallback) => fallback;
    expect(resolveFeatureColor("rgba(250,204,21,0.4)", unresolving)).toBe(
      "rgba(250, 204, 21, 0.4)",
    );
  });

  it("forces the alpha when asked (gap strokes)", () => {
    expect(resolveFeatureColorWithAlpha("rgba(250,204,21,0.3)", 0.8, resolveVar)).toBe(
      "rgba(10, 20, 30, 0.8)",
    );
  });
});

describe("theme contract", () => {
  it("maps only to token names that src/themes.css actually defines", () => {
    const css = readFileSync(join(process.cwd(), "src", "themes.css"), "utf-8");
    const undefinedTokens = HUE_TOKENS.map(({ token }) => token).filter(
      (token) => !new RegExp(`${token}\\s*:`).test(css),
    );
    expect(undefinedTokens).toEqual([]);
  });

  it("has a token for every colour literal in the candlestick catalogue", () => {
    // Guards the mapping against drift: a new hue added to the catalogue
    // would otherwise stay hardcoded with no failing test.
    const literals = CANDLESTICK_PATTERNS.flatMap((pattern) =>
      (pattern.keyFeatures ?? []).flatMap((feature) =>
        [feature.color, feature.borderColor].filter(
          (value): value is string => typeof value === "string" && value !== "",
        ),
      ),
    );
    expect(literals.length).toBeGreaterThan(0);
    const unmapped = [...new Set(literals)].filter(
      (value) => tokenForHardcodedHue(value) === null,
    );
    expect(unmapped).toEqual([]);
  });
});
