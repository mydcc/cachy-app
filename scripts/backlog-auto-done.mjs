#!/usr/bin/env node
// Flips a backlog item to `done` once its linked PR merged, so no manual
// done-PR is needed anymore. Runs in backlog-auto-done.yml (on merge) or
// via workflow_dispatch for safe manual testing.
//
// Guards (anything ambiguous only logs and exits 0):
//   - only the enforced `Fixes #N` trailer at a line start counts
//     (never prose — lesson from BUG-0220)
//   - #N must be a backlog mirror issue (backlog-id: label) and closed
//   - the item file must exist and be in specced/ready/in-progress
//     (done/dropped are never touched)
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.env.GITHUB_REPOSITORY ?? "mydcc/cachy-app";
const PR_NUMBER = process.env.PR_NUMBER ?? "";
const BOT_BRANCH = "bot/backlog-auto-done";

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}
function git(args) {
  execFileSync("git", args, { stdio: "pipe" });
}
function log(msg) {
  console.log(`[auto-done] ${msg}`);
}

function prBody() {
  if (process.env.PR_BODY) return process.env.PR_BODY;
  if (!PR_NUMBER) return "";
  try {
    return gh(["api", `repos/${REPO}/pulls/${PR_NUMBER}`, "--jq", ".body"]);
  } catch {
    return "";
  }
}

function findItemFile(dir, itemId) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const hit = findItemFile(full, itemId);
      if (hit) return hit;
    } else if (entry.startsWith(`${itemId}-`) && entry.endsWith(".md")) {
      return full;
    }
  }
  return null;
}

function main() {
  if (!PR_NUMBER) {
    log("no PR number in environment; nothing to do");
    return;
  }
  const trailer = prBody().match(/^Fixes #(\d+)\b/m);
  if (!trailer) {
    log(`PR #${PR_NUMBER} has no Fixes trailer; nothing to do`);
    return;
  }
  const issueNo = trailer[1];

  let issue;
  try {
    issue = JSON.parse(
      gh([
        "api",
        `repos/${REPO}/issues/${issueNo}`,
        "--jq",
        "{state, labels: [.labels[].name]}",
      ]),
    );
  } catch {
    log(`cannot read issue #${issueNo}; skipping`);
    return;
  }
  if (issue.state !== "closed") {
    log(`issue #${issueNo} is not closed; skipping`);
    return;
  }
  const idLabel = issue.labels.find((name) => name.startsWith("backlog-id:"));
  if (!idLabel) {
    log(`issue #${issueNo} is not a backlog mirror issue; skipping`);
    return;
  }
  const itemId = idLabel.slice("backlog-id:".length);

  const file = findItemFile("docs/backlog", itemId);
  if (!file) {
    log(`no backlog file for ${itemId}; skipping`);
    return;
  }
  const content = readFileSync(file, "utf8");
  const status = content.match(/^status:\s*(.+)$/m)?.[1]?.trim();
  if (!["specced", "ready", "in-progress"].includes(status)) {
    log(`${itemId} is already ${status}; skipping`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const next = content
    .replace(/^status:\s*.+$/m, "status: done")
    .replace(
      /\s*$/,
      `\n- Done ${today}: merged via #${PR_NUMBER}; first release containing it TBD by the next chore(release).\n`,
    );
  writeFileSync(file, next);

  git(["checkout", "-B", BOT_BRANCH]);
  git(["add", file]);
  git([
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=github-actions[bot]@users.noreply.github.com",
    "commit",
    "-m",
    `chore(backlog): mark ${itemId} done after merge (#${PR_NUMBER})`,
  ]);
  git(["push", "--force-with-lease", "origin", BOT_BRANCH]);
  let open = "0";
  try {
    open = gh([
      "pr",
      "list",
      "--head",
      BOT_BRANCH,
      "--base",
      "develop",
      "--state",
      "open",
      "--json",
      "number",
      "--jq",
      "length",
    ]).trim();
  } catch {
    open = "0";
  }
  if (open === "0") {
    let created = "";
    try {
      created = gh([
        "pr",
        "create",
        "--base",
        "develop",
        "--head",
        BOT_BRANCH,
        "--title",
        "chore(backlog): auto-done flips",
        "--body",
        "Automated done-flips for backlog items whose linked PRs merged (see job logs).",
        "--json",
        "number",
        "--jq",
        ".number",
      ]).trim();
    } catch {
      log("auto-done PR creation failed; the flip stays on the branch for the next run");
      return;
    }
    // Enable auto-merge so the flip lands as soon as checks pass instead of
    // waiting for a human — same pattern as the backlog-index PR. This
    // shrinks the merge window in which the sync grace guard has to cover.
    // Never fatal: without auto-merge the PR just waits for manual merge.
    try {
      gh(["pr", "merge", created, "--auto", "--squash"]);
    } catch {
      log(`auto-merge unavailable for auto-done PR #${created}; please merge it manually`);
    }
  } else {
    log("updated the existing auto-done PR");
  }
  log(`flipped ${itemId} to done`);
}

main();
