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
 * Audits a PR's docs/backlog/ changes to ensure batch promotions
 * (scripts/backlog-promote.mjs) are safe to merge:
 *   1. Every specced -> ready transition keeps all its acceptance criteria
 *   2. depends_on still references existing items
 *
 * Runs as a GitHub Action on pull_request; writes .audit-results.json, which
 * a separate actions/github-script step turns into a PR comment. This script
 * only reads git and the filesystem — it does not call the GitHub API itself.
 *
 * Usage: node scripts/backlog-promote-workflow.mjs
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadBacklogItems, parseFrontMatter } from "./lib/backlog-frontmatter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG = join(ROOT, "docs", "backlog");
const BASE_REF = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/develop";

function extractAcceptanceCriteria(text) {
  const lines = text.split("\n");
  const criteria = [];
  let inSection = false;
  for (const line of lines) {
    if (/^#+\s+Acceptance criteria/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#+\s+/.test(line)) break;
    if (inSection && /^-\s+\[/.test(line)) criteria.push(line.trim());
  }
  return criteria;
}

function getChangedBacklogFiles() {
  const result = spawnSync("git", ["diff", "--name-only", `${BASE_REF}...HEAD`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .filter(
      (f) =>
        f.startsWith("docs/backlog/") &&
        f.endsWith(".md") &&
        !f.endsWith("INDEX.md") &&
        !f.endsWith("README.md") &&
        !f.includes("/templates/"),
    );
}

function getFileAtRef(filePath, ref) {
  const result = spawnSync("git", ["show", `${ref}:${filePath}`], { cwd: ROOT, encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}

function auditPromotionPR() {
  const results = { is_promotion_pr: false, valid: true, items: [], warnings: [], errors: [] };

  const changedFiles = getChangedBacklogFiles();
  if (changedFiles.length === 0) return results;

  const allItems = loadBacklogItems(BACKLOG);
  const byId = new Map(allItems.map((item) => [item.id, item]));

  for (const filePath of changedFiles) {
    const fullPath = join(ROOT, filePath);
    if (!existsSync(fullPath)) {
      results.warnings.push(`File deleted (not a promotion): ${filePath}`);
      continue;
    }

    const oldContent = getFileAtRef(filePath, BASE_REF);
    if (oldContent === null) {
      results.warnings.push(`File created (not a promotion): ${filePath}`);
      continue;
    }

    const newContent = readFileSync(fullPath, "utf8");
    const oldFM = parseFrontMatter(oldContent);
    const newFM = parseFrontMatter(newContent);
    if (!oldFM || !newFM) {
      results.warnings.push(`Could not parse front matter: ${filePath}`);
      continue;
    }

    const itemId = newFM.id ?? oldFM.id;
    if (oldFM.status !== "specced" || newFM.status !== "ready") {
      if (oldFM.status !== newFM.status) {
        results.warnings.push(`${itemId}: not a specced → ready transition (${oldFM.status} → ${newFM.status})`);
      }
      continue;
    }

    results.is_promotion_pr = true;
    const itemResult = { id: itemId, title: newFM.title ?? "Unknown", valid: true, issues: [] };

    const oldCriteria = extractAcceptanceCriteria(oldContent);
    const newCriteria = extractAcceptanceCriteria(newContent);
    if (newCriteria.length < oldCriteria.length) {
      itemResult.valid = false;
      itemResult.issues.push(`Acceptance criteria count decreased (was ${oldCriteria.length}, now ${newCriteria.length})`);
    }

    for (const depId of Array.isArray(newFM.depends_on) ? newFM.depends_on : []) {
      if (!byId.has(depId)) {
        itemResult.valid = false;
        itemResult.issues.push(`depends_on references non-existent item: ${depId}`);
      }
    }

    results.items.push(itemResult);
    for (const issue of itemResult.issues) results.errors.push(`${itemId}: ${issue}`);
  }

  results.valid = results.errors.length === 0;
  return results;
}

function main() {
  const results = auditPromotionPR();

  const resultsFile = join(ROOT, ".audit-results.json");
  writeFileSync(resultsFile, JSON.stringify(results, null, 2), "utf8");
  console.log(`Results written to ${relative(ROOT, resultsFile)}`);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(githubOutput, `is_promotion_pr=${results.is_promotion_pr}\n`);
    appendFileSync(githubOutput, `valid=${results.valid}\n`);
  }

  if (!results.is_promotion_pr) return;

  console.log(`\n📋 Audit results: ${results.items.length} item(s), ${results.errors.length} error(s), ${results.warnings.length} warning(s)`);
  if (!results.valid) {
    console.log(`\n❌ Audit failed:`);
    for (const error of results.errors) console.log(`  - ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`\n✅ Audit passed.`);
  }
}

main();
