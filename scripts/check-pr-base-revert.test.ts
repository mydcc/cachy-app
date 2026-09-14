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
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
});
