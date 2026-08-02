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
 * Fails if a relative Markdown link points at a file that does not exist.
 *
 *   node scripts/check-doc-links.mjs
 *
 * Why this exists: moving a document silently breaks every pointer to it, and
 * nothing notices until a reader follows one. Archiving the old roadmap broke
 * six links in one commit. External URLs and pure anchors are not checked —
 * this is about the repository staying internally consistent, not about the
 * web.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEARCH_DIRS = ["docs", "server", ".github"];
const EXTRA_FILES = ["README.md", "CLAUDE.md", "AGENT.md", "DEPLOYMENT.md", "scripts/README.md"];
const SKIP_DIRS = new Set(["node_modules", ".git", "build", ".svelte-kit"]);

const LINK = /\[[^\]]*\]\(([^)\s]+?)(?:\s+"[^"]*")?\)/g;

function collect(dir, out) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(join(dir, entry.name), out);
    } else if (entry.name.endsWith(".md")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const files = SEARCH_DIRS.reduce((acc, d) => collect(d, acc), []);
for (const f of EXTRA_FILES) if (existsSync(join(ROOT, f))) files.push(f);

const broken = [];
let checked = 0;

for (const file of files) {
  const text = readFileSync(join(ROOT, file), "utf8");
  for (const match of text.matchAll(LINK)) {
    let target = match[1];

    if (/^(https?:|mailto:|tel:)/i.test(target)) continue;
    if (target.startsWith("#")) continue; // in-page anchor

    target = target.split("#")[0];
    if (!target) continue;

    checked++;
    const resolved = normalize(join(ROOT, dirname(file), target));

    // Refuse to resolve outside the repository rather than reporting it missing.
    if (relative(ROOT, resolved).startsWith("..")) {
      broken.push(`${file} -> ${target} (points outside the repository)`);
      continue;
    }
    if (!existsSync(resolved)) {
      broken.push(`${file} -> ${target}`);
      continue;
    }
    // A link to a directory only works if it has something to render.
    if (statSync(resolved).isDirectory() && !existsSync(join(resolved, "README.md"))) {
      broken.push(`${file} -> ${target} (directory without a README.md)`);
    }
  }
}

if (broken.length) {
  console.error(`Broken relative links: ${broken.length}\n`);
  for (const b of broken) console.error(`  ${b}`);
  process.exit(1);
}

console.log(`${checked} relative links across ${files.length} Markdown files, all resolve.`);
