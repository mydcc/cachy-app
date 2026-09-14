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
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("./worktree-cleanup.sh", import.meta.url).pathname;

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function commitFile(dir: string, name: string, content: string, msg: string) {
  writeFileSync(join(dir, name), content);
  git(dir, "add", name);
  git(dir, "commit", "-m", msg);
}

describe("worktree-cleanup.sh merge detection", () => {
  let root = "";
  let main = "";
  let bin = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wco-cleanup-"));
    bin = join(root, "bin");
    mkdirSync(bin);
    // Stub gh: GH_MERGED lists "head=oid" pairs — one merged PR each, whose
    // head commit was <oid>. Mirrors `--json headRefOid --jq '.[].headRefOid'`.
    writeFileSync(
      join(bin, "gh"),
      [
        "#!/usr/bin/env bash",
        'head=""; prev=""',
        'for a in "$@"; do',
        '  if [ "$prev" = "--head" ]; then head="$a"; fi',
        '  prev="$a"',
        "done",
        "for pair in $GH_MERGED; do",
        '  [ "${pair%%=*}" = "$head" ] && printf \'%s\\n\' "${pair#*=}"',
        "done",
        "exit 0",
        "",
      ].join("\n"),
    );
    chmodSync(join(bin, "gh"), 0o755);

    const origin = join(root, "origin.git");
    execFileSync("git", ["init", "--bare", "-b", "develop", origin], {
      stdio: "pipe",
    });
    main = join(root, "main");
    execFileSync("git", ["init", "-b", "develop", main], { stdio: "pipe" });
    git(main, "config", "user.email", "test@example.com");
    git(main, "config", "user.name", "test");
    git(main, "config", "commit.gpgsign", "false");
    commitFile(main, "f.txt", "v1", "init");
    git(main, "remote", "add", "origin", origin);
    git(main, "push", "-u", "origin", "develop");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function run(args: string[], merged = "") {
    return execFileSync("bash", [SCRIPT, ...args], {
      cwd: main,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`,
        GH_MERGED: merged,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
      },
    });
  }

  function runRefused(args: string[], merged = ""): string {
    try {
      run(args, merged);
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      return `${e.stdout ?? ""}${e.stderr ?? ""}` || String(err);
    }
    return expect.unreachable("script should have refused the worktree");
  }

  function tip(ref: string): string {
    return execFileSync("git", ["rev-parse", ref], {
      cwd: main,
      encoding: "utf8",
    }).trim();
  }

  function branchExists(branch: string): boolean {
    try {
      git(main, "rev-parse", "--verify", `refs/heads/${branch}`);
      return true;
    } catch {
      return false;
    }
  }

  function addWorktree(branch: string): string {
    const wt = join(root, `wt-${branch.replace("/", "-")}`);
    git(main, "worktree", "add", wt, branch);
    return wt;
  }

  function makeWorktree(branch: string): string {
    git(main, "checkout", "-b", branch);
    commitFile(main, "f.txt", `${branch} v2`, `${branch} work`);
    git(main, "checkout", "develop");
    return addWorktree(branch);
  }

  // A task worktree fresh off develop, before its first commit.
  function makeFreshWorktree(branch: string): string {
    const wt = join(root, `wt-${branch.replace("/", "-")}`);
    git(main, "worktree", "add", "-b", branch, wt, "origin/develop");
    return wt;
  }

  function squashMerge(branch: string) {
    git(main, "merge", "--squash", branch);
    git(main, "commit", "-m", `squash ${branch}`);
    git(main, "push", "origin", "develop");
  }

  it("retires a squash-merged branch once GitHub reports its head merged", () => {
    const wt = makeWorktree("feat/squashed");
    const head = tip("feat/squashed");
    squashMerge("feat/squashed");

    // Sanity: squash leaves no ancestry trail — only the PR can prove it.
    expect(() =>
      execFileSync(
        "git",
        ["merge-base", "--is-ancestor", "feat/squashed", "origin/develop"],
        { cwd: main, stdio: "pipe" },
      ),
    ).toThrow();

    const out = run(["feat/squashed"], `feat/squashed=${head}`);
    expect(out).toContain("retired  feat/squashed");
    expect(existsSync(wt)).toBe(false);
    expect(branchExists("feat/squashed")).toBe(false);
  });

  it("refuses an unmerged branch GitHub does not report", () => {
    const wt = makeWorktree("feat/open");
    expect(runRefused(["feat/open"])).toMatch(/not merged into origin\/develop/);
    expect(existsSync(wt)).toBe(true);
  });

  it("still retires a merge-commit merged branch without asking GitHub", () => {
    const wt = makeWorktree("feat/merged");
    git(main, "merge", "--no-ff", "feat/merged", "-m", "merge");
    git(main, "push", "origin", "develop");

    const out = run(["feat/merged"]);
    expect(out).toContain("retired  feat/merged");
    expect(existsSync(wt)).toBe(false);
    expect(branchExists("feat/merged")).toBe(false);
  });

  it("refuses a fresh worktree that has no commits of its own", () => {
    const wt = makeFreshWorktree("feat/fresh");
    expect(runRefused(["feat/fresh"])).toMatch(/no commits beyond origin\/develop/);
    expect(existsSync(wt)).toBe(true);
    expect(branchExists("feat/fresh")).toBe(true);
  });

  it("keeps a fresh worktree in an --all --apply sweep", () => {
    const fresh = makeFreshWorktree("feat/fresh");
    const merged = makeWorktree("feat/merged");
    git(main, "merge", "--no-ff", "feat/merged", "-m", "merge");
    git(main, "push", "origin", "develop");

    const out = run(["--all", "--apply"]);
    expect(out).toMatch(/keep {5}feat\/fresh — no commits beyond/);
    expect(out).toContain("retired  feat/merged");
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(merged)).toBe(false);
  });

  it("refuses a fresh worktree off an older develop commit", () => {
    const old = tip("origin/develop");
    commitFile(main, "g.txt", "later", "later develop work");
    git(main, "push", "origin", "develop");
    git(main, "branch", "feat/stale", old);
    const wt = addWorktree("feat/stale");

    expect(runRefused(["feat/stale"])).toMatch(/no commits beyond/);
    expect(existsSync(wt)).toBe(true);
  });

  it("refuses a fresh branch reusing the name of an earlier merged PR", () => {
    // First round: worked on, squash-merged, retired.
    makeWorktree("feat/reused");
    const firstHead = tip("feat/reused");
    squashMerge("feat/reused");
    run(["feat/reused"], `feat/reused=${firstHead}`);
    expect(branchExists("feat/reused")).toBe(false);

    // Second round: same name, brand-new worktree, GitHub still says merged.
    const wt = makeFreshWorktree("feat/reused");
    expect(runRefused(["feat/reused"], `feat/reused=${firstHead}`)).toMatch(
      /no commits beyond/,
    );
    expect(existsSync(wt)).toBe(true);
  });

  it("refuses a squash-merged branch that gained commits after the merge", () => {
    const wt = makeWorktree("feat/followup");
    const mergedHead = tip("feat/followup");
    squashMerge("feat/followup");
    commitFile(wt, "h.txt", "unpushed", "follow-up work");

    expect(
      runRefused(["feat/followup"], `feat/followup=${mergedHead}`),
    ).toMatch(/not merged into origin\/develop/);
    expect(existsSync(wt)).toBe(true);
    expect(branchExists("feat/followup")).toBe(true);
  });

  it("--abandon retires a fresh worktree and deletes its branch", () => {
    const wt = makeFreshWorktree("feat/abandoned");
    const out = run(["--abandon", "feat/abandoned"]);
    expect(out).toContain("retired  feat/abandoned");
    expect(existsSync(wt)).toBe(false);
    expect(branchExists("feat/abandoned")).toBe(false);
  });

  it("--abandon refuses a branch that carries commits", () => {
    const wt = makeWorktree("feat/worked");
    expect(runRefused(["--abandon", "feat/worked"])).toMatch(
      /has commits of its own/,
    );
    expect(existsSync(wt)).toBe(true);
  });
});
