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
import {
    closingReferences,
    decideLink,
    declaresBacklogItem,
    matchPRsForItem,
    mentionsBacklogId,
    type MatchablePR,
} from "./pr-issue-match";

function pr(overrides: Partial<MatchablePR> = {}): MatchablePR {
    return {
        number: 1,
        title: "chore: something",
        body: null,
        head: { ref: "chore/something" },
        ...overrides,
    };
}

describe("mentionsBacklogId", () => {
    it("matches a standalone ID", () => {
        expect(mentionsBacklogId("fix: thing (BUG-0219)", "BUG-0219")).toBe(true);
    });

    it("does not match a longer ID that starts with it", () => {
        // The regression BUG-0220 names: `\b` alone lets BUG-0021 match
        // BUG-00210, because the trailing digit is a word character.
        expect(mentionsBacklogId("fix: thing (BUG-00210)", "BUG-0021")).toBe(false);
    });

    it("does not match an ID embedded in a longer token", () => {
        expect(mentionsBacklogId("see XBUG-0021x", "BUG-0021")).toBe(false);
    });

    it("handles empty input", () => {
        expect(mentionsBacklogId(null, "BUG-0219")).toBe(false);
        expect(mentionsBacklogId(undefined, "BUG-0219")).toBe(false);
        expect(mentionsBacklogId("", "BUG-0219")).toBe(false);
    });
});

describe("closingReferences", () => {
    it("finds every GitHub closing keyword", () => {
        const body = "Fixes #1\nCloses #2\nresolved #3\nfixed #4\ncloses #5\nResolve #6";
        expect(closingReferences(body)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("ignores a bare issue mention with no keyword", () => {
        expect(closingReferences("related to #2002, see also #7")).toEqual([]);
    });

    it("deduplicates", () => {
        expect(closingReferences("Fixes #9 and again Fixes #9")).toEqual([9]);
    });

    it("returns empty for no body", () => {
        expect(closingReferences(null)).toEqual([]);
    });
});

describe("declaresBacklogItem", () => {
    it("accepts a PR whose title names the item", () => {
        expect(declaresBacklogItem(pr({ title: "fix: x (BUG-0219)" }), "BUG-0219")).toBe(true);
    });

    it("accepts a PR whose branch names the item", () => {
        expect(declaresBacklogItem(pr({ head: { ref: "fix/BUG-0219-x" } }), "BUG-0219")).toBe(true);
    });

    it("accepts a Backlog-Id trailer", () => {
        const body = "Some description.\n\nBacklog-Id: BUG-0219\n";
        expect(declaresBacklogItem(pr({ body }), "BUG-0219")).toBe(true);
    });

    it("accepts a closing reference to the item's own issue", () => {
        expect(declaresBacklogItem(pr({ body: "Fixes #2008" }), "BUG-0219", 2008)).toBe(true);
    });

    it("rejects a PR that merely mentions the item in prose", () => {
        // The core of BUG-0220: discussing an item is not implementing it.
        const body = "Third case today, after BUG-0215 and BUG-0216 — same class of bug.";
        expect(declaresBacklogItem(pr({ body }), "BUG-0215")).toBe(false);
        expect(declaresBacklogItem(pr({ body }), "BUG-0216")).toBe(false);
    });

    it("rejects a closing reference to a different issue", () => {
        expect(declaresBacklogItem(pr({ body: "Fixes #2008" }), "BUG-0217", 2002)).toBe(false);
    });
});

describe("matchPRsForItem", () => {
    it("keeps a PR that implements the item and drops one that cites it", () => {
        const implementing = pr({ number: 2003, title: "fix: orderType (BUG-0219)" });
        const citing = pr({
            number: 2011,
            title: "feat: unrelated",
            body: "Background reading: BUG-0219 explains the error path.",
        });

        const matched = matchPRsForItem([implementing, citing], "BUG-0219");

        expect(matched.map(p => p.number)).toEqual([2003]);
    });

    it("returns nothing when no PR declares the item", () => {
        expect(matchPRsForItem([pr()], "BUG-0219")).toEqual([]);
    });
});

describe("decideLink", () => {
    it("prepends when the body carries no closing reference", () => {
        expect(decideLink("Just a description.", 2009)).toEqual({
            action: "prepend",
            issueNumber: 2009,
        });
    });

    it("does nothing when the body already links the same issue", () => {
        expect(decideLink("Fixes #2009\n\nBody.", 2009)).toEqual({ action: "already-linked" });
    });

    it("reports a conflict instead of adding a second closing reference", () => {
        // The near-miss BUG-0220 records: #2003 already declared Fixes #2008,
        // and the script wanted to prepend Fixes #2002 for a reassigned ID.
        // Merging that PR would have closed an unrelated, unfixed P1.
        expect(decideLink("Fixes #2008\n\nBody.", 2002)).toEqual({
            action: "conflict",
            existing: [2008],
            wanted: 2002,
        });
    });

    it("treats an absent body as linkable", () => {
        expect(decideLink(null, 2009)).toEqual({ action: "prepend", issueNumber: 2009 });
    });
});

describe("the two incidents on 2026-08-16", () => {
    it("does not link the orderType PRs to the tab-inactivity issue", () => {
        // Both PRs were titled "(BUG-0217)" while BUG-0217 had just been
        // reassigned to the tab-inactivity bug tracked in #2002. The title is a
        // declaration, so it still matches — but the conflict guard is what
        // stops the merge from closing #2002, because #2003 had already
        // declared Fixes #2008.
        const p = pr({
            number: 2003,
            title: "fix: send orderType to Bitunix place_order (BUG-0217)",
            body: "Fixes #2008\n\nA limit order returned 500.",
        });

        expect(declaresBacklogItem(p, "BUG-0217", 2002)).toBe(true);
        expect(decideLink(p.body, 2002)).toEqual({
            action: "conflict",
            existing: [2008],
            wanted: 2002,
        });
    });

    it("does not treat a quoted closing keyword as a link the script should add", () => {
        // The second incident came from a commit message, not from this script,
        // but a body quoting the same phrase must still register as an existing
        // reference rather than an empty slot to fill.
        const body = "The auto-linker prepended `Fixes #2002` to both PRs.";
        expect(closingReferences(body)).toEqual([2002]);
        expect(decideLink(body, 2009)).toEqual({
            action: "conflict",
            existing: [2002],
            wanted: 2009,
        });
    });
});
