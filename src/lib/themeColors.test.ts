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

import { describe, it, expect, beforeEach } from "vitest";
import {
  parseColorToRgb,
  isLightColor,
  contrastRatio,
  ensureContrast,
  readCssColor,
  getThemePalette,
  invalidateThemePalette,
  type StyleReader,
} from "./themeColors";

function styleFrom(values: Record<string, string>): StyleReader {
  return { getPropertyValue: (name: string) => values[name] ?? "" };
}

describe("parseColorToRgb", () => {
  it("expands 3-digit hex", () => {
    expect(parseColorToRgb("#abc")).toEqual([0xaa, 0xbb, 0xcc]);
  });

  it("parses 6-digit hex", () => {
    expect(parseColorToRgb("#1a2b3c")).toEqual([0x1a, 0x2b, 0x3c]);
  });

  it("ignores an 8-digit alpha channel", () => {
    expect(parseColorToRgb("#11223344")).toEqual([0x11, 0x22, 0x33]);
  });

  it("parses rgb() and rgba()", () => {
    expect(parseColorToRgb("rgb(10, 20, 30)")).toEqual([10, 20, 30]);
    expect(parseColorToRgb("rgba(10, 20, 30, 0.5)")).toEqual([10, 20, 30]);
    expect(parseColorToRgb("rgb(10, 20, 30 / 50%)")).toEqual([10, 20, 30]);
  });

  it("scales percentage channels", () => {
    expect(parseColorToRgb("rgb(100%, 0%, 0%)")).toEqual([255, 0, 0]);
    expect(parseColorToRgb("rgb(50% 50% 0%)")).toEqual([128, 128, 0]);
  });

  it("returns null for non-colors", () => {
    expect(parseColorToRgb("transparent")).toBeNull();
    expect(parseColorToRgb("#12")).toBeNull();
  });

  it("returns null for non-hex digits", () => {
    expect(parseColorToRgb("#zzzzzz")).toBeNull();
    expect(parseColorToRgb("#zzz")).toBeNull();
  });
});

describe("isLightColor", () => {
  it("classifies white and black", () => {
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#000000")).toBe(false);
  });

  it("accepts an RGB tuple", () => {
    expect(isLightColor([240, 240, 240])).toBe(true);
    expect(isLightColor([10, 10, 10])).toBe(false);
  });

  it("treats unparseable input as not light", () => {
    expect(isLightColor("nonsense")).toBe(false);
  });
});

describe("contrastRatio", () => {
  it("returns 21 for black on white and 1 for identical colors", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(contrastRatio([68, 71, 90], [68, 71, 90])).toBeCloseTo(1, 5);
  });

  it("is symmetric and matches a known theme pairing", () => {
    // Dracula danger on its card background — just under the 3.0 minimum.
    const danger: [number, number, number] = [255, 85, 85];
    const card: [number, number, number] = [68, 71, 90];
    expect(contrastRatio(danger, card)).toBeCloseTo(2.91, 1);
    expect(contrastRatio(card, danger)).toBeCloseTo(contrastRatio(danger, card), 5);
  });
});

describe("ensureContrast", () => {
  it("keeps a readable foreground and swaps a dissolving one", () => {
    expect(ensureContrast("#e2e8f0", "#0f172a", "#a0adc0", 1.5)).toBe("#e2e8f0");
    expect(ensureContrast("#44475a", "#44475a", "#c8aed6", 1.5)).toBe("#c8aed6");
  });

  it("keeps the foreground when either side is unparseable", () => {
    expect(ensureContrast("var(--x)", "#0f172a", "#a0adc0", 1.5)).toBe("var(--x)");
    expect(ensureContrast("#e2e8f0", "", "#a0adc0", 1.5)).toBe("#e2e8f0");
  });

  it("keeps invalid hex instead of swapping on NaN", () => {
    // A typo is unparseable, not low-contrast: history wins over the fallback.
    expect(ensureContrast("#zzzzzz", "#0f172a", "#a0adc0", 1.5)).toBe("#zzzzzz");
  });

  it("keeps the translucent fallback tone without compositing alpha", () => {
    // The chrome fallback is deliberately translucent; the guard judges the
    // parsed channels as-is, so the historical subtle tone is preserved.
    expect(ensureContrast("rgba(255, 255, 255, 0.05)", "#1e293b", "#a0adc0", 1.5)).toBe(
      "rgba(255, 255, 255, 0.05)",
    );
  });
});

describe("readCssColor", () => {
  it("returns a literal color unchanged", () => {
    expect(readCssColor("#ff0000")).toBe("#ff0000");
  });

  it("resolves a custom property", () => {
    const style = styleFrom({ "--accent-color": "#00aaff" });
    expect(readCssColor("--accent-color", "#000000", style)).toBe("#00aaff");
  });

  it("unwraps one level of var() indirection", () => {
    const style = styleFrom({
      "--accent-color": "var(--sky-500)",
      "--sky-500": "#0ea5e9",
    });
    expect(readCssColor("--accent-color", "#000000", style)).toBe("#0ea5e9");
  });

  it("resolves a chain of var() indirection", () => {
    const style = styleFrom({
      "--galaxy-stars-core": "var(--accent-color)",
      "--accent-color": "var(--sky-500)",
      "--sky-500": "#0ea5e9",
    });
    expect(readCssColor("--galaxy-stars-core", "#000000", style)).toBe("#0ea5e9");
  });

  it("stops on a var() cycle instead of looping", () => {
    const style = styleFrom({ "--a": "var(--b)", "--b": "var(--a)" });
    expect(readCssColor("--a", "#123456", style)).toBe("#123456");
  });

  it("uses the var() fallback when the inner token is empty", () => {
    const style = styleFrom({ "--accent-color": "var(--missing, #ff8800)" });
    expect(readCssColor("--accent-color", "#000000", style)).toBe("#ff8800");
  });

  it("falls back when the token is undefined", () => {
    const style = styleFrom({});
    expect(readCssColor("--accent-color", "#123456", style)).toBe("#123456");
  });

  it("falls back when no style reader is available (SSR)", () => {
    // The unit project runs with environment "node", so there is no document.
    expect(readCssColor("--accent-color", "#123456")).toBe("#123456");
  });
});

describe("getThemePalette", () => {
  beforeEach(() => {
    invalidateThemePalette();
  });

  it("reads the semantic tokens", () => {
    const style = styleFrom({
      "--success-color": "#00ff00",
      "--danger-color": "#ff0000",
      "--accent-color": "#0000ff",
      "--warning-color": "#ffff00",
      "--info-color": "#00ffff",
    });
    expect(getThemePalette(style)).toEqual({
      success: "#00ff00",
      danger: "#ff0000",
      accent: "#0000ff",
      warning: "#ffff00",
      info: "#00ffff",
    });
  });

  it("caches until invalidated", () => {
    const first = styleFrom({ "--accent-color": "#111111" });
    expect(getThemePalette(first).accent).toBe("#111111");

    // A different reader is ignored while the cache is warm.
    const second = styleFrom({ "--accent-color": "#222222" });
    expect(getThemePalette(second).accent).toBe("#111111");

    invalidateThemePalette();
    expect(getThemePalette(second).accent).toBe("#222222");
  });

  it("uses built-in fallbacks when a token is missing", () => {
    const palette = getThemePalette(styleFrom({}));
    expect(palette.success).toBe("#22c55e");
    expect(palette.accent).toBe("#ff8800");
  });
});
