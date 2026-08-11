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
 * Dispatches docs/backlog/ items with status: ready to Jules, so ready work
 * gets picked up on a schedule instead of needing a manual prompt every time.
 *
 * Filter, in order:
 *   1. status === 'ready'                          (docs/backlog/README.md's own definition —
 *                                                     "an agent could start now")
 *   2. area not in EXCLUDE_AREAS                    (execution/security/exchange stay manual —
 *                                                     see AGENTS.md scope-hinweis)
 *   3. priority !== 'P0'                            (money/security-consequence items stay manual)
 *   4. no existing Jules session already mentions this item's ID (best-effort de-dup
 *      over the last LOOKBACK_SESSIONS sessions)
 *   5. capped at MAX_PER_RUN dispatches per run, to respect the daily/concurrent quota
 *
 * This script never edits the backlog or pushes to git. Jules is instructed
 * (in the prompt) to follow docs/backlog/README.md's own "Working an item as
 * an agent" checklist itself, as the first commit of its own PR.
 *
 * Usage: node scripts/jules/dispatch-backlog.mjs [--dry-run]
 * Requires: JULES_API_KEY, JULES_SOURCE (see scripts/jules/README.md)
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BACKLOG = join(ROOT, "docs", "backlog");
const DIRS = ["bugs", "features", "ideas"];

const EXCLUDE_AREAS = (process.env.JULES_EXCLUDE_AREAS ?? "execution,security,exchange")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_PER_RUN = Number(process.env.JULES_MAX_PER_RUN ?? 5);
const STARTING_BRANCH = process.env.JULES_STARTING_BRANCH ?? "develop";
const DRY_RUN = process.argv.includes("--dry-run");

const API_KEY = process.env.JULES_API_KEY;
const SOURCE = process.env.JULES_SOURCE;

if (!DRY_RUN && (!API_KEY || !SOURCE)) {
  console.error("❌ JULES_API_KEY und JULES_SOURCE müssen gesetzt sein (oder --dry-run nutzen).");
  process.exit(1);
}

/** Same minimal front-matter reader as backlog-index.mjs — flat scalars/inline lists only. */
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
    data[key] = line.slice(idx + 1).trim();
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
      const fm = parseFrontMatter(readFileSync(path, "utf8"));
      if (!fm) continue;
      items.push({ ...fm, file: path.replace(ROOT + "/", "") });
    }
  }
  return items;
}

async function fetchRecentSessionText() {
  if (DRY_RUN) return "";
  const res = await fetch("https://jules.googleapis.com/v1alpha/sessions?pageSize=100", {
    headers: { "x-goog-api-key": API_KEY },
  });
  if (!res.ok) {
    console.error(`⚠️  Konnte bestehende Sessions nicht laden (HTTP ${res.status}) — dedup übersprungen.`);
    return "";
  }
  const data = await res.json();
  return JSON.stringify(data.sessions ?? []);
}

async function createSession(item) {
  const prompt = `Bearbeite das Backlog-Item ${item.id} (${item.file}).

Folge exakt dem Ablauf aus "Working an item as an agent" in docs/backlog/README.md:
1. Lies die Datei komplett, inklusive aller Links.
2. Prüfe depends_on — falls eine Abhängigkeit nicht done ist, stoppe und sag das.
3. Prüfe adr — falls "required" und keine ADR existiert, ist das Item nicht baubar.
4. Prüfe data_class (${item.data_class ?? "?"}) — falls ungleich none, gelten ADR-0001/ADR-0004.
5. Setze status: in-progress im Front-Matter, mit Branch-Namen, als ersten Commit.
6. Baue es gemäß AGENTS.md (Svelte 5 Runes only, decimal.js, keine hardcodierten Farben, Tests neben dem Code).
7. Verifiziere mit npm run check und den betroffenen Tests.
8. Setze status: done erst wenn Acceptance Criteria bewiesen sind — sonst status: in-progress lassen und im PR sagen, was fehlt.
9. npm run backlog:index ausführen.

Halte dich an den Scope-Hinweis in AGENTS.md. Öffne einen PR gegen develop, merge nicht selbst.`;

  const body = {
    prompt,
    title: `${item.id}: ${item.title ?? ""}`.slice(0, 200),
    sourceContext: {
      source: SOURCE,
      githubRepoContext: { startingBranch: STARTING_BRANCH },
    },
  };

  if (DRY_RUN) {
    console.log(`[dry-run] würde Session erstellen für ${item.id}`);
    return;
  }

  const res = await fetch("https://jules.googleapis.com/v1alpha/sessions", {
    method: "POST",
    headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`❌ ${item.id}: ${json.error?.message ?? res.status}`);
    return false;
  }
  console.log(`✅ ${item.id}: ${json.name} — ${json.url ?? ""}`);
  return true;
}

const items = loadBacklogItems();
const ready = items.filter(
  (i) =>
    i.status === "ready" &&
    !EXCLUDE_AREAS.includes(i.area) &&
    i.priority !== "P0",
);

console.log(`${items.length} Backlog-Items insgesamt, ${ready.length} davon status=ready und im erlaubten Scope.`);

if (ready.length === 0) {
  console.log("Nichts zu dispatchen. Items auf status: ready setzen, damit hier was passiert.");
  process.exit(0);
}

const recentSessionsText = await fetchRecentSessionText();
let dispatched = 0;

for (const item of ready) {
  if (dispatched >= MAX_PER_RUN) {
    console.log(`Limit von ${MAX_PER_RUN} pro Lauf erreicht, Rest bleibt für den nächsten Lauf.`);
    break;
  }
  if (recentSessionsText.includes(item.id)) {
    console.log(`⏭️  ${item.id}: existierende Session gefunden, überspringe.`);
    continue;
  }
  const ok = await createSession(item);
  if (ok) dispatched++;
}

console.log(`${dispatched} Session(s) erstellt.`);
