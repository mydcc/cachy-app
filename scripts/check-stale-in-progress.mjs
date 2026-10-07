#!/usr/bin/env node
/*
 * Flags backlog items that are still `in-progress` while the branch they name
 * has already been merged.
 *
 * Why this cannot live in the pre-merge checks:
 *
 *   `check-backlog-flip.ts` fires when a PR closes an issue whose label names
 *   a backlog item, and requires that item to reach `status: done`. That misses
 *   the common shape: a PR opens a *new* item with `status: in-progress`,
 *   carries no closing reference because there is no issue yet, and merges.
 *   `in-progress` is correct while that PR is open — the flip is simply
 *   forgotten afterwards, and nothing before the merge can notice.
 *
 *   Observed twice in one session: FEAT-0643 and FEAT-0644 both shipped and sat
 *   on `in-progress` for the rest of it, because their PRs carried `[no issue]`
 *   and the flip check had nothing to fire on.
 *
 * What makes this detectable at all is the front-matter `branch:` field, which
 * 196 of 523 items carry. An earlier count in this session found only 19 and
 * concluded the information was largely absent — that count had missed the
 * dominant form.
 *
 * A stale item is not cosmetic: AGENTS.md tells every agent to stop when an
 * item is `in-progress` and the assignee is someone else. A claim whose work
 * already landed therefore blocks the item for everyone, indefinitely.
 *
 * Usage:  node scripts/check-stale-in-progress.mjs
 * Exit:   1 when at least one stale claim is found, else 0.
 *
 * Needs `gh` and a token (GH_TOKEN / GITHUB_TOKEN) for the merged-PR lookup.
 * With neither, it fails closed: an unchecked backlog gate that silently passes
 * is the failure mode this whole check exists to prevent.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";

const BACKLOG = "docs/backlog";

/** Minimal front-matter reader: the fields this script needs are plain scalars. */
function frontMatter(text, file) {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  const out = {};
  for (const line of text.slice(3, end).split("\n")) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/**
 * The branch an item claims, from either convention in use.
 *
 * `branch:` in front matter is the dominant form (196 items); a `Branch:` line
 * in the body is the older one (19). FEAT-0335's front-matter value carries a
 * parenthetical after the name, so the first token is the identifier and the
 * rest is prose.
 */
function claimedBranch(fm, text) {
  const raw = fm.branch || (/^Branch:\s*(.+)$/m.exec(text)?.[1] ?? "");
  const name = raw.replace(/`/g, "").trim().split(/\s/)[0];
  return name || null;
}

function mergedPrCount(branch, cache) {
  if (cache.has(branch)) return cache.get(branch);
  let count = null;
  try {
    const stdout = execFileSync(
      "gh",
      ["pr", "list", "--state", "merged", "--head", branch, "--json", "number", "--jq", "length"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    count = Number.parseInt(stdout.trim(), 10);
    if (Number.isNaN(count)) count = 0;
  } catch {
    count = null; // infrastructure failure, not "no PRs"
  }
  cache.set(branch, count);
  return count;
}

const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
if (!token) {
  console.error(
    "❌ [stale-claim] neither GH_TOKEN nor GITHUB_TOKEN is set, so the merged-PR " +
      "lookup cannot run. Failing closed: a backlog gate that silently passes is " +
      "exactly the failure this check exists to catch.",
  );
  process.exit(1);
}

const claimed = [];
const unnamed = [];
for (const dir of readdirSync(BACKLOG)) {
  // docs/backlog/ also holds INDEX.md and the generated files; only the
  // type directories carry items.
  if (!statSync(join(BACKLOG, dir)).isDirectory()) continue;
  for (const filename of readdirSync(join(BACKLOG, dir))) {
    if (!filename.endsWith(".md")) continue;
    const file = `${BACKLOG}/${dir}/${filename}`;
    const text = readFileSync(join(BACKLOG, dir, filename), "utf8");
    const fm = frontMatter(text, file);
    if (fm.status !== "in-progress") continue;
    const branch = claimedBranch(fm, text);
    if (branch) claimed.push({ file, id: fm.id ?? basename(filename), branch });
    else unnamed.push({ file, id: fm.id ?? basename(filename) });
  }
}

if (claimed.length === 0 && unnamed.length === 0) {
  console.log("✅ [stale-claim] no in-progress items to verify.");
  process.exit(0);
}

const cache = new Map();
const stale = [];
const unknown = [];

for (const item of claimed) {
  const count = mergedPrCount(item.branch, cache);
  if (count === null) unknown.push(item);
  else if (count > 0) stale.push({ ...item, prs: count });
}

for (const item of unnamed) {
  unknown.push({ ...item, branch: null });
}

if (unknown.length > 0) {
  console.error("❌ [stale-claim] could not verify these in-progress claims:");
  for (const item of unknown) {
    const why = item.branch ? `branch "${item.branch}" not resolvable` : "no branch named";
    console.error(`     ${item.id} (${why})`);
  }
  console.error("   Infrastructure problem or a malformed item, not a verdict.");
  process.exit(1);
}

if (stale.length > 0) {
  console.error("❌ [stale-claim] in-progress items whose branch has already merged:");
  for (const item of stale) {
    console.error(
      `     ${item.id} — branch "${item.branch}" has ${item.prs} merged PR(s). ` +
        `The work landed; the claim does not. Set a status that says so.`,
    );
  }
  console.error("");
  console.error("   While such an item is in-progress, AGENTS.md stops every other agent");
  console.error("   from touching it — the assignee is not working on it, but the claim");
  console.error("   blocks it for everyone. Set status: ready (waiting on a human) or");
  console.error("   specced (waiting on something that does not exist yet), drop the");
  console.error("   assignee, and add a state note naming the blocker.");
  process.exit(1);
}

console.log(
  `✅ [stale-claim] ${claimed.length} in-progress claim(s) checked, none already merged.`,
);