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

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));

import { uiState } from "./ui.svelte";
import { themes } from "../lib/constants";
import {
  DEFAULT_THEME_BACKGROUND,
  THEME_BACKGROUNDS,
  isLightTheme,
  themeBackground,
} from "../lib/themeBackgrounds";

describe("uiState Theme Transitions & Management", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.body.className = "";
    localStorage.clear();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should switch theme and apply theme classes to DOM", () => {
    uiState.setTheme("light");
    expect(uiState.currentTheme).toBe("light");
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);
    expect(document.documentElement.style.backgroundColor).toBe("rgb(241, 245, 249)");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("should apply theme to DOM immediately without view transition", () => {
    uiState.setTheme("dracula");
    expect(uiState.currentTheme).toBe("dracula");
    expect(document.documentElement.classList.contains("theme-dracula")).toBe(true);
  });

  it("should save selected theme to localStorage", () => {
    uiState.setTheme("solarized-dark");
    expect(localStorage.getItem("cachy_theme")).toBe("solarized-dark");
  });
});

describe("theme background single source of truth", () => {
  it("covers every theme in the theme list", () => {
    expect(new Set(Object.keys(THEME_BACKGROUNDS))).toEqual(new Set(themes));
  });

  it("holds only valid #rrggbb colors", () => {
    for (const color of Object.values(THEME_BACKGROUNDS)) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("falls back to the default background for unknown themes", () => {
    expect(themeBackground("no-such-theme")).toBe(DEFAULT_THEME_BACKGROUND);
    expect(themeBackground("dark")).toBe(DEFAULT_THEME_BACKGROUND);
  });

  it("marks only the light themes as light", () => {
    for (const theme of themes) {
      const expected = ["light", "solarized-light", "github-light", "ayu-light"].includes(theme);
      expect(isLightTheme(theme)).toBe(expected);
    }
  });

  it("keeps the app.html boot map in sync with the theme list", () => {
    // The inline boot script runs before the bundle loads and cannot import
    // the shared map, so this guards the copy against drift: a theme missing
    // here falls back to dark on first paint and in the Android status bar.
    const appHtml = readFileSync(join(process.cwd(), "src", "app.html"), "utf8");
    for (const theme of themes) {
      const hasEntry =
        appHtml.includes(`"${theme}": "`) || appHtml.includes(`${theme}: "`);
      expect(hasEntry, `app.html boot map is missing theme "${theme}"`).toBe(true);
    }
  });
});
