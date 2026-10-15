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

// Dedup for monitor-production.sh: the production monitor is stateless (fresh
// CI VM every run, reports/ is ephemeral), so without this guard every run
// with the same live findings creates a new Jules session with a near-identical
// prompt (observed 13./14./15.10.2026: three sessions, one PR). The check runs
// against the Jules session list — the same source dispatch-backlog.mjs uses —
// never against the filesystem.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Collapse volatile parts of an issue line so re-measurements match. */
export function normalizeIssue(line) {
  return String(line ?? "")
    .replace(/Performance-Score \d+/g, "Performance-Score N")
    .trim();
}

/** Stable 16-hex-char signature over the normalized, sorted issue list. */
export function signature(issues) {
  const hash = createHash("sha256");
  hash.update(
    (Array.isArray(issues) ? issues : []).map(normalizeIssue).sort().join("\n"),
  );
  return hash.digest("hex").slice(0, 16);
}

function normalizeText(text) {
  return String(text ?? "").replace(/Performance-Score \d+/g, "Performance-Score N");
}

function sessionTime(session) {
  return Date.parse(session?.createTime ?? session?.updateTime ?? "") || 0;
}

/**
 * A past session covers this finding when it carries our stable title, or
 * when its (normalized) prompt contains every (normalized) issue line. The
 * second form also matches sessions from before titles were introduced.
 */
export function sessionMatches(session, { title, normalizedIssues }) {
  if (session?.title && title && session.title === title) return true;
  const prompt = session?.prompt ? normalizeText(session.prompt) : "";
  if (!prompt || normalizedIssues.length === 0) return false;
  return normalizedIssues.every((line) => line && prompt.includes(line));
}

/**
 * Decide whether a new Jules session may be created.
 * Returns { decision: "SKIP" | "PROCEED" | "ERROR", last, ageDays, reason }.
 * Unparseable input fails closed (ERROR): the caller must then skip session
 * creation, like dispatch-backlog.mjs does when the session list is unloadable.
 */
export function checkDedup({ sessions, title, issues, maxAgeDays, now = Date.now() }) {
  if (!Array.isArray(sessions)) {
    return { decision: "ERROR", last: null, ageDays: null, reason: "session list is not an array" };
  }
  const maxAge = Number(maxAgeDays);
  if (!Number.isFinite(maxAge) || maxAge < 0) {
    return { decision: "ERROR", last: null, ageDays: null, reason: "invalid maxAgeDays" };
  }
  const normalizedIssues = (Array.isArray(issues) ? issues : []).map(normalizeIssue);
  const matches = sessions
    .filter((s) => sessionMatches(s, { title, normalizedIssues }))
    .map((s) => ({ name: s?.name ?? s?.id ?? "?", time: sessionTime(s) }))
    .filter((m) => m.time > 0)
    .sort((a, b) => b.time - a.time);
  if (matches.length === 0) return { decision: "PROCEED", last: null, ageDays: null, reason: null };
  const last = matches[0];
  const ageDays = (now - last.time) / 86_400_000;
  if (ageDays <= maxAge) {
    return { decision: "SKIP", last, ageDays, reason: `same signature handled ${ageDays.toFixed(1)}d ago` };
  }
  return { decision: "PROCEED", last, ageDays, reason: `last handling ${ageDays.toFixed(1)}d ago, beyond cooldown` };
}

function parseArgs(argv) {
  const out = { mode: "check", title: "", issuesFile: "", days: 7 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--print-signature") out.mode = "signature";
    else if (arg === "--title") out.title = argv[++i] ?? "";
    else if (arg === "--issues-file") out.issuesFile = argv[++i] ?? "";
    else if (arg === "--days") out.days = Number(argv[++i]);
  }
  return out;
}

function readIssues(issuesFile) {
  if (!issuesFile) return [];
  return readFileSync(issuesFile, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function readSessionsStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const issues = readIssues(args.issuesFile);
  if (args.mode === "signature") {
    process.stdout.write(`${signature(issues)}\n`);
    return;
  }
  const raw = await readSessionsStdin();
  let parsed = null;
  try {
    parsed = raw.trim() ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const sessions = Array.isArray(parsed) ? parsed : parsed?.sessions ?? null;
  const result = checkDedup({ sessions, title: args.title, issues, maxAgeDays: args.days });
  const last = result.last ? `${result.last.name}|${new Date(result.last.time).toISOString()}` : "-";
  process.stdout.write(`${result.decision}|${last}|${result.reason ?? ""}\n`);
}

const isMain = process.argv[1] ? import.meta.url.endsWith(process.argv[1].split("/").pop()) : false;
if (isMain) {
  await main();
}
