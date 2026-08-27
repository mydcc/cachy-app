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
 * The CI pipeline (.github/workflows/backlog-dispatch.yml) drives this script
 * through explicit phases, so Jules never clones a develop snapshot that lacks
 * its own claims:
 *
 *   --phase=status     Select dispatchable items, flip them — plus every item
 *                      an existing session already covers — to status:
 *                      in-progress with assignee: jules, regenerate
 *                      docs/backlog/INDEX.md (it rides in the same commit),
 *                      and report the selected IDs via --report-file=<path>.
 *                      Creates no session.
 *   (workflow)         Commit + push those docs/backlog/ changes to develop.
 *   --phase=sessions   Create the Jules sessions — ONLY for the IDs handed
 *                      over via --ids=A,B,... , still behind the mandatory
 *                      de-dup check. The workflow only reaches this phase
 *                      after the push above succeeded, so Jules' clone of
 *                      develop carries the claims from the very first commit.
 *   --phase=rollback   If a session creation failed after that push, its item
 *                      would sit on develop as a ghost in-progress claim. This
 *                      phase flips failed IDs back to status: ready (assignee
 *                      removed) and regenerates the index, so the workflow can
 *                      commit the correction.
 *
 * Running the script WITHOUT --phase keeps the historic one-shot behavior
 * (select → create sessions immediately → mark claims afterwards) for local,
 * manual use; only the CI workflow depends on the split ordering.
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
 *   5. capped at MAX_PER_RUN dispatches per run, to respect the daily/concurrent quota.
 *      MAX_PER_RUN caps the items SELECTED per run; a session creation failing
 *      later does not backfill another item within the same run — failed items
 *      are rolled back via --phase=rollback instead.
 *
 * Claims follow AGENTS.md ("Agent Lifecycle"): status: in-progress always
 * comes with assignee: jules; releasing a claim removes both again.
 *
 * This script never pushes to git itself — committing and pushing the claim
 * updates between the status and sessions phases is the workflow's job. Jules
 * is instructed (in the prompt) to follow docs/backlog/README.md's own
 * "Working an item as an agent" checklist itself, as the first commit of its
 * own PR.
 *
 * Usage:
 *   node scripts/jules/dispatch-backlog.mjs [--dry-run]
 *   node scripts/jules/dispatch-backlog.mjs --phase=status [--report-file=<path>] [--dry-run]
 *   node scripts/jules/dispatch-backlog.mjs --phase=sessions --ids=BUG-0042,FEAT-0017 [--report-file=<path>] [--dry-run]
 *   node scripts/jules/dispatch-backlog.mjs --phase=rollback --ids=BUG-0042 [--report-file=<path>] [--dry-run]
 * Requires: JULES_API_KEY (every phase except rollback reads the session list
 * for de-dup), JULES_SOURCE whenever sessions are actually created
 * (see scripts/jules/README.md).
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { updateFrontMatter } from "../lib/backlog-frontmatter.mjs";

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

const PHASES = ["status", "sessions", "rollback"];

const ITEM_ID = String.raw`(?:FEAT|BUG|IDEA)-\d{4}`;
const ITEM_ID_EXACT = new RegExp(`^${ITEM_ID}$`);

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

/**
 * CLI flags for the phase split. Unknown flags are collected and rejected by
 * main() instead of being silently ignored — a typoed --phase would otherwise
 * fall back to legacy mode and create sessions before the status push.
 */
export function parseArgs(argv) {
  const parsed = { phase: null, ids: [], reportFile: null, unknown: [] };
  for (const arg of argv) {
    if (arg === "--dry-run") continue;
    if (arg.startsWith("--phase=")) {
      parsed.phase = arg.slice("--phase=".length);
    } else if (arg.startsWith("--ids=")) {
      parsed.ids = arg
        .slice("--ids=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--report-file=")) {
      parsed.reportFile = arg.slice("--report-file=".length);
    } else {
      parsed.unknown.push(arg);
    }
  }
  return parsed;
}

function usage() {
  console.log(
    "Verwendung: node scripts/jules/dispatch-backlog.mjs [--phase=status|sessions|rollback] " +
      "[--ids=A,B] [--report-file=<Pfad>] [--dry-run]",
  );
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
      const fm = parseFrontMatter(readFileSync(path, "utf8"));
      if (!fm) continue;
      items.push({ ...fm, file: path.replace(ROOT + "/", "") });
    }
  }
  return items;
}

/**
 * The eligibility filter, unchanged by the phase split: same status/area/
 * priority checks, same unresolved-depends_on exclusion, evaluated against the
 * full item list so dependency state comes from the same snapshot.
 */
export function selectDispatchable(items) {
  return items.filter((i) => {
    if (i.status !== "ready" || EXCLUDE_AREAS.includes(i.area) || i.priority === "P0") {
      return false;
    }
    if (Array.isArray(i.depends_on) && i.depends_on.length > 0) {
      const unresolved = i.depends_on.filter((depId) => {
        const depItem = items.find((item) => item.id === depId);
        return depItem && depItem.status !== "done" && depItem.status !== "dropped";
      });
      if (unresolved.length > 0) {
        return false;
      }
    }
    return true;
  });
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

/** Mandatory de-dup guard, shared by every phase that dispatches: abort the whole run rather than work without it. */
async function fetchSessionsOrAbort() {
  try {
    return await fetchRecentSessions();
  } catch (err) {
    console.error(`❌ ${err.message} — Abbruch, statt ohne Dedup-Schutz zu dispatchen.`);
    process.exit(1);
  }
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
5. Der Status des Items ist auf 'in-progress' gesetzt.
6. Baue es gemäß AGENTS.md (Svelte 5 Runes only, decimal.js, keine hardcodierten Farben, Tests neben dem Code).
7. Verifiziere mit npm run check und den betroffenen Tests.
8. Setze status: done im Front-Matter erst wenn Acceptance Criteria bewiesen sind — sonst status: in-progress lassen und im PR sagen, was fehlt.
9. npm run backlog:check ausführen (Achtung: nicht npm run backlog:index committen — INDEX.md wird von CI nach dem Merge auf develop automatisch generiert).

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

/**
 * Canonical active claim per AGENTS.md ("Agent Lifecycle"): an in-progress
 * item always carries assignee: jules — npm run backlog:check enforces exactly
 * this pairing. Returns true only when the content actually changed, so a
 * re-run over already-updated files fabricates neither diffs nor commits.
 */
function markItemInProgress(item) {
  const fullPath = join(ROOT, item.file);
  const content = readFileSync(fullPath, "utf8");
  const updated = updateFrontMatter(content, { status: "in-progress", assignee: "jules" });
  if (updated === content) return false;
  writeFileSync(fullPath, updated, "utf8");
  console.log(`📝 ${item.id}: ${item.file} → status: in-progress, assignee: jules.`);
  return true;
}

/**
 * Releases a ghost claim after a failed session creation: back to ready,
 * assignee removed (updateFrontMatter drops null values). Only touches items
 * whose status is still in-progress — anything else means someone edited the
 * item meanwhile, and that edit wins.
 */
function resetItemToReady(item) {
  const fullPath = join(ROOT, item.file);
  const content = readFileSync(fullPath, "utf8");
  const fm = parseFrontMatter(content);
  if (fm?.status !== "in-progress") {
    console.log(`⏭️  ${item.id}: Status ist '${fm?.status ?? "?"}', nicht 'in-progress' — nichts zurückzusetzen.`);
    return false;
  }
  const updated = updateFrontMatter(content, { status: "ready", assignee: null });
  if (updated === content) return false;
  if (DRY_RUN) {
    console.log(`[dry-run] würde ${item.id} auf 'ready' zurücksetzen (assignee entfernen).`);
    return false;
  }
  writeFileSync(fullPath, updated, "utf8");
  console.log(`↩️  ${item.id}: ${item.file} → status: ready, assignee entfernt.`);
  return true;
}

/**
 * Regenerates docs/backlog/INDEX.md via npm run backlog:index so it rides in
 * the SAME commit as the front-matter updates — otherwise sync-backlog.yml's
 * index commit could land between our push and Jules' clone. Warns instead of
 * aborting, as before the split.
 */
function regenerateBacklogIndex(changedCount) {
  if (changedCount <= 0) return;
  console.log(`\n📚 Aktualisiere Backlog-Index (${changedCount} Item(s) geändert)...`);
  const indexRes = spawnSync("npm", ["run", "backlog:index"], { cwd: ROOT, stdio: "inherit" });
  if (indexRes.status !== 0) {
    console.error("⚠️  Backlog-Index konnte nicht aktualisiert werden.");
  }
}

/**
 * Machine-readable handoff to the workflow (--report-file=…): the workflow
 * extracts the IDs for the next phases from this JSON instead of scraping
 * console output. Human-facing logs stay untouched.
 */
function writeReport(reportFile, payload) {
  if (!reportFile) return;
  try {
    writeFileSync(reportFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch (err) {
    console.error(`⚠️  Bericht konnte nicht geschrieben werden (${err.message}).`);
  }
}

/**
 * Selection + mandatory de-dup, shared by the status phase and the legacy
 * one-shot mode. Returns empty arrays plus empty=true when nothing is ready —
 * in that case the historic flow exits BEFORE touching the API, and so does
 * this one. An unloadable session list aborts the whole run (see filter note 4).
 */
async function buildDispatchPlan() {
  const items = loadBacklogItems();
  const ready = selectDispatchable(items);

  console.log(`${items.length} Backlog-Items insgesamt, ${ready.length} davon status=ready und im erlaubten Scope.`);

  if (ready.length === 0) {
    console.log("Nichts zu dispatchen. Items auf status: ready setzen, damit hier was passiert.");
    return { empty: true, toDispatch: [], syncOnly: [] };
  }

  const sessions = await fetchSessionsOrAbort();
  const { subjects, mentions, expired } = indexSessions(sessions);
  console.log(
    `${sessions.length} Session(s) geladen, ${expired} älter als ${SESSION_MAX_AGE_DAYS} Tage (zählen nicht mehr).`,
  );

  const toDispatch = [];
  const syncOnly = [];

  for (const item of ready) {
    if (toDispatch.length >= MAX_PER_RUN) {
      console.log(`Limit von ${MAX_PER_RUN} pro Lauf erreicht, Rest bleibt für den nächsten Lauf.`);
      break;
    }
    if (subjects.has(item.id)) {
      if (item.status === "ready") {
        console.log(`🔄 ${item.id}: Session bearbeitet dieses Item bereits — Status wird auf 'in-progress' synchronisiert.`);
        syncOnly.push(item);
      } else {
        console.log(`⏭️  ${item.id}: Session bearbeitet dieses Item bereits, überspringe.`);
      }
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
    toDispatch.push(item);
  }

  return { empty: false, toDispatch, syncOnly };
}

/**
 * Phase 1 der CI-Pipeline: Auswahl treffen, Claims schreiben (+ Index), aber
 * KEINE Session erstellen. Der Workflow committed/pusht die Änderungen danach,
 * und erst die darauffolgende sessions-Phase erzeugt Sessions für genau diese
 * IDs — deshalb landet die Auswahl im Report.
 */
async function runStatusPhase(args) {
  const { empty, toDispatch, syncOnly } = await buildDispatchPlan();
  const claimItems = [...toDispatch, ...syncOnly];

  let changed = 0;
  if (!DRY_RUN) {
    for (const item of claimItems) {
      if (markItemInProgress(item)) changed++;
    }
    regenerateBacklogIndex(changed);
  }

  if (!empty) {
    if (DRY_RUN) {
      console.log(
        `[dry-run] ${toDispatch.length} Session(s) würden erstellt; ` +
          `${claimItems.length} Item(s) würden auf 'in-progress' gesetzt.`,
      );
    } else {
      console.log(
        `Status-Phase abgeschlossen: ${toDispatch.length} Item(s) zum Dispatchen vorgemerkt, ` +
          `${changed} Datei(en) geändert.`,
      );
    }
  }

  writeReport(args.reportFile, {
    phase: "status",
    dryRun: DRY_RUN,
    toDispatch: toDispatch.map((i) => i.id),
    syncedOnly: syncOnly.map((i) => i.id),
    hasChanges: DRY_RUN ? claimItems.length > 0 : changed > 0,
  });
}

/**
 * Phase 3 der CI-Pipeline (nach dem Status-Push): erstellt Sessions
 * ausschließlich für die übergebenen IDs aus der Status-Phase. Die Dateien
 * stehen zwischen den Phasen bereits auf 'in-progress', daher wird hier nicht
 * mehr nach status=ready gefiltert. De-dup bleibt Pflicht — zwischen den
 * Phasen könnte ein anderer Lauf Sessions für dieselben Items angelegt haben.
 * Schlägt das Laden der Sessions fehl, wird abgebrochen OHNE Rollback: Ob ein
 * gepuschter Claim zu einer echten oder gar keinen Session gehört, lässt sich
 * von hier nicht unterscheiden — das muss ein Mensch prüfen.
 */
async function runSessionsPhase(args) {
  const items = loadBacklogItems();
  const byId = new Map(items.map((item) => [item.id, item]));

  const targets = [];
  for (const id of args.ids) {
    if (!ITEM_ID_EXACT.test(id)) {
      console.error(`❌ Ungültige Item-ID '${id}' — erwartet wird z. B. BUG-0042.`);
      process.exit(1);
    }
    const item = byId.get(id);
    if (!item) {
      console.error(`❌ ${id}: kein solches Backlog-Item unter docs/backlog/ gefunden.`);
      process.exit(1);
    }
    targets.push(item);
  }
  console.log(`${targets.length} vor-ausgewählte(s) Item(s) für die Session-Erstellung.`);

  const sessions = await fetchSessionsOrAbort();
  const { subjects, expired } = indexSessions(sessions);
  console.log(
    `${sessions.length} Session(s) geladen, ${expired} älter als ${SESSION_MAX_AGE_DAYS} Tage (zählen nicht mehr).`,
  );

  const created = [];
  const failed = [];
  const skippedExisting = [];

  for (const item of targets) {
    if (subjects.has(item.id)) {
      console.log(`🔄 ${item.id}: Session existiert bereits — keine neue erstellt, Status bleibt 'in-progress'.`);
      skippedExisting.push(item.id);
      continue;
    }
    const ok = await createSession(item);
    if (ok) created.push(item.id);
    else failed.push(item.id);
  }

  writeReport(args.reportFile, { phase: "sessions", dryRun: DRY_RUN, created, failed, skippedExisting });

  if (failed.length > 0) {
    console.error(`❌ ${failed.length} Session(n) konnten nicht erstellt werden: ${failed.join(", ")}`);
    console.error(
      "   Die Items stehen auf develop bereits als 'in-progress' — ohne Korrektur blieben das Geister-Claims.",
    );
    console.error(`   Zurücksetzen mit: node scripts/jules/dispatch-backlog.mjs --phase=rollback --ids=${failed.join(",")}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    DRY_RUN
      ? `${created.length} Session(s) würden erstellt.`
      : `${created.length} Session(s) erstellt` +
        (skippedExisting.length > 0 ? `, ${skippedExisting.length} lief(en) bereits.` : "."),
  );
}

/**
 * Phase 4 der CI-Pipeline (nur nach fehlgeschlagenen Session-Erstellungen):
 * setzt die betroffenen Items auf status: ready zurück und entfernt den
 * Assignee, damit der Workflow den Geister-Claim per Korrektur-Commit auflöst.
 * Reine Lokal-Operation — kein API-Key nötig.
 */
function runRollbackPhase(args) {
  const items = loadBacklogItems();
  const byId = new Map(items.map((item) => [item.id, item]));

  const resetIds = [];
  let changed = 0;
  for (const id of args.ids) {
    const item = byId.get(id);
    if (!item) {
      console.error(`⚠️  ${id}: kein solches Backlog-Item unter docs/backlog/ gefunden — übersprungen.`);
      continue;
    }
    if (resetItemToReady(item)) {
      resetIds.push(id);
      changed++;
    }
  }

  regenerateBacklogIndex(changed);

  writeReport(args.reportFile, { phase: "rollback", dryRun: DRY_RUN, reset: resetIds });

  console.log(
    DRY_RUN
      ? `[dry-run] Rollback geprüft: ${resetIds.length} Item(s) würden auf 'ready' zurückgesetzt.`
      : `Rollback abgeschlossen: ${resetIds.length} Item(s) zurück auf 'ready' (${resetIds.join(", ") || "keine"}).`,
  );
}

/**
 * Historic one-shot mode (no --phase flag): select, create the sessions right
 * away, then write the claims. Kept for local/manual runs — the CI workflow
 * uses the split ordering instead, because Jules clones develop AT session
 * creation time and would otherwise start from a snapshot without the claims.
 */
async function runLegacyOneShot() {
  const { empty, toDispatch, syncOnly } = await buildDispatchPlan();
  if (empty) {
    process.exit(0);
  }

  let updatedCount = 0;
  for (const item of syncOnly) {
    if (markItemInProgress(item)) updatedCount++;
  }

  let dispatched = 0;
  for (const item of toDispatch) {
    const ok = await createSession(item);
    if (!ok) continue;
    dispatched++;
    if (markItemInProgress(item)) updatedCount++;
  }

  regenerateBacklogIndex(updatedCount);

  console.log(DRY_RUN ? `${dispatched} Session(s) würden erstellt.` : `${dispatched} Session(s) erstellt (${updatedCount} Item(s) aktualisiert).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.unknown.length > 0) {
    console.error(`❌ Unbekannte(s) Argument(e): ${args.unknown.join(" ")}`);
    usage();
    process.exit(1);
  }
  if (args.phase !== null && !PHASES.includes(args.phase)) {
    console.error(`❌ Unbekannter Wert für --phase '${args.phase}' — erlaubt: ${PHASES.join(", ")}.`);
    usage();
    process.exit(1);
  }
  if ((args.phase === "sessions" || args.phase === "rollback") && args.ids.length === 0) {
    console.error(`❌ --phase=${args.phase} benötigt --ids=A,B (komma-separierte Item-IDs).`);
    usage();
    process.exit(1);
  }

  // The de-dup check reads the live session list everywhere except rollback,
  // which touches nothing remote — hence the one phase without a key
  // requirement. Still required for --dry-run: the dedup check needs it there
  // too, so a dry run reports what a real run would actually do.
  if (args.phase !== "rollback" && !API_KEY) {
    console.error(
      "❌ JULES_API_KEY muss gesetzt sein — auch für --dry-run, weil der Dedup-Check die bestehenden Sessions liest.",
    );
    process.exit(1);
  }
  // SOURCE is only consumed when sessions are actually created; the status
  // phase creates none.
  if (!DRY_RUN && (args.phase === null || args.phase === "sessions") && !SOURCE) {
    console.error("❌ JULES_SOURCE muss gesetzt sein (oder --dry-run nutzen).");
    process.exit(1);
  }

  switch (args.phase) {
    case "status":
      await runStatusPhase(args);
      break;
    case "sessions":
      await runSessionsPhase(args);
      break;
    case "rollback":
      runRollbackPhase(args);
      break;
    default:
      await runLegacyOneShot();
      break;
  }
}

// Only execute when invoked directly — importing this module (tests, tools)
// must stay side-effect-free.
const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  await main();
}
