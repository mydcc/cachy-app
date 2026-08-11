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
 *   4. no recent Jules session already covers this item — de-dup over the most
 *      recent SESSION_PAGE_SIZE sessions, ignoring any older than
 *      SESSION_MAX_AGE_DAYS, and reading only each session's title and prompt.
 *      This is the only thing standing between a re-run and a duplicate
 *      session: an item stays `ready` on `develop` while Jules works on it,
 *      because Jules writes `status: in-progress` on its own branch, which is
 *      not merged yet. So the check is mandatory — if the session list cannot
 *      be loaded, the run aborts rather than dispatching without it.
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
const SESSION_PAGE_SIZE = Number(process.env.JULES_SESSION_PAGE_SIZE ?? 100);
const SESSION_MAX_AGE_DAYS = Number(process.env.JULES_SESSION_MAX_AGE_DAYS ?? 30);
// Without this, Jules finishes the work but leaves the PR unpublished until
// someone opens the Jules UI and clicks "Publish" by hand — the whole point of
// unattended dispatch is defeated by a manual step at the end of it. Empty
// string opts back out (e.g. to require a human look at the diff first).
const AUTOMATION_MODE = process.env.JULES_AUTOMATION_MODE ?? "AUTO_CREATE_PR";
const DRY_RUN = process.argv.includes("--dry-run");

const ITEM_ID = String.raw`(?:FEAT|BUG|IDEA)-\d{4}`;

/**
 * Ways a session names the item it is *about*, as opposed to merely mentioning
 * it. Both creation paths are covered:
 *   - `${item.id}: ${item.title}` — the title createSession() writes below
 *   - "Bearbeite das Backlog-Item <ID>" — the prompt createSession() writes
 *   - "id: <ID>" — front matter, from `create-session.sh --file <backlog item>`,
 *     which sends the file's contents as the prompt and sets no title at all
 */
const SUBJECT_PATTERNS = [
  new RegExp(String.raw`^\s*(${ITEM_ID})\s*:`, "m"),
  new RegExp(String.raw`Backlog-Item\s+(${ITEM_ID})\b`),
  new RegExp(String.raw`^\s*id:\s*(${ITEM_ID})\s*$`, "m"),
];

const API_KEY = process.env.JULES_API_KEY;
const SOURCE = process.env.JULES_SOURCE;

// --dry-run needs the key too: it reads the session list for the de-dup check,
// so that a dry run reports what a real run would actually do. It still creates
// nothing, so JULES_SOURCE stays optional there.
if (!API_KEY) {
  console.error(
    "❌ JULES_API_KEY muss gesetzt sein — auch für --dry-run, weil der Dedup-Check die bestehenden Sessions liest.",
  );
  process.exit(1);
}
if (!DRY_RUN && !SOURCE) {
  console.error("❌ JULES_SOURCE muss gesetzt sein (oder --dry-run nutzen).");
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

/**
 * Loads recent sessions for the de-dup check. Runs in --dry-run as well —
 * skipping it there would make the dry run claim it dispatches items a real run
 * skips, which is worse than not having a dry run at all.
 *
 * Throws instead of returning empty on failure. An empty result silently
 * disables de-dup, so one failed request would re-dispatch every ready item at
 * once; aborting the run is the cheaper mistake.
 */
async function fetchRecentSessions() {
  let res;
  try {
    res = await fetch(`https://jules.googleapis.com/v1alpha/sessions?pageSize=${SESSION_PAGE_SIZE}`, {
      headers: { "x-goog-api-key": API_KEY },
    });
  } catch (err) {
    throw new Error(`Sessions nicht erreichbar (${err.message}).`);
  }
  if (!res.ok) {
    throw new Error(`Sessions nicht ladbar (HTTP ${res.status}).`);
  }
  const data = await res.json();
  return data.sessions ?? [];
}

/**
 * The fields where an item ID means "this session is about that item". Session
 * outputs, PR links, branch names and state are deliberately not searched — an
 * ID that shows up there is a by-product of the work, not a claim on the item.
 */
function sessionText(session) {
  return [session?.title, session?.prompt].filter((s) => typeof s === "string").join("\n");
}

/**
 * A session older than the window stops blocking its item, so an item put back
 * to `ready` after a failed or abandoned attempt gets picked up again instead
 * of being suppressed forever by a session nobody is watching any more.
 *
 * A session with no parseable timestamp counts as recent. Blocking one dispatch
 * too many is a delay; two agents on one item is two conflicting PRs.
 */
function isWithinAgeWindow(session, nowMs) {
  const raw = session?.createTime ?? session?.create_time ?? session?.createdAt;
  if (typeof raw !== "string") return true;
  const created = Date.parse(raw);
  if (Number.isNaN(created)) return true;
  return nowMs - created <= SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Splits ID mentions into the ones a session declares as its subject and the
 * ones it merely contains — a backlog file sent as a prompt carries its whole
 * Links section, so a session for BUG-0053 also names BUG-0004.
 *
 * Both still suppress a dispatch: over-blocking costs a week's delay, and the
 * item stays `ready` for the next run. They are reported differently so a
 * suppression you did not expect is visible rather than silent.
 */
function indexSessions(sessions) {
  const nowMs = Date.now();
  const subjects = new Set();
  const mentions = new Set();
  let expired = 0;

  for (const session of sessions) {
    if (!isWithinAgeWindow(session, nowMs)) {
      expired++;
      continue;
    }
    const text = sessionText(session);
    for (const pattern of SUBJECT_PATTERNS) {
      const match = pattern.exec(text);
      if (match) subjects.add(match[1]);
    }
    for (const match of text.matchAll(new RegExp(ITEM_ID, "g"))) {
      mentions.add(match[0]);
    }
  }

  return { subjects, mentions, expired };
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
  if (AUTOMATION_MODE) body.automationMode = AUTOMATION_MODE;

  if (DRY_RUN) {
    console.log(`[dry-run] würde Session erstellen für ${item.id}`);
    // Counts towards MAX_PER_RUN like a real dispatch, so the dry run stops at
    // the same item a real run would instead of listing the whole backlog.
    return true;
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

let sessions;
try {
  sessions = await fetchRecentSessions();
} catch (err) {
  console.error(`❌ ${err.message} — Abbruch, statt ohne Dedup-Schutz zu dispatchen.`);
  process.exit(1);
}

const { subjects, mentions, expired } = indexSessions(sessions);
console.log(
  `${sessions.length} Session(s) geladen, ${expired} älter als ${SESSION_MAX_AGE_DAYS} Tage (zählen nicht mehr).`,
);

let dispatched = 0;

for (const item of ready) {
  if (dispatched >= MAX_PER_RUN) {
    console.log(`Limit von ${MAX_PER_RUN} pro Lauf erreicht, Rest bleibt für den nächsten Lauf.`);
    break;
  }
  if (subjects.has(item.id)) {
    console.log(`⏭️  ${item.id}: Session bearbeitet dieses Item bereits, überspringe.`);
    continue;
  }
  if (mentions.has(item.id)) {
    console.log(
      `⏭️  ${item.id}: nur in einer fremden Session erwähnt (z. B. als verlinktes Item), ` +
        `nicht deren Thema — trotzdem übersprungen. Falls das falsch ist, Item per ` +
        `create-session.sh manuell starten.`,
    );
    continue;
  }
  const ok = await createSession(item);
  if (ok) dispatched++;
}

console.log(DRY_RUN ? `${dispatched} Session(s) würden erstellt.` : `${dispatched} Session(s) erstellt.`);
