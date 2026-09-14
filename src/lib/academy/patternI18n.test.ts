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
import { resolvePatternName } from "./patternI18n";

describe("resolvePatternName", () => {
   it("returns the localized name when the key resolves", () => {
      const translate = (key: string) =>
         key === "candlestickPatterns.doji.name" ? "Doji (DE)" : key;
      expect(
         resolvePatternName(translate, "candlestickPatterns.doji.name", "Doji"),
      ).toBe("Doji (DE)");
   });

   it("falls back to the compiled name when the key is untranslated", () => {
      // svelte-i18n echoes the key when a translation is missing.
      const translate = (key: string) => key;
      expect(
         resolvePatternName(translate, "candlestickPatterns.doji.name", "Doji"),
      ).toBe("Doji");
   });

   it("falls back when the catalogue returns an empty string", () => {
      const translate = () => "";
      expect(
         resolvePatternName(translate, "candlestickPatterns.doji.name", "Doji"),
      ).toBe("Doji");
   });
});
