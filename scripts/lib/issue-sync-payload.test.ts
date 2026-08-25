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
import { sanitizeAssignees } from "./issue-sync-payload";

const ASSIGNABLE = new Set(["mydcc", "jules-bot", "pat"]);

describe("sanitizeAssignees", () => {
    it("keeps assignees that are assignable collaborators", () => {
        expect(sanitizeAssignees(["mydcc"], ASSIGNABLE)).toEqual({
            valid: ["mydcc"],
            invalid: [],
        });
    });

    it("drops front-matter agent names that are not GitHub collaborators", () => {
        // The BUG-0307 incident: `assignee: jules` made GitHub reject the whole
        // issue PATCH with 422, discarding `state: closed` and the labels with it.
        const result = sanitizeAssignees(["jules", "opencode", "antigravity"], ASSIGNABLE);
        expect(result.valid).toEqual([]);
        expect(result.invalid).toEqual(["jules", "opencode", "antigravity"]);
    });

    it("matches case-insensitively and returns GitHub's own casing", () => {
        // Front matter spells agents loosely; a case-mismatch must not turn a
        // real collaborator into an invalid value (and re-PATCH forever).
        expect(sanitizeAssignees(["JULES-BOT"], ASSIGNABLE)).toEqual({
            valid: ["jules-bot"],
            invalid: [],
        });
    });

    it("splits a mixed list into valid and invalid halves", () => {
        const result = sanitizeAssignees(["mydcc", "claude"], ASSIGNABLE);
        expect(result.valid).toEqual(["mydcc"]);
        expect(result.invalid).toEqual(["claude"]);
    });

    it("treats an empty collaborator set as 'nothing is assignable', not 'send everything'", () => {
        // If the assignable-collaborators lookup fails, degrading to an empty
        // set must skip assignees entirely — never send unvalidated values and
        // repeat the wholesale-422 failure.
        expect(sanitizeAssignees(["mydcc", "jules"], new Set())).toEqual({
            valid: [],
            invalid: ["mydcc", "jules"],
        });
    });

    it("handles undefined, empty strings and the placeholder 'none'", () => {
        expect(sanitizeAssignees(undefined, ASSIGNABLE)).toEqual({ valid: [], invalid: [] });
        expect(sanitizeAssignees([], ASSIGNABLE)).toEqual({ valid: [], invalid: [] });
        expect(sanitizeAssignees(["", "   ", "none", "None"], ASSIGNABLE)).toEqual({
            valid: [],
            invalid: [],
        });
    });

    it("trims whitespace around front-matter values before matching", () => {
        expect(sanitizeAssignees([" mydcc "], ASSIGNABLE)).toEqual({
            valid: ["mydcc"],
            invalid: [],
        });
    });
});
