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
 * Flip-in-fix-PR verdicts (no bots).
 *
 * A fix PR whose description carries `Fixes #N` for a backlog mirror issue
 * (a `backlog-id:<ID>` label) must flip that item to `status: done` in its
 * own diff — there is no bot that does it after the merge anymore. Pure and
 * unit-testable; the workflow runner (`scripts/check-backlog-flip.ts`)
 * supplies body, labels, base status and diff, this module only decides.
 *
 * Only the enforced line-start trailer counts, never prose (BUG-0220).
 */

export const FIXES_TRAILER_RE = /^Fixes #(\d+)\b/m;
export const NO_ISSUE_RE = /\[no issue\]/i;
export const FLIP_LINE_RE = /^\+status:\s*done\s*$/m;
export const TERMINAL_STATUSES = new Set(["done", "dropped"]);

export type FlipVerdict =
    | { outcome: "pass"; detail: string }
    | { outcome: "fail"; detail: string };

/** Extract the declared issue number from a line-start `Fixes #N` trailer. */
export function findFixesTrailer(body: string): number | null {
    const match = body.match(FIXES_TRAILER_RE);
    if (!match) return null;
    const num = Number.parseInt(match[1], 10);
    return Number.isInteger(num) && num > 0 ? num : null;
}

/** Find the backlog file for an item ID among repo-relative paths. */
export function findItemFile(repoFiles: string[], itemId: string): string | null {
    const hit = repoFiles.find(
        (f) => f.startsWith("docs/backlog/") && f.endsWith(".md") && f.includes(`/${itemId}-`),
    );
    return hit ?? null;
}

/** Read the front-matter status from file content. */
export function readStatus(content: string): string | null {
    const match = content.match(/^status:\s*(.+)$/m);
    return match ? match[1].trim().toLowerCase() : null;
}

export interface FlipInputs {
    /** Raw PR description. */
    body: string;
    /** Label names on the declared issue (empty when the API call failed). */
    issueLabels: string[] | null;
    /** Front-matter status of the item file on the base branch (null = missing). */
    baseStatus: string | null;
    /** Unified diff of the item file base...HEAD ("" when the file is untouched). */
    fileDiff: string;
}

/**
 * Decide whether the PR satisfies the flip rule.
 *
 * Pass-open by design, fail-closed on findings — mirroring the old bot
 * guards, but as a pre-merge gate instead of a post-merge repair:
 * - no trailer, or an explicit `[no issue]` opt-out: pass (the presence
 *   check in `lint-pr-body-refs.ts` owns the missing-trailer case).
 * - issue labels unreadable (API flake): pass with a warning detail — a
 *   retry on the next push re-evaluates; blocking merges on flakes strands
 *   every backlog PR at once.
 * - issue is not a backlog mirror (no `backlog-id:` label): pass.
 * - item already terminal on base: pass, nothing to flip.
 * - otherwise the diff must contain the `+status: done` line.
 */
export function checkBacklogFlip(inputs: FlipInputs): FlipVerdict {
    const declared = findFixesTrailer(inputs.body);
    if (declared === null) {
        return { outcome: "pass", detail: "no Fixes trailer; presence is enforced elsewhere" };
    }
    if (inputs.issueLabels === null) {
        return { outcome: "pass", detail: `labels of #${declared} unreadable; retry on next push` };
    }
    const idLabel = inputs.issueLabels.find((name) => name.startsWith("backlog-id:"));
    if (!idLabel) {
        return { outcome: "pass", detail: `#${declared} is not a backlog mirror issue` };
    }
    const itemId = idLabel.slice("backlog-id:".length);
    if (inputs.baseStatus !== null && TERMINAL_STATUSES.has(inputs.baseStatus)) {
        return { outcome: "pass", detail: `${itemId} is already ${inputs.baseStatus} on base` };
    }
    if (inputs.baseStatus === null && inputs.fileDiff === "") {
        return {
            outcome: "fail",
            detail:
                `#${declared} links to backlog item ${itemId}, but its file is missing ` +
                `on base and untouched in this PR.`,
        };
    }
    if (FLIP_LINE_RE.test(inputs.fileDiff)) {
        return { outcome: "pass", detail: `${itemId} flips to done in this PR` };
    }
    return {
        outcome: "fail",
        detail:
            `#${declared} links to backlog item ${itemId}, but this PR does not flip ` +
            `it to done. Set \`status: done\` in the item file, regenerate the index ` +
            `(\`node scripts/backlog-index.mjs\`) and commit both — no bot does it after the merge.`,
    };
}
