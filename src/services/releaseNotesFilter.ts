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
 * User-facing release-notes filter.
 *
 * `CHANGELOG.md` is generated from Conventional Commits and therefore contains
 * everything that ever landed on main: CI plumbing, lint chores, one fixup
 * commit per push, and — from the era before the stable/prerelease split in
 * `release.config.js` — every beta section duplicated below its stable
 * release. None of that is meaningful to a trader reading the in-app
 * changelog.
 *
 * This module is deliberately dependency-free so it can be reused from plain
 * Node scripts (one-off history cleanup) as well as from the app. It keeps a
 * bullet only when it describes a user-visible change:
 *
 * 1. Prerelease sections (`1.x.y-beta.N`) are dropped — their commits are
 *    already part of the stable release notes.
 * 2. Exact duplicates are collapsed to their first occurrence. Duplicates
 *    differ only in commit-hash links and `closes #…` references, which are
 *    ignored for comparison.
 * 3. Internal maintenance bullets are dropped by conventional type/scope
 *    (`ci`, `chore`, `eslint`, …) or by internal keywords (backlog tooling,
 *    token plumbing, lint chores, …).
 * 4. Sections and versions left empty by the above are removed, so no bare
 *    `### Bug Fixes` heading survives without entries.
 *
 * Forward-looking cleanliness is enforced in `release.config.js` (pinned
 * preset with a `feat`/`fix` type whitelist); this filter is the safety net
 * for the app view and for the already-published history.
 */

const VERSION_HEADING = /^#{1,3}\s+\[?\d+\.\d+\.\d+/;
const PRERELEASE_HEADING = /^#{1,3}\s+\[?\d+\.\d+\.\d+-/;
const SUBSECTION_HEADING = /^#{3,}\s+.*$/;
const BULLET = /^\*\s+/;

/** Conventional scopes that never describe a user-visible change. */
export const INTERNAL_SCOPES = new Set([
  "ci",
  "chore",
  "eslint",
  "commitlint",
  "cd",
  "deps",
  "dev",
  "test",
  "tests",
  "e2e",
  "backlog",
  "release",
]);

/** Conventional types that never describe a user-visible change. */
export const INTERNAL_TYPES = new Set([
  "chore",
  "ci",
  "build",
  "test",
  "tests",
  "docs",
  "style",
  "refactor",
  "perf",
  "revert",
  "cd",
  "deps",
]);

/**
 * Substrings marking internal work that carries no conventional prefix —
 * backlog tooling, token plumbing, lint chores, agent workflow. Matched
 * case-insensitively against the whole bullet. Each entry targets real
 * history, so think twice before extending the list: a trader-facing fix
 * mentioning one of these words would vanish from the app.
 */
const INTERNAL_KEYWORDS = [
  "commitlint",
  "eslint",
  "string linter",
  "hardcoded-string",
  "jules",
  "backlog",
  "kanban",
  "dedup",
  "to-issues sync",
  "sync script",
  "github_token",
  "project_sync_token",
  "sync_token",
  "agents.md",
  "create-session",
  "pre-commit",
  "husky",
  "back-merge",
  "doc comment",
  "type safety",
  "n+1",
  "typedarray",
  "arraybuffer",
];

/**
 * Extracts the conventional `type` and `scope` from a generated bullet, e.g.
 * `* **fix(exchange):** …` or `* **security:** …` (scope without type).
 * Returns null for bullets without a conventional prefix.
 */
export function parseBulletPrefix(line: string): {
  type: string;
  scope: string;
} | null {
  const match = line.match(
    /^\*\s+(?:\*\*([A-Za-z0-9_/-]+)(?:\(([^)]*)\))?:\*\*|([A-Za-z0-9_/-]+)(?:\(([^)]*)\))?:)\s/,
  );
  if (!match) return null;

  return { type: (match[1] ?? match[3]).toLowerCase(), scope: match[2] ?? match[4] ?? "" };
}

/** True when the bullet describes internal maintenance, not a user change. */
export function isInternalBullet(line: string): boolean {
  const prefix = parseBulletPrefix(line);
  if (prefix) {
    if (INTERNAL_TYPES.has(prefix.type)) return true;
    const scopes = prefix.scope
      .split(",")
      .map((scope) => scope.trim().toLowerCase());
    if (scopes.some((scope) => INTERNAL_SCOPES.has(scope))) return true;
    // A bare `**scope:**` bullet (no type) puts the scope in `type`.
    if (!prefix.scope && INTERNAL_SCOPES.has(prefix.type)) return true;
  }

  const lowered = line.toLowerCase();
  return INTERNAL_KEYWORDS.some((keyword) => lowered.includes(keyword));
}

/**
 * Normalizes a bullet for duplicate comparison: markdown links collapse to
 * their text, commit-hash and issue links vanish, trailing `closes` /
 * `references` lists are cut. `* fix(ui): … ([abc1234](…))` and
 * `* fix(ui): … ([#1820](…))` therefore compare equal.
 */
export function normalizeBullet(line: string): string {
  return line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/,\s*(closes|references)\s+.*$/i, "")
    .replace(/\s*\([0-9a-f]{7,40}\)/g, "")
    .replace(/\s*\(#\S+?\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Removes the trailing `, closes …` / `, references …` list for display. */
function stripReferenceSuffix(line: string): string {
  return line.replace(/,\s*(closes|references)\s+.*$/i, "").trimEnd();
}

/**
 * Filters generated release sections down to user-facing entries.
 * See the module docstring for the exact rules.
 */
export function filterUserFacingReleases(sections: string): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  // A subsection heading is kept tentatively and removed again if no bullet
  // follows it; same for the version heading.
  let pendingSubsection = -1;
  let pendingVersion = -1;
  let versionHasBullets = false;

  const flushPending = () => {
    if (pendingSubsection !== -1 && kept[pendingSubsection] !== undefined) {
      kept.splice(pendingSubsection, 1);
      if (pendingVersion > pendingSubsection) pendingVersion -= 1;
      pendingSubsection = -1;
    }
  };

  const pushHeading = (line: string): number => {
    if (kept.length > 0 && kept[kept.length - 1] !== "") kept.push("");
    kept.push(line);
    return kept.length - 1;
  };

  for (const line of sections.split("\n")) {
    if (VERSION_HEADING.test(line)) {
      flushPending();
      if (pendingVersion !== -1 && !versionHasBullets) {
        kept.splice(pendingVersion, kept.length - pendingVersion);
      }
      if (PRERELEASE_HEADING.test(line)) {
        // Skip the whole prerelease body: with pendingVersion at -1 every
        // line is ignored until the next version heading.
        pendingVersion = -1;
        pendingSubsection = -1;
        continue;
      }
      pendingVersion = pushHeading(line);
      pendingSubsection = -1;
      versionHasBullets = false;
      continue;
    }

    if (pendingVersion === -1) continue;

    if (SUBSECTION_HEADING.test(line)) {
      flushPending();
      pendingSubsection = pushHeading(line);
      continue;
    }

    if (BULLET.test(line)) {
      if (isInternalBullet(line)) continue;
      const key = normalizeBullet(line);
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(stripReferenceSuffix(line));
      pendingSubsection = -1;
      versionHasBullets = true;
      continue;
    }
  }

  flushPending();
  if (pendingVersion !== -1 && !versionHasBullets) {
    kept.splice(pendingVersion, kept.length - pendingVersion);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
