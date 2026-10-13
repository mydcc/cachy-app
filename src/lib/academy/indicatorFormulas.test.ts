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

/*
 * FEAT-0681 — the formula set is pinned to the catalogue the lesson renders.
 *
 * A new indicator must not arrive in a lesson with an empty formula card, and a
 * formula for an indicator that no longer exists is dead weight. Both fail here
 * rather than in a screenshot.
 */

import { describe, it, expect } from "vitest";
import { INDICATOR_FORMULAS } from "./indicatorFormulas";
import { INDICATOR_CATALOGUE } from "../alerts/indicatorCatalogue";

describe("FEAT-0681 — a formula for every catalogue indicator", () => {
    it("covers exactly the indicators the lesson tab renders", () => {
        const catalogueIds = INDICATOR_CATALOGUE.map((entry) => entry.id).sort();

        // Non-vacuity: an empty catalogue would make the comparison below assert
        // nothing at all.
        expect(catalogueIds.length).toBeGreaterThan(0);
        expect(Object.keys(INDICATOR_FORMULAS).sort()).toEqual(catalogueIds);
    });

    it("writes each formula as a KaTeX display block rather than prose", () => {
        for (const [id, formula] of Object.entries(INDICATOR_FORMULAS)) {
            expect(formula.startsWith("$$"), id).toBe(true);
            expect(formula.endsWith("$$"), id).toBe(true);
            // Longer than the delimiters alone: an empty block renders as
            // nothing and reads as a layout bug rather than as missing maths.
            expect(formula.length, id).toBeGreaterThan(8);
        }
    });
});
