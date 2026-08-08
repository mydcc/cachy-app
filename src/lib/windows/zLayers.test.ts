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
import { Z_LAYERS, MAX_SAFE_WINDOW_Z_INDEX } from "./zLayers";

describe("Z_LAYERS", () => {
  it("is strictly ordered from window to fx", () => {
    const values = [
      Z_LAYERS.window,
      Z_LAYERS.windowDock,
      Z_LAYERS.windowMax,
      Z_LAYERS.modal,
      Z_LAYERS.toast,
      Z_LAYERS.fx,
    ];
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("keeps every layer above window comfortably past the window counter's safe ceiling", () => {
    expect(MAX_SAFE_WINDOW_Z_INDEX).toBeLessThan(Z_LAYERS.windowDock);
  });

  it("matches the --z-* custom properties declared in themes.css", () => {
    const themesPath = join(process.cwd(), "src", "themes.css");
    const css = readFileSync(themesPath, "utf-8");

    const readCssVar = (name: string): number => {
      const match = css.match(new RegExp(`--${name}:\\s*(\\d+);`));
      if (!match) {
        throw new Error(`--${name} not found in themes.css`);
      }
      return Number(match[1]);
    };

    expect(readCssVar("z-window")).toBe(Z_LAYERS.window);
    expect(readCssVar("z-window-dock")).toBe(Z_LAYERS.windowDock);
    expect(readCssVar("z-window-max")).toBe(Z_LAYERS.windowMax);
    expect(readCssVar("z-modal")).toBe(Z_LAYERS.modal);
    expect(readCssVar("z-toast")).toBe(Z_LAYERS.toast);
    expect(readCssVar("z-fx")).toBe(Z_LAYERS.fx);
  });
});
