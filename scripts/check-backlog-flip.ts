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
 * Exit 0 = rule satisfied or not applicable. Exit 1 = the linked item is not
 * flipped, or a lookup still failed after bounded retries. This is a required
 * gate: deterministic findings fail closed, and so does an infrastructure
 * lookup failure — a red, re-runnable check, never a silent pass.
 */

import { execFileSync } from "node:child_process";
import {
    checkBacklogFlip,
    findClosingTrailer,
    findItemFile,
    readStatus,
} from "./lib/backlog-flip";
import { withRetry, LOOKUP_ATTEMPTS } from "./lib/retry";

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

const declared = findClosingTrailer(body);
if (declared === null) {
    console.log("✅ [backlog-flip] no closing trailer; nothing to check.");
    process.exit(0);
}

// Labels decide whether the issue is a backlog mirror. Lookup failures are
// retried; if they persist the gate fails closed (a required check must not
// pass on unknown state).
const labels = withRetry<string[]>(() => {
    try {
        const stdout = execFileSync(
            "gh",
            ["issue", "view", String(declared), "--json", "labels", "--jq", ".labels[].name"],
            { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GH_TOKEN: token ?? "" } },
        );
        return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    } catch {
        return null;
    }
});
if (labels === null) {
    console.error(
        `❌ [backlog-flip] labels of #${declared} unreadable after ${LOOKUP_ATTEMPTS} attempts; ` +
        `re-run the check (infrastructure failure, not a rule violation).`,
    );
    process.exit(1);
}

const idLabel = labels.find((name) => name.startsWith("backlog-id:"));
if (!idLabel) {
    const verdict = checkBacklogFlip({ body, issueLabels: labels, baseStatus: null, fileDiff: "" });
    console.log(`✅ [backlog-flip] ${verdict.detail}.`);
    process.exit(0);
}
const itemId = idLabel.slice("backlog-id:".length);

// Locate the item file on base and in this diff. `git ls-tree` on the base
// ref is cheaper and staler-proof compared to walking the worktree.
const tree = withRetry(() => git(["ls-tree", "-r", "--name-only", base, "docs/backlog"]));
if (tree === null) {
    console.error(
        `❌ [backlog-flip] cannot read the ${base} tree after ${LOOKUP_ATTEMPTS} attempts; ` +
        `re-run the check (infrastructure failure, not a rule violation).`,
    );
    process.exit(1);
}
const itemFile = findItemFile(tree.split("\n"), itemId);
if (itemFile === null) {
    console.error(
        `❌ [backlog-flip] #${declared} links to backlog item ${itemId}, but no ` +
        `docs/backlog/**/${itemId}-*.md exists on ${base}.`,
    );
    process.exit(1);
}

const baseContent = withRetry(() => git(["show", `${base}:${itemFile}`]));
if (baseContent === null) {
    console.error(
        `❌ [backlog-flip] cannot read ${itemFile} on ${base} after ${LOOKUP_ATTEMPTS} attempts; ` +
        `re-run the check (infrastructure failure, not a rule violation).`,
    );
    process.exit(1);
}
const baseStatus = readStatus(baseContent);

const fileDiff = withRetry(() => git(["diff", `${base}...HEAD`, "--", itemFile]));
if (fileDiff === null) {
    console.error(
        `❌ [backlog-flip] cannot diff ${itemFile} after ${LOOKUP_ATTEMPTS} attempts; ` +
        `re-run the check (infrastructure failure, not a rule violation).`,
    );
    process.exit(1);
}

const verdict = checkBacklogFlip({ body, issueLabels: labels, baseStatus, fileDiff });
if (verdict.outcome === "pass") {
    console.log(`✅ [backlog-flip] ${verdict.detail}.`);
    process.exit(0);
}

console.error(`❌ [backlog-flip] ${verdict.detail}`);
process.exit(1);
