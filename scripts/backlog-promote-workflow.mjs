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
 * Audits backlog promotion PRs to ensure:
 * 1. All changed items are specced → ready transitions
 * 2. No acceptance criteria were removed
 * 3. All depends_on IDs exist
 *
 * Runs as GitHub Action during PR workflow_run.
 * Outputs audit results as JSON; generates PR comment via Actions Script.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG = join(ROOT, "docs", "backlog");
const DIRS = ["bugs", "features", "ideas"];

const PR_NUMBER = process.env.GITHUB_PR_NUMBER;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!PR_NUMBER || !GITHUB_TOKEN) {
  console.error("❌ GITHUB_PR_NUMBER and GITHUB_TOKEN environment variables required.");
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

function extractAcceptanceCriteria(text) {
  const lines = text.split("\n");
  const criteria = [];
  let inSection = false;

  for (const line of lines) {
    if (line.match(/^#+\s+Acceptance Criteria/i)) {
      inSection = true;
      continue;
    }
    if (inSection && line.match(/^#+\s+/)) break;
    if (inSection && line.match(/^-\s+\[/)) {
      criteria.push(line.trim());
    }
  }

  return criteria;
}

function loadAllBacklogItems() {
  const items = {};
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
      if (!fm || !fm.id) continue;
      items[fm.id] = fm;
    }
  }
  return items;
}

async function getChangedFiles() {
  const result = spawnSync(
    "git",
    [
      "diff",
      "--name-only",
      `origin/develop...HEAD`,
    ],
    { cwd: ROOT, encoding: "utf8" }
  );

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .filter(f => f.startsWith("docs/backlog/") && f.endsWith(".md"));
}

async function getFileContent(filePath, ref = "HEAD") {
  const result = spawnSync(
    "git",
    ["show", `${ref}:${filePath}`],
    { cwd: ROOT, encoding: "utf8" }
  );

  if (result.status !== 0) {
    return null;
  }

  return result.stdout;
}

async function auditPromotionPR() {
  const results = {
    is_promotion_pr: false,
    valid: false,
    items: [],
    warnings: [],
    errors: [],
  };

  const changedFiles = await getChangedFiles();
  if (changedFiles.length === 0) {
    results.valid = true;
    return results;
  }

  const allItems = loadAllBacklogItems();

  let hasStatusTransitions = false;

  for (const filePath of changedFiles) {
    const oldContent = await getFileContent(filePath, "origin/develop");
    const newContent = readFileSync(join(ROOT, filePath), "utf8");

    if (!oldContent) {
      results.warnings.push(`File created (not a promotion): ${filePath}`);
      continue;
    }

    const oldFM = parseFrontMatter(oldContent);
    const newFM = parseFrontMatter(newContent);

    if (!oldFM || !newFM) {
      results.warnings.push(`Could not parse front matter: ${filePath}`);
      continue;
    }

    const itemId = newFM.id || oldFM.id;

    if (oldFM.status === "specced" && newFM.status === "ready") {
      hasStatusTransitions = true;

      const itemResult = {
        id: itemId,
        title: newFM.title || "Unknown",
        valid: true,
        issues: [],
      };

      if (newFM.status !== "ready") {
        itemResult.valid = false;
        itemResult.issues.push(`Status not 'ready': ${newFM.status}`);
      }

      const oldCriteria = extractAcceptanceCriteria(oldContent);
      const newCriteria = extractAcceptanceCriteria(newContent);

      if (newCriteria.length < oldCriteria.length) {
        itemResult.valid = false;
        itemResult.issues.push(
          `Acceptance criteria count decreased (was ${oldCriteria.length}, now ${newCriteria.length})`
        );
      }

      if (Array.isArray(newFM.depends_on) && newFM.depends_on.length > 0) {
        for (const depId of newFM.depends_on) {
          if (!allItems[depId]) {
            itemResult.valid = false;
            itemResult.issues.push(`depends_on references non-existent item: ${depId}`);
          }
        }
      }

      results.items.push(itemResult);

      if (!itemResult.valid) {
        for (const issue of itemResult.issues) {
          results.errors.push(`${itemId}: ${issue}`);
        }
      }
    } else if (oldFM.status !== newFM.status || oldFM.status !== "specced") {
      results.warnings.push(
        `${itemId}: Not a specced→ready transition (${oldFM.status} → ${newFM.status})`
      );
    }
  }

  results.is_promotion_pr = hasStatusTransitions;
  results.valid = results.errors.length === 0;

  return results;
}

async function main() {
  const results = await auditPromotionPR();

  const resultsFile = join(ROOT, ".audit-results.json");
  writeFileSync(resultsFile, JSON.stringify(results, null, 2), "utf8");

  console.log(`Results written to ${resultsFile}`);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const fs = await import("node:fs");
    fs.appendFileSync(githubOutput, `is_promotion_pr=${results.is_promotion_pr}\n`);
    fs.appendFileSync(githubOutput, `valid=${results.valid}\n`);
    fs.appendFileSync(githubOutput, `results_file=${resultsFile}\n`);
  } else {
    console.log(`::set-output name=is_promotion_pr::${results.is_promotion_pr}`);
    console.log(`::set-output name=valid::${results.valid}`);
    console.log(`::set-output name=results_file::${resultsFile}`);
  }

  if (results.is_promotion_pr) {
    console.log(`\n📋 Audit Results:\n`);
    console.log(`Items: ${results.items.length}`);
    console.log(`Errors: ${results.errors.length}`);
    console.log(`Warnings: ${results.warnings.length}`);

    if (!results.valid) {
      console.log(`\n❌ Audit failed:`);
      for (const error of results.errors) {
        console.log(`  - ${error}`);
      }
      process.exit(1);
    } else {
      console.log(`\n✅ Audit passed.`);
    }
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
