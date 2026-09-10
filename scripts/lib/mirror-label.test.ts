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
import { parseMirrorLabelId } from "./mirror-label";

describe("parseMirrorLabelId", () => {
    it("accepts well-shaped mirror labels", () => {
        expect(parseMirrorLabelId("backlog-id:BUG-0423")).toBe("BUG-0423");
        expect(parseMirrorLabelId("backlog-id:FEAT-0028")).toBe("FEAT-0028");
        expect(parseMirrorLabelId("backlog-id:IDEA-0036")).toBe("IDEA-0036");
    });

    it("rejects wrong prefixes, suffixes and injections", () => {
        expect(parseMirrorLabelId("status:ready")).toBe(null);
        expect(parseMirrorLabelId("backlog-id:BUG-0423&per_page=100")).toBe(null);
        expect(parseMirrorLabelId("backlog-id:BUG-0423 x")).toBe(null);
        expect(parseMirrorLabelId("backlog-id:")).toBe(null);
        expect(parseMirrorLabelId("")).toBe(null);
    });
});
