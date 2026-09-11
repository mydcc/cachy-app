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

import { stripCodeBlocks } from "./markdown-text";
import { TERMINAL_STATUSES, findClosingTrailer } from "./backlog-flip";

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
    const scanned = stripCodeBlocks(body);
    const pattern = new RegExp(`(?:${CLOSING_KEYWORD})\\s+#(\\d+)`, "gi");
    const found: number[] = [];
    for (const match of scanned.matchAll(pattern)) {
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

/** Outcome of checking a PR description for a stray closing reference. */
export type BodyRefCheck =
    | { ok: true; declared: number | null }
    | { ok: false; declared: number; conflicts: number[] };

/**
 * Does this PR description close anything besides the issue it declares?
 *
 * `CLAUDE.md` requires `Fixes #<issue>` at the start of every PR description —
 * so the first closing reference in the body *is* the declared issue, and
 * `closingReferences` already returns references in first-seen order with
 * duplicates removed. Anything after that first one is a second, accidental
 * link: exactly the shape of both incidents in BUG-0221, where a `Fixes
 * #<own-issue>` line was followed by prose that used a keyword in passing.
 */
export function checkBodyForStrayClosingRefs(body: string | null | undefined): BodyRefCheck {
    const refs = closingReferences(body);
    if (refs.length === 0) return { ok: true, declared: null };
    const [declared, ...conflicts] = refs;
    if (conflicts.length === 0) return { ok: true, declared };
    return { ok: false, declared, conflicts };
}

/**
 * A body containing this marker (case-insensitive) opts out of the mandatory
 * `Fixes #<issue>` rule. For the rare PR that genuinely links to nothing —
 * pure tooling chores, mass formatting — write it on its own line.
 */
export const NO_ISSUE_MARKER = "[no issue]";

/** Outcome of checking that a PR description carries its closing reference. */
export type ClosingRefPresenceCheck =
    | { ok: true; declared: number | null; optedOut: boolean }
    | { ok: false; reason: "missing" };

/**
 * Does this PR description declare a closing trailer?
 *
 * The missing half of the rule. AGENTS.md has always required `Fixes #N`, but
 * nothing checked for *presence* — only for stray extra references — so the
 * Jules docs pipeline happily merged PRs like #2297/#2254 with no closing
 * keyword at all: GitHub closed nothing, the backlog markdown said `done`,
 * and both issues stayed open until someone noticed by hand (BUG-0307).
 *
 * The declaration is the same one the flip gate enforces: a line-start
 * closing trailer (`findClosingTrailer`), never a keyword that merely appears
 * in prose. An inline-only closing keyword no longer satisfies presence
 * (BUG-0435); it is a stray to neutralize, not a declaration.
 *
 * `[no issue]` is the explicit escape hatch; silence is not.
 */
export function checkBodyHasClosingRef(body: string | null | undefined): ClosingRefPresenceCheck {
    if (body && body.toLowerCase().includes(NO_ISSUE_MARKER)) {
        return { ok: true, declared: null, optedOut: true };
    }
    const declared = findClosingTrailer(body ?? "");
    if (declared !== null) return { ok: true, declared, optedOut: false };
    return { ok: false, reason: "missing" };
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

/** What the auto-fix can learn about the issue it is about to link. */
export interface BacklogIssueVerification {
    /** The candidate issue carries a `backlog-id:` label. */
    isBacklogMirror: boolean;
    /** The backlog item id from that label, when present. */
    itemId: string | null;
    /** Front-matter status of the item on the base branch (null = unreadable/missing). */
    baseStatus: string | null;
}

/** Context for automated PR body repair. */
export interface AutoFixPRBodyContext {
    body: string;
    title?: string;
    branch?: string;
    findIssueForBacklogId?: (backlogId: string) => Promise<number | null>;
    /**
     * Resolve labels and base status for a candidate issue, for guidance only.
     * Returning `null` means the lookup itself failed: the auto-fix reports
     * `unverified` and changes nothing, and the caller fails closed.
     */
    verifyBacklogItem?: (issueNumber: number) => Promise<BacklogIssueVerification | null>;
}

/** Result of automated PR body repair. */
export interface AutoFixPRBodyResult {
    changed: boolean;
    body: string;
    actionTaken?: string;
    /**
     * Set when the auto-fix deliberately declined to insert a trailer: the
     * candidate is a backlog mirror whose item is not terminal, so `Fixes #N`
     * would promise a flip this PR does not make (BUG-0431).
     */
    declined?: { issueNumber: number; itemId: string; baseStatus: string | null };
    /**
     * Set when the trailer could not be inserted because the issue's labels or
     * item status could not be read (lookup failed after retries). The body is
     * left untouched and the caller must fail closed, not insert an unverified
     * closing trailer (BUG-0431).
     */
    unverified?: { issueNumber: number };
}

/**
 * Repairs a PR body without ever adding closing power.
 *
 * The auto-fix only neutralizes stray closing keywords in prose (breaking them
 * so a merge cannot close the wrong issue). It never prepends a `Fixes #N`
 * trailer and never appends `[no issue]`: a closing reference — or an explicit
 * opt-out — is a claim only the author can make, and inventing either is what
 * produced BUG-0431 and the BUG-0307 drift in reverse.
 *
 * When the trailer is missing, the candidate backlog issue is still resolved
 * so the failure message can name the item and whether it is finished
 * (`declined`), or that it could not be read at all (`unverified`). Guidance
 * is returned; the author writes the line (BUG-0435).
 */
export async function autoFixPRBody(ctx: AutoFixPRBodyContext): Promise<AutoFixPRBodyResult> {
    let body = ctx.body;
    let changed = false;
    let actionTaken: string | undefined;
    let declined: AutoFixPRBodyResult["declined"];
    let unverified: AutoFixPRBodyResult["unverified"];

    // 1. Check if closing reference is missing
    const presence = checkBodyHasClosingRef(body);
    if (!presence.ok) {
        const title = ctx.title ?? "";
        const branch = ctx.branch ?? "";
        const combined = `${title} ${branch} ${body}`;
        const backlogMatch = combined.match(/\b([A-Z]{2,10}-\d+)\b/);

        if (backlogMatch) {
            const backlogId = backlogMatch[1];
            let issueNumber: number | null = null;
            if (ctx.findIssueForBacklogId) {
                issueNumber = await ctx.findIssueForBacklogId(backlogId);
            }
            if (issueNumber) {
                const verification = ctx.verifyBacklogItem
                    ? await ctx.verifyBacklogItem(issueNumber)
                    : null;
                if (ctx.verifyBacklogItem && verification === null) {
                    unverified = { issueNumber };
                } else if (
                    verification?.isBacklogMirror === true &&
                    verification.itemId !== null &&
                    (verification.baseStatus === null ||
                        !TERMINAL_STATUSES.has(verification.baseStatus))
                ) {
                    declined = {
                        issueNumber,
                        itemId: verification.itemId,
                        baseStatus: verification.baseStatus,
                    };
                }
                // (BUG-0435) Otherwise nothing: even a verified-safe trailer is
                // written by the author, never invented here.
            }
            // (BUG-0435) Nothing is appended when no issue is resolved — not a
            // trailer, not `[no issue]`. A failed lookup could still mean an
            // issue exists, and inventing an opt-out is as wrong as inventing
            // a trailer. Leave the body; the generic guidance covers it.
        }
        // (BUG-0435) No tooling/chore opt-out is invented either: only the
        // author can declare or opt out.
    }

    // 2. Check for stray closing references in prose
    const strayCheck = checkBodyForStrayClosingRefs(body);
    if (!strayCheck.ok) {
        for (const conflict of strayCheck.conflicts) {
            const regex = new RegExp(`\\b(${CLOSING_KEYWORD})\\s+#(${conflict})\\b`, "gi");
            body = body.replace(regex, (_match, kw, num) => `${kw} #<!-- -->${num}`);
            changed = true;
            actionTaken = actionTaken ? `${actionTaken}; neutralized stray #${conflict}` : `Neutralized stray #${conflict}`;
        }
    }

    return { changed, body, actionTaken, declined, unverified };
}

/**
 * The guidance printed when a PR description carries no closing reference.
 *
 * `declined` is set when `autoFixPRBody` refused to invent one for a
 * non-terminal backlog mirror — the author must choose between finishing the
 * item in this PR or opting out (BUG-0431).
 */
export function missingClosingRefMessage(
    declined?: AutoFixPRBodyResult["declined"],
): string {
    if (declined) {
        return (
            `PR description carries no closing reference.\n\n` +
            `#${declined.issueNumber} links to backlog item ${declined.itemId}, which is ` +
            `${declined.baseStatus ?? "not marked done"} on the base branch — this PR does ` +
            `not complete it, so an inferred \`Fixes #${declined.issueNumber}\` would be a ` +
            `false claim (a later CI step would then demand the item be flipped).\n\n` +
            `Choose one:\n` +
            `  • This PR DOES finish ${declined.itemId}: set \`status: done\` in its file, run ` +
            `\`node scripts/backlog-index.mjs\`, commit both, and put ` +
            `\`Fixes #${declined.issueNumber}\` at the top of this description.\n` +
            `  • It does NOT: put \`${NO_ISSUE_MARKER}\` on its own line to opt out explicitly.`
        );
    }
    return (
        `PR description carries no closing reference.\n\n` +
        `AGENTS.md requires \`Fixes #<issue>\` at the start of every PR description so ` +
        `GitHub links the PR to its backlog issue and closes it on merge — a merge ` +
        `without one closes nothing, and the issue silently stays open.\n\n` +
        `Add the missing line (the number of the issue this PR fixes), or, only if this ` +
        `PR genuinely links to no issue at all, put \`${NO_ISSUE_MARKER}\` on its own line ` +
        `to opt out explicitly. Silence is not an opt-out.`
    );
}

/**
 * The guidance printed when a PR description carries no closing reference and
 * the candidate issue could not be verified.
 *
 * This is an infrastructure failure, not a rule violation: the author must not
 * silence it with `[no issue]`, because the issue may well need closing — it
 * just could not be read. The fix is to re-run the check (BUG-0431).
 */
export function unverifiedClosingRefMessage(issueNumber: number): string {
    return (
        `PR description carries no closing reference, and #${issueNumber} could ` +
        `not be verified — the issue lookup failed after retries.\n\n` +
        `This is an infrastructure failure, not a rule violation. Re-run the ` +
        `"Closing References" job. Do NOT add \`${NO_ISSUE_MARKER}\` to silence ` +
        `it: the issue may still need to be closed.`
    );
}
