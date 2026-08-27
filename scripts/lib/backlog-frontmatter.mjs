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
 * Shared minimal front-matter reader for docs/backlog/ items, used by every
 * script that needs to read (not validate) the flat schema documented in
 * docs/backlog/README.md. scripts/backlog-index.mjs keeps its own copy
 * because it also collects field-level validation errors as it parses;
 * everything that just needs the data uses this one.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const BACKLOG_DIRS = ["bugs", "features", "ideas"];

export function parseFrontMatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return null;

  const data = {};
  for (const raw of text.slice(4, end).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      value = inner
        ? inner.split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""))
        : [];
    } else {
      value = value.replace(/^["']|["']$/g, "");
    }
    data[key] = value;
  }
  return data;
}

/**
 * Replaces (or appends) top-level scalar keys in a front-matter block, leaving
 * the rest of the file untouched. A value of null or undefined REMOVES the key
 * instead of writing it — e.g. clearing assignee when an agent releases a claim
 * (AGENTS.md lifecycle rules pair status with assignee, so both must go).
 */
export function updateFrontMatter(text, updates) {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return text;

  const lines = text.slice(4, end).split("\n");
  const updated = [];
  const seen = new Set();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.indexOf(":");
    if (sep === -1) {
      updated.push(raw);
      continue;
    }
    const key = line.slice(0, sep).trim();
    if (key in updates) {
      seen.add(key); // also for null/undefined, so the key is not re-appended below
      const value = updates[key];
      if (value !== null && value !== undefined) {
        updated.push(`${key}: ${value}`);
      }
    } else {
      updated.push(raw);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (value !== null && value !== undefined) updated.push(`${key}: ${value}`);
  }

  return `---\n${updated.join("\n")}\n---\n${text.slice(end + 4)}`;
}

/** Loads every backlog item's front matter plus its raw file content, keyed by absolute filepath. */
export function loadBacklogItems(backlogRoot, dirs = BACKLOG_DIRS) {
  const items = [];
  for (const dir of dirs) {
    const dirPath = join(backlogRoot, dir);
    let files;
    try {
      files = readdirSync(dirPath).filter((f) => f.endsWith(".md"));
    } catch {
      continue; // an empty category is not an error
    }
    for (const filename of files) {
      const filepath = join(dirPath, filename);
      const content = readFileSync(filepath, "utf8");
      const fm = parseFrontMatter(content);
      if (!fm) continue;
      items.push({ ...fm, filepath, content });
    }
  }
  return items;
}
