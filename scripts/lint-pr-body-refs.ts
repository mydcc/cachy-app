#!/usr/bin/env -S npx tsx
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
 * Enforces both closing-reference rules on a pull request description.
 *
 * 1. Presence (BUG-0307): the description must carry exactly one closing
 *    reference, `Fixes #<own-issue>` — or an explicit `[no issue]` marker for
 *    the rare PR that genuinely links to nothing. Before this check existed,
 *    docs PRs merged with no reference at all: GitHub closed nothing while the
 *    backlog markdown said `done`, and the issues stayed open for days.
 * 2. No strays (BUG-0221): beyond that one declared reference, no other
 *    closing keyword may appear — GitHub closes every issue such a keyword
 *    points at when the PR merges.
 *
 * Reads the body from the `PR_BODY` environment variable rather than a CLI
 * argument or `${{ github.event.pull_request.body }}` interpolated directly
 * into the workflow's `run:` script — the body is untrusted external content,
 * and interpolating it into a shell command is a command-injection surface. An
 * `env:` mapping hands it to the process as data instead.
 */

import { execFileSync } from "node:child_process";
import {
    autoFixPRBody,
    checkBodyForStrayClosingRefs,
    checkBodyHasClosingRef,
    missingClosingRefMessage,
    unverifiedClosingRefMessage,
    type AutoFixPRBodyResult,
    type BacklogIssueVerification,
} from "./lib/pr-issue-match";
import { findItemFile, readStatus } from "./lib/backlog-flip";
import { withRetry } from "./lib/retry";

let body = process.env.PR_BODY ?? "";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const prNumber = process.env.PR_NUMBER;
const prNum = prNumber ? Number.parseInt(prNumber, 10) : NaN;
const baseRef = process.env.BASE_REF || "develop";
const base = `origin/${baseRef}`;

function git(args: string[]): string | null {
    try {
        return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch {
        return null;
    }
}

let autoFixResult: AutoFixPRBodyResult | null = null;

// When running in CI on a PR, attempt silent stray-neutralization before reporting failures
if (token && Number.isInteger(prNum) && prNum > 0) {
    const fixResult = await autoFixPRBody({
        body,
        title: process.env.PR_TITLE,
        branch: process.env.PR_BRANCH,
        findIssueForBacklogId: async (backlogId: string) => {
            const issues = withRetry<Array<{ number: number; title: string }>>(() => {
                try {
                    const stdout = execFileSync("gh", [
                        "issue", "list",
                        "--search", backlogId,
                        "--json", "number,title",
                        "--limit", "10",
                    ], {
                        encoding: "utf8",
                        stdio: ["ignore", "pipe", "ignore"],
                        env: { ...process.env, GH_TOKEN: token },
                    });
                    return JSON.parse(stdout) as Array<{ number: number; title: string }>;
                } catch {
                    return null;
                }
            });
            if (issues === null) return null;
            const match = issues.find(i => i.title.includes(backlogId));
            return match ? match.number : null;
        },
        verifyBacklogItem: async (issueNumber: number): Promise<BacklogIssueVerification | null> => {
            const labels = withRetry<string[]>(() => {
                try {
                    const stdout = execFileSync("gh", [
                        "issue", "view", String(issueNumber),
                        "--json", "labels", "--jq", ".labels[].name",
                    ], {
                        encoding: "utf8",
                        stdio: ["ignore", "pipe", "ignore"],
                        env: { ...process.env, GH_TOKEN: token },
                    });
                    return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
                } catch {
                    return null;
                }
            });
            // Unreadable after retries: return null so the caller declines to
            // insert an unverified trailer and fails closed (BUG-0431).
            if (labels === null) return null;
            const idLabel = labels.find((name) => name.startsWith("backlog-id:"));
            if (!idLabel) return { isBacklogMirror: false, itemId: null, baseStatus: null };
            const itemId = idLabel.slice("backlog-id:".length);
            // A git failure (missing base ref, shallow checkout) is an
            // infrastructure flake: return null so the caller fails closed
            // rather than inserting a trailer it could not verify. A genuinely
            // missing item file is different — the flip gate fails on that.
            const tree = withRetry(() => git(["ls-tree", "-r", "--name-only", base, "docs/backlog"]));
            if (tree === null) return null;
            const itemFile = findItemFile(tree.split("\n"), itemId);
            if (itemFile === null) return { isBacklogMirror: true, itemId, baseStatus: null };
            const content = withRetry(() => git(["show", `${base}:${itemFile}`]));
            if (content === null) return null;
            return { isBacklogMirror: true, itemId, baseStatus: readStatus(content) };
        },
    });
    autoFixResult = fixResult;

    if (fixResult.changed) {
        try {
            execFileSync("gh", [
                "pr", "edit",
                String(prNum),
                "--body", fixResult.body,
            ], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
                env: { ...process.env, GH_TOKEN: token },
            });
            console.log(`✅ [Auto-Fix] Successfully updated PR #${prNum} description (${fixResult.actionTaken}).`);
            body = fixResult.body;
        } catch (err) {
            console.warn("[Auto-Fix] Error updating PR description:", err);
        }
    }
}

const presence = checkBodyHasClosingRef(body);
if (!presence.ok) {
    const guidance = autoFixResult?.unverified
        ? unverifiedClosingRefMessage(autoFixResult.unverified.issueNumber)
        : missingClosingRefMessage(autoFixResult?.declined);
    console.error(`❌ ${guidance}
`);
    process.exit(1);
}

const result = checkBodyForStrayClosingRefs(body);

if (result.ok) {
    if (presence.optedOut) {
        console.log("✅ PR description opted out with `[no issue]`.");
    } else {
        console.log(`✅ PR description closes only #${presence.declared}.`);
    }
    process.exit(0);
}

console.error(
    `❌ PR description declares #${result.declared} but also closes ` +
    `${result.conflicts.map(n => `#${n}`).join(", ")}.\n`,
);
console.error(`
GitHub closes every issue a merged PR's description references with a closing
keyword — close/closes/closed, fix/fixes/fixed, resolve/resolves/resolved, past
tense included. Only the first, #${result.declared}, was meant. Merging as-is
would also close ${result.conflicts.map(n => `#${n}`).join(" and ")}, which
this PR does not fix.

This is not hypothetical: it happened twice in one PR on 2026-08-16, once
describing a prior mistake and once quoting that description to explain it
(BUG-0221).

If the extra reference is prose *about* an issue rather than a link to it,
break the keyword instead: \`closed #<!-- -->${result.conflicts[0]}\` renders
normally and does not parse, or rephrase so no keyword sits directly before the
reference: "#${result.conflicts[0]} was affected", not "closed #${result.conflicts[0]}".
`);
process.exit(1);
