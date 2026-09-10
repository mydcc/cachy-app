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
 * CI runner for the flip-in-fix-PR rule (no bots).
 *
 * A PR whose description carries `Fixes #N` for a backlog mirror issue must
 * flip that item to `status: done` in its own diff. Runs in
 * `.github/workflows/pr-body-lint.yml` next to the description checks.
 *
 * Reads everything from the environment (same injection-safe pattern as
 * `lint-pr-body-refs.ts` — the PR body is untrusted external content):
 *   PR_BODY            raw PR description
 *   BASE_REF           base branch short name, e.g. `develop` (no `origin/`)
 *   GH_TOKEN           for the read-only `gh issue view` call
 *
 * Exit 0 = rule satisfied or not applicable. Exit 1 = the linked item is
 * not flipped. GitHub/API flakes fail OPEN with a warning (a retry on the
 * next push re-evaluates); deterministic findings fail CLOSED.
 */

import { execFileSync } from "node:child_process";
import {
    checkBacklogFlip,
    findFixesTrailer,
    findItemFile,
    readStatus,
} from "./lib/backlog-flip";

const body = process.env.PR_BODY ?? "";
const baseRef = process.env.BASE_REF || "develop";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const base = `origin/${baseRef}`;

function git(args: string[]): string | null {
    try {
        return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch {
        return null;
    }
}

function warn(msg: string): void {
    console.warn(`⚠️ [backlog-flip] ${msg}`);
}

const declared = findFixesTrailer(body);
if (declared === null) {
    console.log("✅ [backlog-flip] no Fixes trailer; nothing to check.");
    process.exit(0);
}

// Labels decide whether the issue is a backlog mirror. Unreadable labels
// (API flake, missing token) fail open — the lib documents why.
let labels: string[] | null = null;
try {
    const stdout = execFileSync(
        "gh",
        ["issue", "view", String(declared), "--json", "labels", "--jq", ".labels[].name"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GH_TOKEN: token ?? "" } },
    );
    labels = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
} catch {
    warn(`cannot read labels of #${declared}; skipping (retry on next push).`);
}

const idLabel = labels?.find((name) => name.startsWith("backlog-id:"));
if (labels === null || !idLabel) {
    const verdict = checkBacklogFlip({ body, issueLabels: labels, baseStatus: null, fileDiff: "" });
    console.log(`✅ [backlog-flip] ${verdict.detail}.`);
    process.exit(0);
}
const itemId = idLabel.slice("backlog-id:".length);

// Locate the item file on base and in this diff. `git ls-tree` on the base
// ref is cheaper and staler-proof compared to walking the worktree.
const tree = git(["ls-tree", "-r", "--name-only", base, "docs/backlog"]) ?? "";
const itemFile = findItemFile(tree.split("\n"), itemId);
if (itemFile === null) {
    console.error(
        `❌ [backlog-flip] #${declared} links to backlog item ${itemId}, but no ` +
        `docs/backlog/**/${itemId}-*.md exists on ${base}.`,
    );
    process.exit(1);
}

const baseContent = git(["show", `${base}:${itemFile}`]) ?? "";
const baseStatus = readStatus(baseContent);
const fileDiff = git(["diff", `${base}...HEAD`, "--", itemFile]) ?? "";

const verdict = checkBacklogFlip({ body, issueLabels: labels, baseStatus, fileDiff });
if (verdict.outcome === "pass") {
    console.log(`✅ [backlog-flip] ${verdict.detail}.`);
    process.exit(0);
}

console.error(`❌ [backlog-flip] ${verdict.detail}`);
process.exit(1);
