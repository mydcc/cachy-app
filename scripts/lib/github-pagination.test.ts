// @vitest-environment node
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
import { nextPageUrl } from "./github-pagination";

// A short page with HTTP 200 is not a last page while rel="next" exists —
// trusting the length heuristic created dozens of duplicates.
describe("nextPageUrl", () => {
    it("follows rel=next among several links", () => {
        expect(
            nextPageUrl(
                '<https://api.github.com/x?page=3>; rel="next", <https://api.github.com/x?page=1>; rel="prev"',
            ),
        ).toBe("https://api.github.com/x?page=3");
    });

    it("returns null on the last page (no next link)", () => {
        expect(
            nextPageUrl(
                '<https://api.github.com/x?page=1>; rel="prev", <https://api.github.com/x?page=1>; rel="first"',
            ),
        ).toBe(null);
    });

    it("returns null for missing or empty headers", () => {
        expect(nextPageUrl(null)).toBe(null);
        expect(nextPageUrl(undefined)).toBe(null);
        expect(nextPageUrl("")).toBe(null);
    });
});
