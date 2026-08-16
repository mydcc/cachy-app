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

/**
 * Deciding which open pull requests belong to a backlog item.
 *
 * This lives apart from `sync-github-issues.ts` for two reasons: the rule was
 * written twice there and the copies had already drifted, and the script exits
 * at import time when `GITHUB_TOKEN` is absent, so nothing in it could be
 * tested. See BUG-0220.
 */

/** The parts of a GitHub pull request this module needs. */
export interface MatchablePR {
    number: number;
    title: string;
    body: string | null;
    head: { ref: string };
}

/**
 * GitHub's closing keywords, as documented for "Linking a pull request to an
 * issue". Matching GitHub's own set matters: a keyword we do not recognise is
 * one we will happily add a second, contradictory reference next to.
 */
const CLOSING_KEYWORD = "clos(?:e|es|ed)|fix(?:|es|ed)|resolv(?:e|es|ed)";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A backlog ID, anchored so it cannot match inside a longer one.
 *
 * `\b` is not enough: `BUG-0021` sits at a word boundary inside `BUG-00210`,
 * because the following `0` is a word character on both sides. The lookahead
 * has to reject a trailing alphanumeric explicitly. Four-digit IDs make this
 * theoretical today and real the moment the backlog passes 9999.
 *
 * A trailing hyphen is allowed, because `fix/BUG-0219-short-slug` is how both
 * branches and backlog filenames are named — the slug is part of the
 * convention, not a different ID. A *leading* hyphen is still rejected, so
 * a hypothetical `SUB-FEAT-0021` does not read as `FEAT-0021`.
 */
export function backlogIdPattern(id: string): RegExp {
    return new RegExp(`(?<![0-9A-Za-z-])${escapeRegExp(id)}(?![0-9A-Za-z])`);
}

/** Does `text` name this backlog ID as a standalone token? */
export function mentionsBacklogId(text: string | null | undefined, id: string): boolean {
    if (!text) return false;
    return backlogIdPattern(id).test(text);
}

/**
 * Every issue number this body already asks GitHub to close.
 *
 * Used to detect the case where a body carries a closing reference to some
 * *other* issue: adding a second one there is how an unrelated bug gets closed
 * by a merge, which is the failure BUG-0220 records.
 */
export function closingReferences(body: string | null | undefined): number[] {
    if (!body) return [];
    const pattern = new RegExp(`(?:${CLOSING_KEYWORD})\\s+#(\\d+)`, "gi");
    const found: number[] = [];
    for (const match of body.matchAll(pattern)) {
        const parsed = Number.parseInt(match[1], 10);
        if (!Number.isNaN(parsed) && !found.includes(parsed)) found.push(parsed);
    }
    return found;
}

/**
 * Does this PR *declare* itself as implementing `itemId`?
 *
 * The distinction that matters is declaration versus mention. A PR that says
 * "same class of bug as BUG-0215" in its description is discussing an item, not
 * implementing it — the old rule could not tell those apart, because it tested
 * `pr.body.includes(item.id)` against the whole body.
 *
 * Signals are ranked, and the strongest one present wins outright rather than
 * being OR-ed with the rest:
 *
 * 1. A `Backlog-Id:` trailer. Unambiguous, so nothing else is consulted.
 * 2. A closing reference, when this item's issue number is known. The PR has
 *    named the issue it closes; a title naming some *other* item cannot
 *    override that.
 * 3. Title and branch name, which is how this repo names its work.
 *
 * The ranking is what makes a stale title safe. #2003 was titled `(BUG-0217)`
 * after that ID had been reassigned, while its body declared the issue for
 * BUG-0219 — under a flat OR it matched both, and the merge closed the wrong
 * bug. Under the ranking, its own declaration settles it.
 */
export function declaresBacklogItem(
    pr: MatchablePR,
    itemId: string,
    existingIssueNumber?: number,
): boolean {
    const trailer = pr.body?.match(/^\s*Backlog-Id:\s*(\S+)\s*$/im);
    if (trailer) return backlogIdPattern(itemId).test(trailer[1]);

    // Only authoritative when this item's issue is known; without it there is
    // nothing to compare the reference against, so fall through to the name.
    const closing = closingReferences(pr.body);
    if (closing.length > 0 && existingIssueNumber) {
        return closing.includes(existingIssueNumber);
    }

    if (mentionsBacklogId(pr.title, itemId)) return true;
    if (mentionsBacklogId(pr.head?.ref, itemId)) return true;

    return false;
}

/** The open PRs that declare themselves as implementing `itemId`. */
export function matchPRsForItem<T extends MatchablePR>(
    prs: T[],
    itemId: string,
    existingIssueNumber?: number,
): T[] {
    return prs.filter(pr => declaresBacklogItem(pr, itemId, existingIssueNumber));
}

/** What to do about a PR that is missing its `Fixes #<issue>` line. */
export type LinkDecision =
    | { action: "already-linked" }
    | { action: "prepend"; issueNumber: number }
    | { action: "conflict"; existing: number[]; wanted: number };

/**
 * Decide whether `Fixes #issueNumber` may be prepended to this body.
 *
 * The old guard only asked whether *this* issue was already referenced, so a
 * body carrying `Fixes #<other>` looked exactly like a body carrying nothing
 * and got a second, contradictory reference. Merging such a PR closes both.
 * A conflict is reported for a human rather than resolved by guessing: either
 * reference may be the correct one, and the script cannot tell.
 */
export function decideLink(body: string | null | undefined, issueNumber: number): LinkDecision {
    const existing = closingReferences(body);
    if (existing.includes(issueNumber)) return { action: "already-linked" };
    if (existing.length > 0) return { action: "conflict", existing, wanted: issueNumber };
    return { action: "prepend", issueNumber };
}
