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
import { classifyClosedIssueSync, DEFAULT_MERGE_GRACE_MS } from "./closed-issue-guard";

// The BUG-0411 aftermath: issue #2753 closed at merge time while its file
// still said `in-progress`, and the sync "repaired" it back to open/In
// Progress before the auto-done flip landed.
const CLOSED_AT = "2026-09-09T22:17:26Z";
const CLOSED_MS = Date.parse(CLOSED_AT);
const MIN = 60 * 1000;

describe("classifyClosedIssueSync", () => {
    it("syncs open issues regardless of file status", () => {
        expect(
            classifyClosedIssueSync({ fileStatus: "in-progress", issueState: "open", closedAt: null }),
        ).toBe("sync");
    });

    it("syncs closed issues whose file already converged to done", () => {
        // The auto-done flip must still converge to Done on the next run.
        expect(
            classifyClosedIssueSync({ fileStatus: "done", issueState: "closed", closedAt: CLOSED_AT }),
        ).toBe("sync");
    });

    it("syncs closed issues whose file says dropped", () => {
        expect(
            classifyClosedIssueSync({ fileStatus: "dropped", issueState: "closed", closedAt: CLOSED_AT }),
        ).toBe("sync");
    });

    it("skips a freshly closed issue with a not-yet-done file (merge window)", () => {
        expect(
            classifyClosedIssueSync({
                fileStatus: "in-progress",
                issueState: "closed",
                closedAt: CLOSED_AT,
                nowMs: CLOSED_MS + 2 * MIN,
            }),
        ).toBe("skip-merge-window");
    });

    it("still skips exactly at the grace boundary", () => {
        expect(
            classifyClosedIssueSync({
                fileStatus: "in-progress",
                issueState: "closed",
                closedAt: CLOSED_AT,
                nowMs: CLOSED_MS + DEFAULT_MERGE_GRACE_MS,
            }),
        ).toBe("skip-merge-window");
    });

    it("syncs a long-closed issue with a non-done file (genuine rework)", () => {
        // Days later the file is source of truth again — rework converges,
        // including the reopen. Only the merge window is special.
        expect(
            classifyClosedIssueSync({
                fileStatus: "in-progress",
                issueState: "closed",
                closedAt: CLOSED_AT,
                nowMs: CLOSED_MS + 3 * 24 * 60 * MIN,
            }),
        ).toBe("sync");
    });

    it("syncs when the close timestamp is missing or unparseable", () => {
        // No evidence of a merge window: converging self-heals instead of
        // stranding the item.
        expect(
            classifyClosedIssueSync({ fileStatus: "in-progress", issueState: "closed", closedAt: null }),
        ).toBe("sync");
        expect(
            classifyClosedIssueSync({ fileStatus: "in-progress", issueState: "closed", closedAt: "not-a-date" }),
        ).toBe("sync");
    });

    it("treats a future close timestamp as clock skew, not age", () => {
        expect(
            classifyClosedIssueSync({
                fileStatus: "in-progress",
                issueState: "closed",
                closedAt: CLOSED_AT,
                nowMs: CLOSED_MS - MIN,
            }),
        ).toBe("skip-merge-window");
    });

    it("honors a custom grace window", () => {
        const args = {
            fileStatus: "in-progress",
            issueState: "closed",
            closedAt: CLOSED_AT,
            nowMs: CLOSED_MS + 10 * MIN,
        };
        expect(classifyClosedIssueSync({ ...args, graceMs: 5 * MIN })).toBe("sync");
        expect(classifyClosedIssueSync({ ...args, graceMs: 30 * MIN })).toBe("skip-merge-window");
    });

    it("matches file status case-insensitively", () => {
        expect(
            classifyClosedIssueSync({
                fileStatus: "  In-Progress ",
                issueState: "closed",
                closedAt: CLOSED_AT,
                nowMs: CLOSED_MS + MIN,
            }),
        ).toBe("skip-merge-window");
    });
});
