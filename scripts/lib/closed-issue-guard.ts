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
 * Merge-window guard for the backlog -> GitHub sync.
 *
 * When a PR merges, GitHub closes the linked issue (via the `Fixes #N`
 * trailer) in the same merge that carries the file's `done` flip — but a
 * forgotten flip (or a manual close with no PR) leaves the file behind for
 * a moment. A sync run in that window must not "repair" the closed issue
 * back to open/In Progress: that reopen + Kanban rollback is the BUG-0411
 * aftermath (issue #2753 went Done -> In Progress -> Done across two runs).
 *
 * Lives apart from `sync-github-issues.ts` for the same reason
 * `pr-issue-match.ts` does: the sync script exits at import time without
 * `GITHUB_TOKEN`, so nothing in it can be unit-tested. See BUG-0307.
 */

/** How long after an issue close the sync leaves closed issues alone. */
export const DEFAULT_MERGE_GRACE_MS = 15 * 60 * 1000;

export type ClosedIssueVerdict = "sync" | "skip-merge-window";

/**
 * Decide whether a closed mirror issue may be converged from its backlog
 * file in this run.
 *
 * - Issue open, or file already `done`/`dropped`: `sync` (normal paths,
 *   including a flip converging to Done).
 * - Issue closed but the file says anything else: only `sync` once the
 *   close is older than the grace window (genuine rework back to
 *   `in-progress` still converges labels/body/title — but the sync never
 *   reopens the issue itself). Inside the window the flip is assumed to
 *   land shortly, so `skip-merge-window`.
 * - Unparseable or missing `closedAt`: `sync`. Without a timestamp there
 *   is no evidence of a merge window, and converging self-heals instead
 *   of stranding the item.
 */
export function classifyClosedIssueSync(args: {
    fileStatus: string;
    issueState: string | undefined;
    closedAt: string | null | undefined;
    nowMs?: number;
    graceMs?: number;
}): ClosedIssueVerdict {
    const status = args.fileStatus.trim().toLowerCase();
    if (args.issueState !== "closed") return "sync";
    if (status === "done" || status === "dropped") return "sync";

    const closedMs = args.closedAt ? Date.parse(args.closedAt) : NaN;
    if (Number.isNaN(closedMs)) return "sync";

    const nowMs = args.nowMs ?? Date.now();
    const graceMs = args.graceMs ?? DEFAULT_MERGE_GRACE_MS;
    // A close timestamp in the future is clock skew, not age: treat it as
    // "just closed" so the grace window applies.
    const ageMs = Math.max(0, nowMs - closedMs);
    return ageMs <= graceMs ? "skip-merge-window" : "sync";
}
