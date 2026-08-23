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
 * Validates the backlog's front matter and regenerates docs/backlog/INDEX.md.
 *
 *   npm run backlog:index        write INDEX.md, fail on invalid front matter
 *   npm run backlog:index -- --check   validate only, do not touch INDEX.md
 *
 * The --check mode is what PR CI runs: front matter, id/filename agreement,
 * duplicate ids, duplicate numbers, and depends_on targets that actually
 * exist. It deliberately does NOT require a committed INDEX.md to be present
 * or fresh — INDEX.md is regenerated and committed to develop/main by
 * .github/workflows/sync-backlog.yml after merge, not by whoever opens the
 * PR. Requiring every backlog-touching PR to carry a fresh INDEX.md diff is
 * what caused near-constant merge conflicts on its two summary lines (item
 * counts, next free number) when several PRs touched the backlog in
 * parallel — see BUG-0225.
 *
 * The YAML parser here is deliberately minimal — it handles exactly the flat
 * scalar/inline-list schema documented in docs/backlog/README.md and rejects
 * anything else, rather than pulling in a dependency to parse eleven fields.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG = join(ROOT, "docs", "backlog");
const INDEX = join(BACKLOG, "INDEX.md");
const BACKLOG_TS = join(BACKLOG, "backlog.generated.ts");
const BACKLOG_JSON = join(BACKLOG, "backlog.generated.json");

const DIRS = { features: "feature", bugs: "bug", ideas: "idea" };
const PREFIX = { feature: "FEAT", bug: "BUG", idea: "IDEA" };

const STATUSES = ["idea", "specced", "ready", "in-progress", "done", "dropped"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const EDITIONS = ["community", "pro", "private"];
const DATA_CLASSES = ["A", "B", "C", "none"];
const MILESTONES = ["none", "M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9"];

const REQUIRED = [
  "id",
  "title",
  "type",
  "status",
  "priority",
  "milestone",
  "editions",
  "area",
  "data_class",
  "adr",
  "depends_on",
];

const errors = [];
const items = [];

/** Minimal front-matter reader for the flat schema in docs/backlog/README.md. */
function parseFrontMatter(text, file) {
  if (!text.startsWith("---\n")) {
    errors.push(`${file}: no front matter block at the top of the file`);
    return null;
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    errors.push(`${file}: front matter block is never closed`);
    return null;
  }

  const data = {};
  for (const raw of text.slice(4, end).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const sep = line.indexOf(":");
    if (sep === -1) {
      errors.push(`${file}: cannot parse front-matter line: ${line}`);
      continue;
    }

    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      data[key] = inner
        ? inner.split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""))
        : [];
    } else {
      data[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return data;
}

function oneOf(item, field, allowed, file) {
  if (!allowed.includes(item[field])) {
    errors.push(
      `${file}: ${field} is "${item[field]}", expected one of ${allowed.join(", ")}`,
    );
  }
}

for (const [dir, type] of Object.entries(DIRS)) {
  let files;
  try {
    files = readdirSync(join(BACKLOG, dir)).filter((f) => f.endsWith(".md"));
  } catch {
    continue; // an empty category is not an error
  }

  for (const filename of files) {
    const file = `${dir}/${filename}`;
    const item = parseFrontMatter(
      readFileSync(join(BACKLOG, dir, filename), "utf8"),
      file,
    );
    if (!item) continue;

    for (const field of REQUIRED) {
      if (item[field] === undefined) errors.push(`${file}: missing field "${field}"`);
    }

    oneOf(item, "type", [type], file);
    oneOf(item, "status", STATUSES, file);
    oneOf(item, "priority", PRIORITIES, file);
    oneOf(item, "milestone", MILESTONES, file);
    oneOf(item, "data_class", DATA_CLASSES, file);

    // The id is the identity: it must match both the filename and the directory.
    const expected = new RegExp(`^${PREFIX[type]}-\\d{4}$`);
    if (!expected.test(item.id ?? "")) {
      errors.push(`${file}: id "${item.id}" does not match ${PREFIX[type]}-NNNN`);
    } else if (!filename.startsWith(`${item.id}-`)) {
      errors.push(`${file}: filename does not start with its id "${item.id}"`);
    }

    for (const edition of item.editions ?? []) {
      if (!EDITIONS.includes(edition)) {
        errors.push(`${file}: unknown edition "${edition}"`);
      }
    }
    if ((item.editions ?? []).length === 0) {
      errors.push(`${file}: editions must list at least one build target`);
    }

    if (item.adr !== "none" && item.adr !== "required" && !/^ADR-\d{4}$/.test(item.adr ?? "")) {
      errors.push(`${file}: adr is "${item.adr}", expected none, required or ADR-NNNN`);
    }

    // Strict format validations for extended metadata (Roadmap, Sprints & Governance)
    const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    if (item.start_date && !DATE_REGEX.test(item.start_date)) {
      errors.push(`${file}: start_date "${item.start_date}" must be in YYYY-MM-DD format`);
    }
    if (item.target_date && !DATE_REGEX.test(item.target_date)) {
      errors.push(`${file}: target_date "${item.target_date}" must be in YYYY-MM-DD format`);
    }

    const SIZES = ["XS", "S", "M", "L", "XL"];
    if (item.size && !SIZES.includes(item.size)) {
      errors.push(`${file}: size "${item.size}" must be one of ${SIZES.join(", ")}`);
    }

    if (item.estimate !== undefined && (isNaN(Number(item.estimate)) || Number(item.estimate) < 0)) {
      errors.push(`${file}: estimate "${item.estimate}" must be a non-negative number`);
    }

    if (item.agent_eligible !== undefined && item.agent_eligible !== "true" && item.agent_eligible !== "false" && typeof item.agent_eligible !== "boolean") {
      errors.push(`${file}: agent_eligible must be boolean (true or false)`);
    }

    // Claiming: an in-progress item without a visible owner is how parallel
    // agents collide. See "Agent Lifecycle: Check, Claim, Clean Up" in AGENTS.md.
    if (item.status === "in-progress" && !item.assignee) {
      errors.push(`${file}: status "in-progress" requires an "assignee" field`);
    }

    items.push({ ...item, file: `${dir}/${filename}` });
  }
}

// Numbers are shared across types, so a collision is a real conflict.
const byId = new Map();
for (const item of items) {
  if (byId.has(item.id)) {
    errors.push(`duplicate id ${item.id}: ${byId.get(item.id).file} and ${item.file}`);
  }
  byId.set(item.id, item);
}
const numbers = new Map();
for (const item of items) {
  const n = item.id?.slice(-4);
  if (numbers.has(n)) {
    errors.push(
      `number ${n} used twice: ${numbers.get(n)} and ${item.id} — numbers are shared across types`,
    );
  }
  numbers.set(n, item.id);
}

for (const item of items) {
  for (const dep of item.depends_on ?? []) {
    if (!byId.has(dep)) errors.push(`${item.file}: depends_on "${dep}" does not exist`);
  }
  if (item.parent && !byId.has(item.parent)) {
    errors.push(`${item.file}: parent "${item.parent}" does not exist in backlog`);
  }
}

if (errors.length) {
  console.error(`Backlog front matter: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

// --- render ---------------------------------------------------------------

const rank = (item) => PRIORITIES.indexOf(item.priority);
const sorted = [...items].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));

const STATUS_ICON = {
  idea: "💡",
  specced: "📋",
  ready: "🟢",
  "in-progress": "🟡",
  done: "✅",
  dropped: "⛔",
};

const link = (item) => `[${item.id}](${item.file})`;

const lines = [
  "<!-- Generated by `npm run backlog:index`. Do not edit by hand. -->",
  "",
  "# Backlog index",
  "",
  `${items.length} items. How to read and add them: [README.md](README.md).`,
  "",
  `Counts by status: ${STATUSES.filter((s) => items.some((i) => i.status === s))
    .map((s) => `${STATUS_ICON[s]} ${s} ${items.filter((i) => i.status === s).length}`)
    .join(" · ")}`,
  "",
  "---",
  "",
  "## By milestone",
  "",
];

for (const milestone of MILESTONES.filter((m) => m !== "none").concat("none")) {
  const group = sorted.filter((i) => i.milestone === milestone);
  if (!group.length) continue;
  lines.push(`### ${milestone === "none" ? "Unscheduled" : milestone}`, "");
  lines.push("| ID | Title | Prio | Status | Area |", "| --- | --- | --- | --- | --- |");
  for (const i of group) {
    lines.push(
      `| ${link(i)} | ${i.title} | ${i.priority} | ${STATUS_ICON[i.status]} ${i.status} | ${i.area} |`,
    );
  }
  lines.push("");
}

lines.push("---", "", "## All items", "");
lines.push(
  "| ID | Title | Prio | Status | Milestone | Editions | Data | ADR | Depends on |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
);
for (const i of sorted) {
  lines.push(
    `| ${link(i)} | ${i.title} | ${i.priority} | ${STATUS_ICON[i.status]} ${i.status} | ${i.milestone} | ${(i.editions ?? []).join(", ")} | ${i.data_class} | ${i.adr} | ${(i.depends_on ?? []).map((d) => (byId.has(d) ? `[${d}](${byId.get(d).file})` : d)).join(", ") || "—"} |`,
  );
}
lines.push("");

const next = String(Math.max(0, ...items.map((i) => Number(i.id.slice(-4)))) + 1).padStart(4, "0");
lines.push("---", "", `Next free number: **${next}**`, "");

const rendered = lines.join("\n");

// Build structured data for TypeScript and JSON exports
const tsContent = `/*
 * Copyright (C) 2026 MYDCT
 *
 * Generated by \`npm run backlog:index\`. Do not edit by hand.
 */

export interface BacklogItem {
  id: string;
  title: string;
  type: "feature" | "bug" | "idea";
  status: "idea" | "specced" | "ready" | "in-progress" | "done" | "dropped";
  priority: "P0" | "P1" | "P2" | "P3";
  milestone: string;
  editions: string[];
  area: string;
  data_class: "A" | "B" | "C" | "none";
  adr: string;
  depends_on: string[];
  parent?: string;
  estimate?: number;
  size?: string;
  start_date?: string;
  target_date?: string;
  iteration?: string;
  sprint?: string;
  agent_eligible?: boolean | string;
  assignee?: string;
  file: string;
}

export const BACKLOG_ITEMS: readonly BacklogItem[] = ${JSON.stringify(sorted, null, 2)} as const;

export const BACKLOG: Readonly<Record<string, BacklogItem>> = Object.fromEntries(
  BACKLOG_ITEMS.map((item) => [item.id, item])
) as const;

export function getBacklogItem(id: string): BacklogItem | undefined {
  return BACKLOG[id];
}

export function getBacklogByStatus(status: BacklogItem["status"]): BacklogItem[] {
  return BACKLOG_ITEMS.filter((item) => item.status === status);
}

export function getBacklogByArea(area: string): BacklogItem[] {
  return BACKLOG_ITEMS.filter((item) => item.area === area);
}

export function getBacklogByMilestone(milestone: string): BacklogItem[] {
  return BACKLOG_ITEMS.filter((item) => item.milestone === milestone);
}
`;

if (process.argv.includes("--check")) {
  // Validation only — see the module comment for why this does not compare
  // against or require a committed INDEX.md.
  console.log(`Backlog: ${items.length} items, front matter valid.`);
} else {
  writeFileSync(INDEX, rendered);
  writeFileSync(BACKLOG_TS, tsContent);
  writeFileSync(BACKLOG_JSON, JSON.stringify({ items: sorted, count: items.length }, null, 2) + "\n");
  console.log(
    `Backlog: ${items.length} items, front matter valid. Wrote ${basename(INDEX)}, ${basename(BACKLOG_TS)}, ${basename(BACKLOG_JSON)}.`,
  );
}
