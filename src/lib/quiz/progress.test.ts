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
import { computeQuizProgress } from "./progress";

const cards = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

describe("computeQuizProgress", () => {
   it("counts known, open and a rounded percentage", () => {
      const result = computeQuizProgress(cards, new Set(["a", "c"]));

      expect(result).toEqual({ total: 4, known: 2, open: 2, percent: 50 });
   });

   it("ignores known ids that are not in the deck", () => {
      const result = computeQuizProgress(cards, new Set(["a", "stale", "old"]));

      expect(result.known).toBe(1);
      expect(result.total).toBe(4);
      expect(result.percent).toBe(25);
   });

   it("returns zeroes for an empty deck instead of dividing by zero", () => {
      const result = computeQuizProgress([], new Set(["a"]));

      expect(result).toEqual({ total: 0, known: 0, open: 0, percent: 0 });
   });

   it("rounds the percentage to the nearest integer", () => {
      const result = computeQuizProgress(
         [{ id: "a" }, { id: "b" }, { id: "c" }],
         new Set(["a"]),
      );

      expect(result.percent).toBe(33);
   });
});
