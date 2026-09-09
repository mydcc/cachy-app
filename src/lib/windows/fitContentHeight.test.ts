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
import { computeFittedHeight } from "./fitContentHeight";

const BASE = {
    contentHeight: 300,
    headerHeight: 43,
    viewportHeight: 900,
    minHeight: 150,
};

describe("computeFittedHeight (BUG-0411)", () => {
    it("fits content plus header plus safety margin", () => {
        // 300 + 43 + 4
        expect(computeFittedHeight(BASE)).toBe(347);
    });

    it("clamps to the viewport minus margin", () => {
        expect(computeFittedHeight({ ...BASE, viewportHeight: 300 })).toBe(300 - 16);
    });

    it("clamps up to minHeight for tiny content", () => {
        expect(
            computeFittedHeight({ ...BASE, contentHeight: 10, headerHeight: 0 }),
        ).toBe(150);
    });

    it("returns null when nothing is laid out yet", () => {
        expect(computeFittedHeight({ ...BASE, contentHeight: 0 })).toBeNull();
        expect(computeFittedHeight({ ...BASE, contentHeight: -5 })).toBeNull();
        expect(computeFittedHeight({ ...BASE, contentHeight: Number.NaN })).toBeNull();
        expect(computeFittedHeight({ ...BASE, viewportHeight: 0 })).toBeNull();
    });

    it("treats a missing header as zero instead of failing", () => {
        expect(computeFittedHeight({ ...BASE, headerHeight: 0 })).toBe(304);
    });
});
