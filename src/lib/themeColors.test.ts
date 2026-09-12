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
  });

  it("returns null for non-colors", () => {
    expect(parseColorToRgb("transparent")).toBeNull();
    expect(parseColorToRgb("#12")).toBeNull();
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
