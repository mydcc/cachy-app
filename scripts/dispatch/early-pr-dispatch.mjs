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
 * Creates draft PRs for backlog items to enable plan validation by agents
 * before implementation starts. This bridges the gap between backlog planning
 * and implementation — agents can review and comment on plans early.
 *
 * Workflow:
 *   1. Filter backlog items by dispatch-label (default: 'plan-validation')
 *   2. Optionally filter by area and priority
 *   3. Check depends_on — skip if dependencies not done
 *   4. Create branch: plan/<backlog-id>
 *   5. Generate draft PR with validation checklist
 *   6. Do not auto-merge — awaits review
 *
 * Usage: node scripts/dispatch/early-pr-dispatch.mjs
 * Environment:
 *   - GITHUB_TOKEN: required, for PR creation
 *   - DISPATCH_LABEL: filter items (default: 'plan-validation')
 *   - AREA_FILTER: optional, filter by area (e.g., 'ui')
 *   - PRIORITY_FILTER: optional, filter by priority (e.g., 'P1')
 *   - DRY_RUN: if 'true', show what would be created without actually creating
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BACKLOG = join(ROOT, "docs", "backlog");
const DIRS = ["bugs", "features", "ideas"];

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || "mydcc/cachy-app";
const DISPATCH_LABEL = process.env.DISPATCH_LABEL?.trim() || "plan-validation";
const AREA_FILTER = process.env.AREA_FILTER?.trim() || "";
const PRIORITY_FILTER = process.env.PRIORITY_FILTER?.trim() || "";
const DRY_RUN = process.env.DRY_RUN === "true";

if (!GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN environment variable is required.");
  process.exit(1);
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
      const bodyStart = content.indexOf("\n---\n", 4) + 5;
      items.push({
        ...fm,
        file: path.replace(ROOT + "/", ""),
        content: content.slice(bodyStart),
      });
    }
  }
  return items;
}

function getFilteredItems(items) {
  return items.filter((item) => {
    if (item["dispatch-label"] !== DISPATCH_LABEL) return false;
    if (AREA_FILTER && item.area !== AREA_FILTER) return false;
    if (PRIORITY_FILTER && item.priority !== PRIORITY_FILTER) return false;

    if (Array.isArray(item.depends_on) && item.depends_on.length > 0) {
      const unresolved = item.depends_on.filter((depId) => {
        const depItem = items.find((i) => i.id === depId);
        return depItem && depItem.status !== "done" && depItem.status !== "dropped";
      });
      if (unresolved.length > 0) return false;
    }

    return true;
  });
}

async function branchExists(branchName) {
  const result = spawnSync("git", ["rev-parse", "--verify", branchName], {
    stdio: "pipe",
  });
  return result.status === 0;
}

async function createDraftPR(item) {
  const branchName = `plan/${item.id}`;
  const prTitle = `[PLAN] ${item.id}: ${item.title}`;

  const validationChecklist = `## Plan Validation Checklist

- [ ] Architecture approach sound?
- [ ] Dependencies correctly identified?
- [ ] Acceptance criteria testable?
- [ ] Estimate reasonable?
- [ ] Data class (${item["data_class"] || "none"}) handling correct?
- [ ] No ADR violations?
- [ ] Scope appropriately bounded?

**Status:** ✏️ Plan validation (not implementation yet)
**Ready to implement?** Update checklist, then comment—on approval, update backlog status to \`ready\`.

---

**Backlog File:** [\`${item.file}\`](../blob/develop/${item.file})
**Item ID:** \`${item.id}\``;

  const prBody = `# ${prTitle}

${item.content}

${validationChecklist}`;

  if (DRY_RUN) {
    console.log(`[dry-run] Would create draft PR for ${item.id}`);
    console.log(`  Branch: ${branchName}`);
    console.log(`  Title: ${prTitle}`);
    return true;
  }

  try {
    console.log(`Creating draft PR for ${item.id} on branch ${branchName}...`);

    if (!(await branchExists(branchName))) {
      const checkoutResult = spawnSync("git", ["checkout", "-b", branchName, "origin/develop"], { cwd: ROOT });
      if (checkoutResult.status !== 0) {
        console.error(`❌ Failed to create branch ${branchName}: ${checkoutResult.stderr.toString()}`);
        return false;
      }
    }

    const createPRUrl = `https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls`;
    const prResponse = await fetch(createPRUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: prTitle,
        head: branchName,
        base: "develop",
        body: prBody,
        draft: true,
      }),
    });

    if (!prResponse.ok) {
      const error = await prResponse.json();
      console.error(`❌ ${item.id}: ${error.message}`);
      return false;
    }

    const pr = await prResponse.json();
    console.log(`✅ ${item.id}: ${pr.html_url}`);
    return true;
  } catch (err) {
    console.error(`❌ ${item.id}: ${err.message}`);
    return false;
  }
}

async function main() {
  const allItems = loadBacklogItems();
  const filteredItems = getFilteredItems(allItems);

  console.log(`🔍 Found ${allItems.length} backlog items total.`);
  console.log(`📋 Filtering by dispatch-label: "${DISPATCH_LABEL}"`);
  if (AREA_FILTER) console.log(`   area: "${AREA_FILTER}"`);
  if (PRIORITY_FILTER) console.log(`   priority: "${PRIORITY_FILTER}"`);
  console.log(`\n✅ ${filteredItems.length} items match filters.`);

  if (filteredItems.length === 0) {
    console.log(
      "\nNo items found. Update backlog items with dispatch-label: plan-validation to proceed."
    );
    return;
  }

  console.log("\nCreating draft PRs...\n");

  let created = 0;
  let failed = 0;

  for (const item of filteredItems) {
    const success = await createDraftPR(item);
    if (success) {
      created++;
    } else {
      failed++;
    }
  }

  console.log(`\n📊 Summary: ${created} created, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
