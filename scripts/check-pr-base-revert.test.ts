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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const SCRIPT = new URL("./check-pr-base-revert.mjs", import.meta.url).pathname;

function testEnv() {
    return {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
    };
}

function git(cwd: string, ...args: string[]) {
    return execFileSync("git", args, { cwd, encoding: "utf8", env: testEnv() }).trim();
}

function commitFile(dir: string, name: string, content: string, msg: string) {
    writeFileSync(join(dir, name), content);
    git(dir, "add", name);
    git(dir, "commit", "-m", msg);
}

/** Like `commitFile`, but for a nested path (e.g. `docs/backlog/INDEX.md`). */
function commitPath(dir: string, name: string, content: string, msg: string) {
    const full = join(dir, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    git(dir, "add", name);
    git(dir, "commit", "-m", msg);
}

function runScript(cwd: string, base: string, head: string, extraEnv: Record<string, string> = {}) {
    try {
        const output = execFileSync("node", [SCRIPT, base, head], {
            cwd,
            encoding: "utf8",
            env: { ...testEnv(), ...extraEnv },
        });
        return { status: 0, output };
    } catch (e) {
        const err = e as { status?: number; stdout?: string; stderr?: string };
        return { status: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
}

describe("check-pr-base-revert.mjs", () => {
    let root = "";

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "pr-base-revert-"));
        git(root, "init", "-b", "develop");
        git(root, "config", "user.email", "test@example.com");
        git(root, "config", "user.name", "test");
        git(root, "config", "commit.gpgsign", "false");
        commitFile(root, "common.txt", "base v1\n", "init");
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    /** A stale agent snapshot: head's tree is the fork-era tree again, parented on the branch tip. */
    function pushStaleSnapshot(forkTreeHolder: string) {
        const tree = git(root, "rev-parse", `${forkTreeHolder}^{tree}`);
        const stale = git(root, "commit-tree", tree, "-p", "HEAD", "-m", "fix(ui): intended change");
        git(root, "reset", "--hard", stale);
        return stale;
    }

    it("fails when a stale snapshot reverts base changes merged into the branch (BUG-0447)", () => {
        git(root, "checkout", "-b", "feat");
        commitFile(root, "intended.txt", "intended\n", "fix(ui): intended change");
        const first = git(root, "rev-parse", "HEAD");
        git(root, "checkout", "develop");
        commitFile(root, "common.txt", "base v1\nbase v2 line\n", "base work");
        commitFile(root, "merged.ts", "merged\n", "more base work");
        git(root, "checkout", "feat");
        git(root, "merge", "develop", "-m", "chore: merge develop into feat");
        const stale = pushStaleSnapshot(first);

        const result = runScript(root, git(root, "rev-parse", "develop"), stale);

        expect(result.status).toBe(1);
        expect(result.output).toContain("merged.ts");
        expect(result.output).toContain("common.txt");
        expect(result.output).toContain("allow-base-revert");
    });

    it("passes for an ordinary PR that was updated from base and only adds its own change", () => {
        git(root, "checkout", "-b", "feat");
        commitFile(root, "intended.txt", "intended\n", "fix(ui): intended change");
        git(root, "checkout", "develop");
        commitFile(root, "common.txt", "base v1\nbase v2 line\n", "base work");
        commitFile(root, "merged.ts", "merged\n", "more base work");
        git(root, "checkout", "feat");
        git(root, "merge", "develop", "-m", "chore: merge develop into feat");
        commitFile(root, "intended2.txt", "more intended\n", "fix(ui): follow-up");

        const result = runScript(root, git(root, "rev-parse", "develop"), git(root, "rev-parse", "feat"));

        expect(result.status).toBe(0);
        expect(result.output).toContain("keeps base-branch work intact");
    });

    /**
     * PR #3718, the shape the guard cleared by accident.
     *
     * The branch never merges `develop` — which is what AGENTS.md's "Jules
     * Sandbox Hygiene" tells agents to do — and its tip is a full-tree
     * snapshot committed on top of the branch's own earlier work. The real
     * merge had `base` = the branch's own fork point, so `merge-base == first^1`
     * and the fork-era anchor carries every line the payload removes.
     *
     * Recovered with `git fetch origin pull/3718/head`: head `d6e58dec`, parent
     * `ea116d72`, and the squash on develop carried `d6e58dec`'s tree verbatim.
     * Here `merged.ts` stands in for the work `develop` gained after the fork.
     */
    it("fails when a branch that never merged base commits a stale snapshot (PR #3718)", () => {
        git(root, "checkout", "-b", "feat");
        commitFile(root, "intended.txt", "intended\n", "perf(journal): intended change");

        // The base moves on while the branch does not know it.
        git(root, "checkout", "develop");
        commitFile(root, "common.txt", "base v1\nbase v2 line\n", "base work");
        commitFile(root, "merged.ts", "merged\n", "more base work");

        // The branch then lands real work of its own, on a checkout that has
        // seen none of the above. This is ea116d72 in the real incident.
        git(root, "checkout", "feat");
        commitFile(root, "journalSort.ts", "export const sort = 1;\n", "perf(journal): add helper");

        // The tip is a whole-tree snapshot of that same stale checkout, so it
        // silently drops the helper its own parent just added — d6e58dec.
        const staleTree = git(root, "rev-parse", "HEAD~1^{tree}");
        const stale = git(root, "commit-tree", staleTree, "-p", "HEAD", "-m", "perf(journal): intended change");
        git(root, "checkout", "--detach", stale);

        const result = runScript(root, git(root, "rev-parse", "develop"), stale);

        expect(result.status).toBe(1);
        expect(result.output).toContain("journalSort.ts");
    });

    /**
     * The same shape without the regression: the branch's own commits are
     * intact and the base work it never saw is simply not there because the
     * branch predates it. The era of the head's blob is the merge-base, so
     * this must pass -- it is the control that keeps the fix from flagging
     * every un-merged branch.
     */
    it("passes for a branch that never merged base but made no snapshot commit", () => {
        git(root, "checkout", "-b", "feat");
        commitFile(root, "intended.txt", "intended\n", "perf(journal): intended change");
        const head = git(root, "rev-parse", "HEAD");

        git(root, "checkout", "develop");
        commitFile(root, "merged.ts", "merged\n", "more base work");

        const result = runScript(root, git(root, "rev-parse", "develop"), head);

        expect(result.status).toBe(0);
        expect(result.output).toContain("keeps base-branch work intact");
    });

    it("passes for a PR that deletes a file that already existed at fork time", () => {
        commitFile(root, "old.txt", "old\n", "pre-existing file");
        git(root, "checkout", "-b", "feat");
        git(root, "rm", "old.txt");
        git(root, "commit", "-m", "chore: drop obsolete file");
        git(root, "checkout", "develop");
        commitFile(root, "merged.ts", "merged\n", "unrelated base work");

        const result = runScript(root, git(root, "rev-parse", "develop"), git(root, "rev-parse", "feat"));

        expect(result.status).toBe(0);
    });

    it("passes a stale snapshot when the opt-in label is present", () => {
        git(root, "checkout", "-b", "feat");
        commitFile(root, "intended.txt", "intended\n", "fix(ui): intended change");
        const first = git(root, "rev-parse", "HEAD");
        git(root, "checkout", "develop");
        commitFile(root, "merged.ts", "merged\n", "more base work");
        git(root, "checkout", "feat");
        git(root, "merge", "develop", "-m", "chore: merge develop into feat");
        const stale = pushStaleSnapshot(first);

        const result = runScript(
            root,
            git(root, "rev-parse", "develop"),
            stale,
            { PR_LABELS: "bug,allow-base-revert" },
        );

        expect(result.status).toBe(0);
        expect(result.output).toContain("deliberate revert");
    });

    it("passes when the branch adds nothing beyond the base", () => {
        const base = git(root, "rev-parse", "develop");
        const result = runScript(root, base, base);
        expect(result.status).toBe(0);
    });

    /**
     * The shape that tripped the guard on the FEAT-0454 review (PR #3297): the
     * branch and the base each rewrite one line of a two-line file, the branch
     * merges the base, then regenerates the second line. The base's line is
     * gone from the payload and was not present at the fork, so the raw check
     * flags it; the path decides whether that is churn or a revert.
     */
    function baseAndBranchRewriteOneLine(path: string) {
        const content = (head: string, value: string) =>
            `${head}\n${"filler\n".repeat(8)}${value}\n`;
        commitPath(root, path, content("head", "value A"), "seed");
        git(root, "checkout", "-b", "feat");
        commitPath(root, path, content("head-edit", "value A"), "branch edits its own line");
        git(root, "checkout", "develop");
        commitPath(root, path, content("head", "value B"), "base rewrites the other line");
        git(root, "checkout", "feat");
        git(root, "merge", "develop", "-m", "chore: merge develop into feat");
        commitPath(root, path, content("head-edit", "value C"), "branch regenerates");
        return { base: git(root, "rev-parse", "develop"), head: git(root, "rev-parse", "feat") };
    }

    it("ignores regenerated backlog index churn (BUG-0447 review, PR #3297)", () => {
        const { base, head } = baseAndBranchRewriteOneLine("docs/backlog/INDEX.md");

        const result = runScript(root, base, head);

        expect(result.status).toBe(0);
        expect(result.output).toContain("keeps base-branch work intact");
    });

    it("still fails that shape on a checked path, so the exclusion is narrow", () => {
        const { base, head } = baseAndBranchRewriteOneLine("src/notes.md");

        const result = runScript(root, base, head);

        expect(result.status).toBe(1);
        expect(result.output).toContain("src/notes.md");
    });
});
