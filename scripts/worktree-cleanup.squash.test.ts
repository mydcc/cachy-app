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

describe("worktree-cleanup.sh squash-merge detection", () => {
  let root = "";
  let main = "";
  let bin = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wco-cleanup-"));
    bin = join(root, "bin");
    mkdirSync(bin);
    // Stub gh: reports exactly the heads listed in GH_MERGED_HEADS as merged.
    writeFileSync(
      join(bin, "gh"),
      [
        "#!/usr/bin/env bash",
        'head=""; prev=""',
        'for a in "$@"; do',
        '  if [ "$prev" = "--head" ]; then head="$a"; fi',
        '  prev="$a"',
        "done",
        'case " $GH_MERGED_HEADS " in',
        '  *" $head "*) printf \'[{"number": 1}]\\n\' ;;',
        "  *) printf '[]\\n' ;;",
        "esac",
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

  function run(branch: string, mergedHeads: string) {
    return execFileSync("bash", [SCRIPT, branch], {
      cwd: main,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`,
        GH_MERGED_HEADS: mergedHeads,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
      },
    });
  }

  function makeWorktree(branch: string): string {
    git(main, "checkout", "-b", branch);
    commitFile(main, "f.txt", "v2", `${branch} work`);
    git(main, "checkout", "develop");
    const wt = join(root, `wt-${branch.replace("/", "-")}`);
    git(main, "worktree", "add", wt, branch);
    return wt;
  }

  it("retires a squash-merged branch once GitHub reports it merged", () => {
    const wt = makeWorktree("feat/squashed");
    git(main, "merge", "--squash", "feat/squashed");
    git(main, "commit", "-m", "squash");
    git(main, "push", "origin", "develop");

    // Sanity: squash leaves no ancestry trail — this is the refused case.
    expect(() =>
      execFileSync(
        "git",
        ["merge-base", "--is-ancestor", "feat/squashed", "origin/develop"],
        { cwd: main, stdio: "pipe" },
      ),
    ).toThrow();

    const out = run("feat/squashed", "feat/squashed");
    expect(out).toContain("retired  feat/squashed");
    expect(existsSync(wt)).toBe(false);
    expect(() =>
      execFileSync("git", ["rev-parse", "--verify", "feat/squashed"], {
        cwd: main,
        stdio: "pipe",
      }),
    ).toThrow();
  });

  it("refuses an unmerged branch GitHub does not report", () => {
    const wt = makeWorktree("feat/open");
    let output = "";
    try {
      run("feat/open", "");
      expect.unreachable("script should have refused the worktree");
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      output = `${e.stdout ?? ""}${e.stderr ?? ""}` || String(err);
    }
    expect(output).toMatch(/not merged into origin\/develop/);
    expect(existsSync(wt)).toBe(true);
  });

  it("still retires a normally merged branch without asking GitHub", () => {
    const wt = makeWorktree("feat/merged");
    git(main, "merge", "--no-ff", "feat/merged", "-m", "merge");
    git(main, "push", "origin", "develop");

    const out = run("feat/merged", "");
    expect(out).toContain("retired  feat/merged");
    expect(existsSync(wt)).toBe(false);
  });
});
