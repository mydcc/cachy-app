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
 * Single source of truth for per-theme page background colors.
 *
 * Concrete hex values are required here (not CSS variables) because the
 * consumers sit outside the CSS cascade:
 * - `<meta name="theme-color">` (Android status bar / task switcher —
 *   the content attribute only accepts a concrete color)
 * - the pre-CSS FOUC guard (`html.style.backgroundColor`)
 *
 * NOTE: `src/app.html` keeps its own inline copy of this map because the
 * boot script runs before the JS bundle loads and cannot import this
 * module. Keep both in sync — `src/stores/ui_theme.test.ts` enforces key
 * parity between this map, `themes` in `lib/constants.ts`, and the inline
 * map in `src/app.html`.
 */

export const DEFAULT_THEME_BACKGROUND = "#0f172a";

export const THEME_BACKGROUNDS: Record<string, string> = {
  dark: "#0f172a",
  "ayu-dark": "#0f1419",
  "ayu-mirage": "#1f2430",
  catppuccin: "#1e1e2e",
  cobalt2: "#193549",
  dracula: "#282a36",
  "dracula-soft": "#282a36",
  "everforest-dark": "#2d353b",
  "github-dark": "#0d1117",
  "gruvbox-dark": "#282828",
  matrix: "#000000",
  midnight: "#0d1117",
  monokai: "#1e1f1c",
  "night-owl": "#011627",
  nord: "#2e3440",
  obsidian: "#1e1e1e",
  "one-dark-pro": "#282c34",
  "solarized-dark": "#002b36",
  "tokyo-night": "#1a1b26",
  VIP: "#121212",
  "ayu-light": "#f8f9fa",
  "github-light": "#ffffff",
  "solarized-light": "#fdf6e3",
  steel: "#08103f",
  meteorite: "#0c082f",
  insight: "#0f0505",
  ever: "#010f08",
  light: "#f1f5f9",
};

/** Background color for a theme name, falling back to the default theme. */
export function themeBackground(themeName: string): string {
  return THEME_BACKGROUNDS[themeName] ?? DEFAULT_THEME_BACKGROUND;
}

/** True for themes that need a light system-UI scheme (status bar icons). */
export function isLightTheme(themeName: string): boolean {
  return ["light", "solarized-light", "github-light", "ayu-light"].includes(
    themeName,
  );
}
