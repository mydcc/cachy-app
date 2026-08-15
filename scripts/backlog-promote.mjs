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
 * Batch-promote backlog items from 'specced' to 'ready' status.
 *
 * Filters items by status=specced, optionally by area/priority/milestone.
 * Shows matching items interactively, user selects which to promote.
 * Creates single commit with all changes.
 *
 * Usage:
 *   npm run backlog:promote
 *   npm run backlog:promote -- --area=ui
 *   npm run backlog:promote -- --area=ui --priority=P1
 *   npm run backlog:promote -- --area=ui --priority=P1 --milestone=M0
 *   npm run backlog:promote -- --ids=FEAT-0001,FEAT-0042,BUG-0015
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG = join(ROOT, "docs", "backlog");
const DIRS = ["bugs", "features", "ideas"];

// Parse command-line arguments
const args = process.argv.slice(2);
const filters = {};
for (const arg of args) {
  if (arg.startsWith("--")) {
    const [key, value] = arg.slice(2).split("=");
    filters[key] = value || true;
  }
}

function parseFrontMatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return null;
  const data = {};
  for (const raw of text.slice(4, end).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      val = val.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    }
    data[key] = val;
  }
  return data;
}

function updateFrontMatter(text, updates) {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return text;

  const lines = text.slice(4, end).split("\n");
  const updated = [];
  const seen = new Set();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) {
      updated.push(raw);
      continue;
    }
    const key = line.slice(0, idx).trim();
    if (key in updates) {
      updated.push(`${key}: ${updates[key]}`);
      seen.add(key);
    } else {
      updated.push(raw);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      updated.push(`${key}: ${value}`);
    }
  }

  return `---\n${updated.join("\n")}\n---\n${text.slice(end + 4)}`;
}

function loadBacklogItems() {
  const items = [];
  for (const dir of DIRS) {
    const dirPath = join(BACKLOG, dir);
    let files;
    try {
      files = readdirSync(dirPath).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    for (const file of files) {
      const path = join(dirPath, file);
      const content = readFileSync(path, "utf8");
      const fm = parseFrontMatter(content);
      if (!fm) continue;
      items.push({
        ...fm,
        file: path.replace(ROOT + "/", ""),
        filepath: path,
        content: content,
      });
    }
  }
  return items;
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
    const ids = filters.ids.split(",").map(s => s.trim()).filter(Boolean);
    return items.filter(i => ids.includes(i.id));
  }

  console.log("\n📋 Matching items:");
  items.forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.id} — ${item.title} (${item.area}, ${item.priority})`);
  });

  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      "\n✅ Enter item numbers to promote (comma-separated, e.g. 1,3,5): ",
      (answer) => {
        rl.close();
        const indices = answer
          .split(",")
          .map((s) => Number(s.trim()) - 1)
          .filter((n) => n >= 0 && n < items.length);
        resolve(items.filter((_, idx) => indices.includes(idx)));
      }
    );
  });
}

async function main() {
  const allItems = loadBacklogItems();
  const filtered = filterItems(allItems);

  console.log(`\n🔍 Found ${filtered.length} specced items`);
  if (filters.area) console.log(`   area: ${filters.area}`);
  if (filters.priority) console.log(`   priority: ${filters.priority}`);
  if (filters.milestone) console.log(`   milestone: ${filters.milestone}`);

  if (filtered.length === 0) {
    console.log("\nNo items found matching filters.");
    process.exit(0);
  }

  const selected = await promptUser(filtered);

  if (selected.length === 0) {
    console.log("\nNo items selected.");
    process.exit(0);
  }

  console.log(`\n✅ Promoting ${selected.length} item(s) to ready...`);

  let count = 0;
  for (const item of selected) {
    const updated = updateFrontMatter(item.content, { status: "ready" });
    writeFileSync(item.filepath, updated, "utf8");
    console.log(`  ✓ ${item.id}: ${item.file}`);
    count++;
  }

  console.log(`\n📝 Creating commit...`);
  const ids = selected.map(i => i.id).join(", ");
  const commitMsg = `chore: promote ${count} item(s) to ready status

Promoted items: ${ids}

Items verified:
${selected.map(i => `- ${i.id}: ${i.title}`).join("\n")}

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LpnNn3xpGnQyChkYX65uMy`;

  try {
    const { execSync } = await import("node:child_process");
    execSync(`git add ${selected.map(i => `"${i.file}"`).join(" ")}`, { cwd: ROOT });
    execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: ROOT });
    console.log(`✅ Commit created. Push with: git push -u origin $(git rev-parse --abbrev-ref HEAD)`);
  } catch (err) {
    console.error(`❌ Git error: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
