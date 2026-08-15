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
 * Batch-promotes backlog items from 'specced' to 'ready' status.
 *
 * Filters items by status=specced, optionally by area/priority/milestone.
 * Shows matching items interactively, user selects which to promote.
 * Creates a single commit with all changes.
 *
 * Usage:
 *   npm run backlog:promote
 *   npm run backlog:promote -- --area=ui
 *   npm run backlog:promote -- --area=ui --priority=P1
 *   npm run backlog:promote -- --area=ui --priority=P1 --milestone=M0
 *   npm run backlog:promote -- --ids=FEAT-0001,FEAT-0042,BUG-0015
 */

import { writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { loadBacklogItems, updateFrontMatter } from "./lib/backlog-frontmatter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG = join(ROOT, "docs", "backlog");

const args = process.argv.slice(2);
const filters = {};
for (const arg of args) {
  if (!arg.startsWith("--")) continue;
  const [key, value] = arg.slice(2).split("=");
  filters[key] = value ?? true;
}

function filterItems(items) {
  return items.filter((item) => {
    if (item.status !== "specced") return false;
    if (filters.area && item.area !== filters.area) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    if (filters.milestone && item.milestone !== filters.milestone) return false;
    return true;
  });
}

async function promptUser(items) {
  if (filters.ids) {
    const ids = String(filters.ids).split(",").map((s) => s.trim()).filter(Boolean);
    return items.filter((i) => ids.includes(i.id));
  }

  console.log("\n📋 Matching items:");
  items.forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.id} — ${item.title} (${item.area}, ${item.priority})`);
  });

  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      "\n✅ Enter item numbers to promote (comma-separated, e.g. 1,3,5): ",
      (answer) => {
        rl.close();
        const indices = answer
          .split(",")
          .map((s) => Number(s.trim()) - 1)
          .filter((n) => n >= 0 && n < items.length);
        resolve(items.filter((_, idx) => indices.includes(idx)));
      },
    );
  });
}

async function main() {
  const allItems = loadBacklogItems(BACKLOG);
  const filtered = filterItems(allItems);

  console.log(`\n🔍 Found ${filtered.length} specced items`);
  if (filters.area) console.log(`   area: ${filters.area}`);
  if (filters.priority) console.log(`   priority: ${filters.priority}`);
  if (filters.milestone) console.log(`   milestone: ${filters.milestone}`);

  if (filtered.length === 0) {
    console.log("\nNo items found matching filters.");
    return;
  }

  const selected = await promptUser(filtered);
  if (selected.length === 0) {
    console.log("\nNo items selected.");
    return;
  }

  console.log(`\n✅ Promoting ${selected.length} item(s) to ready...`);
  const relFiles = [];
  for (const item of selected) {
    const updated = updateFrontMatter(item.content, { status: "ready" });
    writeFileSync(item.filepath, updated, "utf8");
    const relFile = relative(ROOT, item.filepath);
    relFiles.push(relFile);
    console.log(`  ✓ ${item.id}: ${relFile}`);
  }

  console.log(`\n📝 Creating commit...`);
  const commitMsg = `chore(backlog): promote ${selected.length} item(s) to ready

${selected.map((i) => `- ${i.id}: ${i.title}`).join("\n")}`;

  const addResult = spawnSync("git", ["add", ...relFiles], { cwd: ROOT });
  if (addResult.status !== 0) {
    console.error(`❌ git add failed: ${addResult.stderr?.toString() ?? ""}`);
    process.exitCode = 1;
    return;
  }

  const commitResult = spawnSync("git", ["commit", "-m", commitMsg], { cwd: ROOT });
  if (commitResult.status !== 0) {
    console.error(`❌ git commit failed: ${commitResult.stderr?.toString() ?? ""}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Commit created. Push with: git push -u origin <your-branch>`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exitCode = 1;
});
