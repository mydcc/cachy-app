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
 * - `M`, the merge-base of base and head: `diff M..head` is exactly the
 *   payload a squash-merge would apply, so only removals inside it can revert
 *   anything. A branch that simply has not merged the base yet is unaffected.
 * - `P`, the tree the PR started from (first parent of its first commit):
 *   a removed line counts as base-introduced only when the fork-era version
 *   does not contain it. Deleting a pre-existing file, or a line the PR could
 *   already see at fork time, is the PR's own business and passes.
 * - `E`, the content era of the head blob (BUG-0583): `git log
 *   --find-object=<head-blob> M` reports when the head's content was last
 *   current on the base side. When that era predates `M`, the head carries a
 *   pre-fork snapshot and the fork-era excuse is void — the snapshot
 *   predates what the PR "could see" — so the era tree anchors instead of
 *   the fork tree. Without this, `P == M` (a branch that never merged base,
 *   the normal agent shape) excuses every removed line by construction and
 *   the check can never fire.
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
// Bound for one content-era lookup. A breach fails the path closed (reported
// as undecidable) instead of passing silently — but the per-path budget only
// bites on a broken git, ordinary lookups finish in well under a second.
const ERA_TIMEOUT_MS = 30000;
// Era walks are the only expensive step (each scans base history). Stale
// snapshots revert dozens of files, so a small budget always finds the era;
// past it the fork verdict stands, otherwise every large legitimate PR would
// pay a full scan per path.
const ERA_WALK_BUDGET = 8;
// Candidate commits verified per era lookup. Past the cap the blob is
// pathological (e.g. the empty blob) and the era stays unknown.
const MAX_ERA_CANDIDATES = 25;

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

/**
 * Content of a path at a revision, with rename fallback. The base may have
 * renamed the file (the diff's old path is gone at the tip), and a stale
 * head may still carry the old name (the new path is gone at the head).
 * Returns `{ buf, sha }` or null when neither name resolves.
 */
function blobAt(rev, paths) {
    for (const p of new Set(paths)) {
        const buf = blobBuffer(rev, p);
        if (buf !== null) return { buf, sha: blobSha(rev, p), path: p };
    }
    return null;
}

/**
 * When the head's content was last current on the base side, searched from
 * the merge-base inward: anything found there that differs from the
 * merge-base is a strict ancestor of it, i.e. provably pre-fork content.
 *
 * `--find-object` alone is not enough: it also reports the commit that
 * *removed* the blob, whose tree no longer contains it. So every candidate
 * is verified against its own tree, newest first; the first tree that still
 * contains the blob is the era.
 *
 * Returns `{ state: "found", rev }`, `{ state: "unknown" }` (blob never on
 * the base side — PR-authored content, judged by the fork anchor as before),
 * or `{ state: "undecidable" }` (lookup breach — fail closed, report it).
 */
function contentEra(sha, mergeBase) {
    let list;
    try {
        list = execFileSync("git", ["log", "--format=%H", `--find-object=${sha}`, mergeBase], {
            encoding: "utf8",
            timeout: ERA_TIMEOUT_MS,
            stdio: ["ignore", "pipe", "pipe"],
        })
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
    } catch (e) {
        if (e.code === "ETIMEDOUT" || /timed out/i.test(String(e?.message ?? ""))) {
            return { state: "undecidable" };
        }
        return { state: "unknown" };
    }
    if (list.length === 0) return { state: "unknown" };
    // Pathological blobs (e.g. the empty blob) touch hundreds of commits;
    // past the cap the era is unknowable cheaply — same verdict as unknown.
    for (const c of list.slice(0, MAX_ERA_CANDIDATES)) {
        try {
            const tree = execFileSync("git", ["ls-tree", "-r", c], {
                encoding: "utf8",
                maxBuffer: 256 * 1024 * 1024,
                timeout: ERA_TIMEOUT_MS,
                stdio: ["ignore", "pipe", "pipe"],
            });
            if (tree.includes(sha)) return { state: "found", rev: c };
        } catch {
            return { state: "undecidable" };
        }
    }
    return { state: "unknown" };
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
 * Removed lines the anchor version does not contain, per occurrence so
 * duplicated lines only match when every copy is gone. Consumes the passed
 * counts; callers pass a fresh map per path.
 */
function countMissing(removed, anchorCounts) {
    const samples = [];
    let count = 0;
    for (const line of removed) {
        const left = anchorCounts.get(line) ?? 0;
        if (left > 0) {
            anchorCounts.set(line, left - 1);
        } else {
            count += 1;
            if (samples.length < MAX_SAMPLE_LINES) samples.push(line);
        }
    }
    return { count, samples };
}

/**
 * The PR payload: paths changed between merge-base and head. Renames report
 * the old path so both sides of the comparison resolve; pure additions are
 * the PR's own work and skipped by the caller.
 */
function payloadEntries(mergeBase, head) {
    const out = execFileSync("git", ["diff", "--name-status", "-z", mergeBase, head], {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
    });
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

    const violations = [];
    let checked = 0;
    // Collapsed shape (BUG-0583): the branch never merged base, so the fork
    // anchor and the merge-base are the same tree and the fork filter below
    // excuses every removed line by construction. Only in this shape does a
    // second pass re-anchor candidates onto the head blob's content era.
    // Any other shape runs the legacy fork logic exactly as before.
    const collapsed = forkRev === mergeBase;
    const candidates = [];
    for (const { status, oldPath, path } of payloadEntries(mergeBase, head)) {
        if (status.startsWith("A")) continue; // the PR's own addition.
        if (GENERATED_BACKLOG_PATHS.has(path) || GENERATED_BACKLOG_PATHS.has(oldPath)) continue;
        checked += 1;

        // Resolve content on each side with rename fallback: the base may
        // have renamed the file (the diff's old path is gone at the tip).
        // The head side additionally falls back to the old name, but only in
        // the collapsed shape — a stale head may still carry it.
        const mBlob = blobAt(mergeBase, [oldPath, path]);
        const hBlob = blobAt(head, collapsed ? [path, oldPath] : [path]);
        const mBuf = mBlob?.buf ?? null;
        const hBuf = hBlob?.buf ?? null;
        const mSha = mBlob?.sha ?? null;
        const hSha = hBlob?.sha ?? null;

        // Binary blobs have no meaningful lines: only an exact reset to the
        // fork-era blob counts as a revert, anything else is undecidable.
        if ((mBuf !== null && mBuf.includes(0)) || (hBuf !== null && hBuf.includes(0))) {
            const pSha = blobSha(forkRev, oldPath);
            if (hSha === pSha && hSha !== mSha) {
                violations.push({ path, kind: "binary-revert", count: 1, samples: [] });
            }
            continue;
        }

        // Lines the merge payload removes, per occurrence so duplicated lines
        // only match when every copy is gone.
        const headCounts = countLines(hBuf);
        const removed = [];
        for (const [line, count] of countLines(mBuf)) {
            const kept = Math.min(headCounts.get(line) ?? 0, count);
            headCounts.set(line, (headCounts.get(line) ?? 0) - kept);
            for (let i = 0; i < count - kept; i++) removed.push(line);
        }
        if (removed.length === 0) continue;

        // …of which the fork-era version does not contain: base-introduced.
        const forkCounts = countLines(blobAt(forkRev, [oldPath, path])?.buf ?? null);
        const { count: baseRemoved, samples } = countMissing(removed, forkCounts);
        if (baseRemoved > 0) {
            violations.push({
                path,
                kind: hBuf === null ? "deleted" : "removed-lines",
                count: baseRemoved,
                samples,
            });
            continue;
        }
        // Fully excused by the fork anchor. In the collapsed shape that
        // excuse is void by construction, so the path becomes a candidate
        // for era re-anchoring in the second pass below.
        if (collapsed) {
            candidates.push({ path, oldPath, hSha: hBlob?.sha ?? null, removed, deleted: hBuf === null });
        }
    }

    // Second pass (collapsed shape only): establish one snapshot era from the
    // candidates and recount every candidate against it. Re-anchoring onto E
    // is exactly the legacy rule with the fork replaced by the content era —
    // which is what the fork would have been had the snapshot not predated
    // it. Paths whose era lookup breaches fail closed as undecidable;
    // paths with PR-authored content keep the fork verdict, so ordinary
    // edits stay green.
    if (collapsed && candidates.length > 0) {
        let eraRev = null;
        let walks = 0;
        for (const c of candidates) {
            if (eraRev !== null || walks >= ERA_WALK_BUDGET || c.hSha === null) continue;
            walks += 1;
            const era = contentEra(c.hSha, mergeBase);
            if (era.state === "undecidable") {
                violations.push({
                    path: c.path,
                    kind: "undecidable",
                    count: c.removed.length,
                    samples: c.removed.slice(0, MAX_SAMPLE_LINES),
                });
                c.decided = true;
            } else if (era.state === "found" && era.rev !== mergeBase) {
                eraRev = era.rev;
            }
        }
        if (eraRev !== null) {
            for (const c of candidates) {
                if (c.decided) continue;
                const anchorCounts = countLines(blobAt(eraRev, [c.oldPath, c.path])?.buf ?? null);
                const recounted = countMissing(c.removed, anchorCounts);
                if (recounted.count > 0) {
                    violations.push({
                        path: c.path,
                        kind: c.deleted ? "deleted" : "removed-lines",
                        count: recounted.count,
                        samples: recounted.samples,
                    });
                }
            }
        }
    }

    if (violations.length === 0) {
        console.log(
            `✅ PR keeps base-branch work intact (${checked} changed path(s) checked since ${first.slice(0, 8)}).`,
        );
        return;
    }

    console.error("❌ This PR reverts work the base branch merged after the PR forked.\n");
    for (const v of violations) {
        if (v.kind === "deleted") {
            console.error(`   deleted file with ${v.count} base-added line(s):  ${v.path}`);
        } else if (v.kind === "undecidable") {
            console.error(`   undecidable path (content-era lookup breached):  ${v.path}`);
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
