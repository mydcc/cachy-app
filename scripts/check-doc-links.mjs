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
 * Fails if a relative Markdown link points at a file that does not exist, or
 * at an anchor that file does not define.
 *
 *   node scripts/check-doc-links.mjs
 *
 * Why this exists: moving a document silently breaks every pointer to it, and
 * nothing notices until a reader follows one. Archiving the old roadmap broke
 * six links in one commit. External URLs and pure in-page anchors are not
 * checked — this is about the repository staying internally consistent, not
 * about the web.
 *
 * Why anchors are checked too: the fragment was previously dropped, so a link
 * to a renamed heading passed while leading nowhere. Seven such links existed.
 * Validating them is only safe if the slug rules match GitHub's exactly,
 * because a mismatch produces false failures on a correct tree. The four rules
 * that matter, all of them present in this repository:
 *
 *   1. Both ATX (`## Heading`) and Setext (`Heading\n-----`) headings count.
 *      Five documents here use Setext.
 *   2. Duplicated heading text gets a numeric suffix: the first is
 *      `http-request`, the second `http-request-1`. `### HTTP Request`
 *      repeats many times across the API mirrors.
 *   3. Headings inside fenced code blocks are not headings.
 *   4. Only links whose target is a `.md` file are anchor-checked; a fragment
 *      into any other file type is left alone rather than guessed at.
 *
 * Escape hatch: an anchor that this heuristic gets wrong can be silenced for
 * one link by pointing it at the file without the fragment.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEARCH_DIRS = ["docs", "server", ".github"];
const EXTRA_FILES = ["README.md", "AGENTS.md", "DEPLOYMENT.md", "scripts/README.md"];
const SKIP_DIRS = new Set(["node_modules", ".git", "build", ".svelte-kit"]);

const LINK = /\[[^\]]*\]\(([^)\s]+?)(?:\s+"[^"]*")?\)/g;
const ATX = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

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

/**
 * GitHub's heading slug: lowercase, drop inline HTML, drop everything that is
 * not a word character, a hyphen or a space, then turn EACH space into a
 * hyphen. Note the last step is per-space, not per-run, so an em dash
 * surrounded by spaces yields a double hyphen — which is why anchors like
 * `#m0--stable-10` exist in this repository.
 */
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/ /g, "-");
}

const slugCache = new Map();

/** Every anchor a Markdown file defines, including `-1`, `-2` duplicates. */
function slugsOf(absPath) {
  const cached = slugCache.get(absPath);
  if (cached) return cached;

  const slugs = new Set();
  const lines = readFileSync(absPath, "utf8").split(/\r?\n/);
  let fence = null;
  const seen = new Map();

  const add = (text) => {
    const base = slugify(text);
    if (!base) return;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    slugs.add(n === 0 ? base : `${base}-${n}`);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks: toggle on the opening marker, ignore everything inside.
    const fenceMatch = line.match(FENCE);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const atx = line.match(ATX);
    if (atx) {
      add(atx[2]);
      continue;
    }

    // Setext: a text line directly followed by a run of = (h1) or - (h2).
    const next = lines[i + 1];
    if (next === undefined) continue;
    if (/^=+\s*$/.test(next) && line.trim()) {
      add(line);
      i++;
    } else if (/^-{2,}\s*$/.test(next) && line.trim()) {
      add(line);
      i++;
    }
  }

  slugCache.set(absPath, slugs);
  return slugs;
}

const files = SEARCH_DIRS.reduce((acc, d) => collect(d, acc), []);
for (const f of EXTRA_FILES) if (existsSync(join(ROOT, f))) files.push(f);

const broken = [];
let checked = 0;
let anchorsChecked = 0;

for (const file of files) {
  const text = readFileSync(join(ROOT, file), "utf8");
  for (const match of text.matchAll(LINK)) {
    const raw = match[1];

    if (/^(https?:|mailto:|tel:)/i.test(raw)) continue;
    if (raw.startsWith("#")) continue; // in-page anchor

    const hashAt = raw.indexOf("#");
    const pathPart = hashAt === -1 ? raw : raw.slice(0, hashAt);
    const fragment = hashAt === -1 ? "" : decodeURIComponent(raw.slice(hashAt + 1));
    if (!pathPart) continue;

    checked++;
    const resolved = normalize(join(ROOT, dirname(file), pathPart));

    // Refuse to resolve outside the repository rather than reporting it missing.
    if (relative(ROOT, resolved).startsWith("..")) {
      broken.push(`${file} -> ${raw} (points outside the repository)`);
      continue;
    }
    if (!existsSync(resolved)) {
      broken.push(`${file} -> ${raw}`);
      continue;
    }
    // A link to a directory only works if it has something to render.
    if (statSync(resolved).isDirectory()) {
      if (!existsSync(join(resolved, "README.md"))) {
        broken.push(`${file} -> ${raw} (directory without a README.md)`);
      }
      continue;
    }

    if (!fragment || !resolved.endsWith(".md")) continue;

    anchorsChecked++;
    if (!slugsOf(resolved).has(fragment.toLowerCase())) {
      broken.push(`${file} -> ${raw} (no such heading in ${pathPart})`);
    }
  }
}

if (broken.length) {
  console.error(`Broken relative links: ${broken.length}\n`);
  for (const b of broken) console.error(`  ${b}`);
  process.exit(1);
}

console.log(
  `${checked} relative links across ${files.length} Markdown files, all resolve ` +
    `(${anchorsChecked} with an anchor, all of them defined).`
);
