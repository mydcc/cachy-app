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
import { decideIndexPrTarget } from "./bot-pr-fold";

// One bot PR per merge: while the auto-done PR is open, the sync folds its
// index into that branch instead of opening a second PR.
describe("decideIndexPrTarget", () => {
    it("folds into the auto-done branch when its PR is open", () => {
        expect(decideIndexPrTarget({ autoDoneOpenCount: 1, indexOpenCount: 0 })).toBe(
            "fold-into-auto-done",
        );
    });

    it("prefers the auto-done branch when both PRs are open", () => {
        // The auto-done branch wins: it carries the flip the index belongs to.
        expect(decideIndexPrTarget({ autoDoneOpenCount: 1, indexOpenCount: 1 })).toBe(
            "fold-into-auto-done",
        );
    });

    it("updates the index PR in place when only it is open", () => {
        expect(decideIndexPrTarget({ autoDoneOpenCount: 0, indexOpenCount: 1 })).toBe(
            "update-index-pr",
        );
    });

    it("creates an index PR when none is open", () => {
        expect(decideIndexPrTarget({ autoDoneOpenCount: 0, indexOpenCount: 0 })).toBe(
            "create-index-pr",
        );
    });
});
