#!/usr/bin/env node
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
 * Fails a pull request whose merge would delete a file, or remove lines, that
 * the base branch introduced after the PR forked.
 *
 * This is the mechanism half of BUG-0447. Two individually reasonable
 * mechanisms compose into a data-loss path: `auto-update-prs.yml` keeps agent
 * PR branches current by merging `develop` into them, and the agent does not
 * fetch those merges before its next push. It commits a full tree snapshot
 * from its own stale checkout, which git records as an ordinary commit that
 * happens to undo every merged change. Squash-merge then flattens the result
 * into one commit whose title describes only the intended change, so review
 * sees the title, and CI sees a tree that compiles — because the reverted
 * tests were deleted along with the code they tested.
 *
 * The check is decidable from git alone, with no heuristics about authorship.
 * Three anchors do the work:
 *
 * - `M`, the merge-base of base and head: `diff M..head` is the payload a
 *   squash-merge applies, so only removals inside it can revert anything. A
 *   branch that simply has not merged the base yet is unaffected.
 * - `P`, the tree the PR started from (first parent of its first commit):
 *   a removed line counts as base-introduced only when the fork-era version
 *   does not contain it. Deleting a pre-existing file, or a line the PR could
 *   already see at fork time, is the PR's own business and passes.
 *
 * That payload is empty, though, when the head tree *is* the fork-era tree —
 * which is what a stale snapshot looks like (BUG-0583, PR #3718). A branch
 * that never merged the base has `M == P`, so `diff M..head` inspects nothing
 * and the merge still overwrites the base tree. A second pass therefore walks
 * the branch's own commits: a commit that drops content its own parent had,
 * and that the fork point never had, is a snapshot regardless of what the base
 * has done since.
 *
 * A palette PR has no business deleting a file the base added; a deliberate
 * revert opts in with a visible label, never a commit-message token.
 *
 * Usage:
 *   node scripts/check-pr-base-revert.mjs <base-sha> <head-sha>
 *
 * Environment:
 *   PR_LABELS    comma-separated label names on the PR (may be empty)
 *   ALLOW_LABEL  label that exempts a deliberate revert (default: allow-base-revert)
 *
 * Exit codes: 0 when the PR keeps base-branch work intact (or is opted out),
 * 1 when it reverts base-branch work, 2 on usage errors.
 */

import { execFileSync } from "node:child_process";

// The SHA-1 of the empty tree: the fork-era anchor for a root first commit.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const ALLOW_LABEL = process.env.ALLOW_LABEL ?? "allow-base-revert";
// Cap the per-path sample lines in the report; the count is never capped.
const MAX_SAMPLE_LINES = 10;

/**
 * Generated aggregates, not source. `node scripts/backlog-index.mjs` rewrites
 * their summary lines on any item flip, so a PR that regenerates the index
 * legitimately replaces a line the base also changed — exactly what tripped
 * this guard on the FEAT-0454 review (PR #3297), where `Counts by status`
 * moved because the PR flipped one item from `idea` to `in-progress`. The
 * per-item markdown those aggregates derive from stays checked; a deleted
 * `BUG-0441-*.md` is still caught, and `npm run backlog:check` proves the
 * aggregates match the source.
 */
const GENERATED_BACKLOG_PATHS = new Set([
    "docs/backlog/INDEX.md",
    "docs/backlog/backlog.generated.ts",
    "docs/backlog/backlog.generated.json",
]);

function git(...args) {
    return execFileSync("git", args, {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
    });
}

function blobBuffer(rev, path) {
    try {
        return execFileSync("git", ["cat-file", "-p", `${rev}:${path}`], {
            maxBuffer: 256 * 1024 * 1024,
            // Swallow stderr: a missing blob is an expected answer (null),
            // not a diagnostic, and git's message would leak into the report.
            stdio: ["ignore", "pipe", "pipe"],
        });
    } catch {
        return null;
    }
}

function blobSha(rev, path) {
    try {
        return execFileSync("git", ["rev-parse", `${rev}:${path}`], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        }).trim();
    } catch {
        return null;
    }
}

function countLines(buf) {
    const counts = new Map();
    if (buf === null) return counts;
    for (const line of buf.toString("utf8").split("\n")) {
        counts.set(line, (counts.get(line) ?? 0) + 1);
    }
    return counts;
}

/**
 * The PR payload: paths changed between merge-base and head. Renames report
 * the old path so both sides of the comparison resolve; pure additions are
 * the PR's own work and skipped by the caller.
 */
function payloadEntries(mergeBase, head) {
    return nameStatus(mergeBase, head);
}

function parseNameStatus(out) {
    const tokens = out.split("\0").filter((t) => t.length > 0);
    const entries = [];
    for (let i = 0; i < tokens.length; i++) {
        const status = tokens[i];
        if (/^[A-Z][0-9]*$/.test(status)) {
            if (status.startsWith("R") || status.startsWith("C")) {
                entries.push({ status, oldPath: tokens[i + 1], path: tokens[i + 2] });
                i += 2;
            } else {
                entries.push({ status, oldPath: tokens[i + 1], path: tokens[i + 1] });
                i += 1;
            }
        }
    }
    return entries;
}

function nameStatus(from, to) {
    return parseNameStatus(git("diff", "--name-status", "-z", from, to));
}

/**
 * Content removed going from `from` to `to`, judged against the tree the
 * branch forked from.
 *
 * `forkRev` is the anchor: a removed line counts as base-introduced only when
 * the fork-era copy does not already contain it. Deleting a file the branch
 * could already see at fork time is the branch's own business.
 */
function removedBaseLines(entries, from, to, forkRev) {
    const violations = [];
    for (const { status, oldPath, path } of entries) {
        if (status.startsWith("A")) continue; // the branch's own addition.
        if (GENERATED_BACKLOG_PATHS.has(path) || GENERATED_BACKLOG_PATHS.has(oldPath)) continue;

        const fromBuf = blobBuffer(from, oldPath);
        const toBuf = blobBuffer(to, path);

        // Binary blobs have no meaningful lines: only an exact reset to the
        // fork-era blob counts as a revert, anything else is undecidable.
        if ((fromBuf !== null && fromBuf.includes(0)) || (toBuf !== null && toBuf.includes(0))) {
            const toSha = blobSha(to, path);
            if (toSha === blobSha(forkRev, oldPath) && toSha !== blobSha(from, oldPath)) {
                violations.push({ path, kind: "binary-revert", count: 1, samples: [] });
            }
            continue;
        }

        // Lines `to` no longer has, per occurrence so duplicated lines only
        // match when every copy is gone.
        const toCounts = countLines(toBuf);
        const removed = [];
        for (const [line, count] of countLines(fromBuf)) {
            const kept = Math.min(toCounts.get(line) ?? 0, count);
            toCounts.set(line, (toCounts.get(line) ?? 0) - kept);
            for (let i = 0; i < count - kept; i++) removed.push(line);
        }
        if (removed.length === 0) continue;

        const forkCounts = countLines(blobBuffer(forkRev, oldPath));
        const samples = [];
        let baseRemoved = 0;
        for (const line of removed) {
            const left = forkCounts.get(line) ?? 0;
            if (left > 0) {
                forkCounts.set(line, left - 1);
            } else {
                baseRemoved += 1;
                if (samples.length < MAX_SAMPLE_LINES) samples.push(line);
            }
        }
        if (baseRemoved > 0) {
            violations.push({
                path,
                kind: toBuf === null ? "deleted" : "removed-lines",
                count: baseRemoved,
                samples,
            });
        }
    }
    return violations;
}

/**
 * A branch that commits a stale snapshot of its own checkout (BUG-0583).
 *
 * `diff(mergeBase, head)` is the wrong payload when the head tree *is* the
 * fork-era tree: the diff is empty, so there is nothing to inspect and the
 * check reports success — while the merge still replaces the base tree with
 * the stale one. That is exactly PR #3718, where the branch never merged
 * `develop`, so `mergeBase` is the fork point and `diff(mergeBase, head)` was
 * empty.
 *
 * This walks the branch's own commits instead. A commit that removes content
 * its own parent had, and that the fork point never had, is a snapshot of an
 * older checkout no matter what the base has done since — decidable from the
 * branch alone, with no base comparison that can collapse.
 */
function selfRevertViolations(commits, forkRev) {
    const violations = [];
    for (let i = 1; i < commits.length; i++) {
        const parent = commits[i - 1];
        const commit = commits[i];
        const entries = nameStatus(parent, commit);
        violations.push(...removedBaseLines(entries, parent, commit, forkRev));
    }
    return violations;
}



function main() {
    const [base, head] = process.argv.slice(2);
    if (!base || !head) {
        console.error("Usage: node scripts/check-pr-base-revert.mjs <base-sha> <head-sha>");
        process.exit(2);
    }

    const labels = (process.env.PR_LABELS ?? "")
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
    if (labels.includes(ALLOW_LABEL)) {
        console.log(`✅ PR carries the \`${ALLOW_LABEL}\` label: deliberate revert, check skipped.`);
        return;
    }

    // The PR's first commit: the oldest commit reachable from head but not
    // from base, following first parents so base merges pulled into the
    // branch (e.g. by auto-update-prs.yml) do not move the fork point.
    const first = git("rev-list", "--reverse", "--first-parent", `${base}..${head}`, "--")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)[0];
    if (!first) {
        console.log("✅ No commits on the PR branch beyond the base: nothing to check.");
        return;
    }

    let forkRev;
    try {
        forkRev = git("rev-parse", `${first}^1`).trim();
    } catch {
        forkRev = EMPTY_TREE;
    }

    let mergeBase;
    try {
        mergeBase = git("merge-base", base, head).trim();
    } catch {
        console.log("✅ Base and head share no history: nothing attributable, check skipped.");
        return;
    }

    const violations = removedBaseLines(payloadEntries(mergeBase, head), mergeBase, head, forkRev);
    const checked = payloadEntries(mergeBase, head).filter(
        ({ status, path, oldPath }) =>
            !status.startsWith("A") && !(GENERATED_BACKLOG_PATHS.has(path) || GENERATED_BACKLOG_PATHS.has(oldPath)),
    ).length;

    // BUG-0583: the payload above is empty when the head tree is the fork-era
    // tree, which is exactly what a stale snapshot looks like. Walk the
    // branch's own commits so that case is still decidable.
    const branchCommits = git("rev-list", "--reverse", "--first-parent", `${base}..${head}`, "--")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    for (const v of selfRevertViolations(branchCommits, forkRev)) {
        violations.push(v);
    }

    // Both passes can name the same removal, e.g. a branch that merged base
    // and then snapshotted. One line per file keeps the report readable.
    const seen = new Set();
    const reported = violations.filter(v => {
        const key = `${v.path} ${v.kind} ${v.count} ${v.samples.join("")}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    if (reported.length === 0) {
        console.log(
            `✅ PR keeps base-branch work intact (${checked} changed path(s) checked since ${first.slice(0, 8)}).`,
        );
        return;
    }

    console.error("❌ This PR reverts work the base branch merged after the PR forked.\n");
    for (const v of reported) {
        if (v.kind === "deleted") {
            console.error(`   deleted file with ${v.count} base-added line(s):  ${v.path}`);
        } else if (v.kind === "binary-revert") {
            console.error(`   binary file reset to the fork snapshot:  ${v.path}`);
        } else {
            console.error(`   removed ${v.count} base-added line(s):  ${v.path}`);
        }
        for (const s of v.samples) console.error(`      - ${s}`);
    }
    console.error(`
This is the BUG-0447 failure mode: a stale checkout pushed over the base
merges silently undoes already-merged work, and squash-merge hides it behind
the PR title. Fetch the base branch and rebase or merge before pushing again.

If the revert is deliberate, a maintainer can add the \`${ALLOW_LABEL}\`
label to this PR (a visible opt-in, not a commit-message token) and re-run.
`);
    process.exit(1);
}

main();
