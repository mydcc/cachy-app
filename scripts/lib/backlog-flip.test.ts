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
import { checkBacklogFlip, findFixesTrailer, findItemFile, readStatus } from "./backlog-flip";

// Flip-in-fix-PR: the author flips the item, no bot repairs it afterwards.
describe("findFixesTrailer", () => {
    it("takes the line-start trailer", () => {
        expect(findFixesTrailer("Fixes #2793\n\nBody")).toBe(2793);
    });

    it("ignores prose mentions (BUG-0220)", () => {
        expect(findFixesTrailer("This is fixed, see #2793 for context")).toBe(null);
    });

    it("ignores a trailer inside a fenced code block (BUG-0431)", () => {
        const body = "Reporting the bug:\n\n```\nFixes #1792\n```\n\nRefs #1792.";
        expect(findFixesTrailer(body)).toBe(null);
    });

    it("still takes a real trailer outside a fence", () => {
        expect(findFixesTrailer("```\nFixes #111\n```\nFixes #222\n\nBody")).toBe(222);
    });
});

describe("findItemFile", () => {
    it("finds the item file by ID prefix", () => {
        expect(
            findItemFile(["src/a.ts", "docs/backlog/bugs/BUG-0423-thing.md"], "BUG-0423"),
        ).toBe("docs/backlog/bugs/BUG-0423-thing.md");
    });

    it("returns null when absent", () => {
        expect(findItemFile(["src/a.ts"], "BUG-0423")).toBe(null);
    });
});

describe("readStatus", () => {
    it("reads the front-matter status lowercased", () => {
        expect(readStatus("---\nstatus: In-Progress\n---\n")).toBe("in-progress");
    });
});

describe("checkBacklogFlip", () => {
    const labels = ["bug", "backlog-id:BUG-0423"];
    const diff = "--- a/docs/backlog/bugs/BUG-0423-x.md\n-status: ready\n+status: done\n";

    it("passes when the diff flips the linked item", () => {
        expect(
            checkBacklogFlip({
                body: "Fixes #2793",
                issueLabels: labels,
                baseStatus: "ready",
                fileDiff: diff,
            }).outcome,
        ).toBe("pass");
    });

    it("fails when the linked item is not flipped", () => {
        const verdict = checkBacklogFlip({
            body: "Fixes #2793",
            issueLabels: labels,
            baseStatus: "ready",
            fileDiff: "",
        });
        expect(verdict.outcome).toBe("fail");
    });

    it("passes for non-backlog issues", () => {
        expect(
            checkBacklogFlip({
                body: "Fixes #1234",
                issueLabels: ["bug"],
                baseStatus: null,
                fileDiff: "",
            }).outcome,
        ).toBe("pass");
    });

    it("passes when the item is already done on base", () => {
        expect(
            checkBacklogFlip({
                body: "Fixes #2793",
                issueLabels: labels,
                baseStatus: "done",
                fileDiff: "",
            }).outcome,
        ).toBe("pass");
    });

    it("passes open on unreadable labels (API flake)", () => {
        expect(
            checkBacklogFlip({
                body: "Fixes #2793",
                issueLabels: null,
                baseStatus: "ready",
                fileDiff: "",
            }).outcome,
        ).toBe("pass");
    });

    it("leaves missing-trailer bodies to the presence check", () => {
        expect(
            checkBacklogFlip({
                body: "No trailer here [no issue]",
                issueLabels: labels,
                baseStatus: "ready",
                fileDiff: "",
            }).outcome,
        ).toBe("pass");
    });

    it("passes a body carrying both a trailer and the [no issue] opt-out (BUG-0431)", () => {
        expect(
            checkBacklogFlip({
                body: "Fixes #2793\n\n[no issue]",
                issueLabels: labels,
                baseStatus: "ready",
                fileDiff: "",
            }).outcome,
        ).toBe("pass");
    });
});
