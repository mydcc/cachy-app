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
 * Fails when `engines.node` in package.json is narrower than what a production
 * dependency declares, i.e. when the project promises Node versions its own
 * dependencies refuse.
 *
 * This is the direction `check-node-version.mjs` does not cover: that script
 * guards `.node-version` against `engines`, which is what broke when a sandbox
 * session replayed a stale pin. This one guards `engines` against the
 * dependencies, which is what broke when jsdom 30.1.2 arrived requiring
 * `^22.22.2 || ^24.15.0 || >=26.0.0` while `engines` still said `>=22.19.0`
 * (BUG-0637).
 *
 * Scope: production dependencies only. A devDependency floor does not affect a
 * user running the built app — `deploy.sh` installs with `npm ci --omit=dev` —
 * so widening `engines` for a build-time package would be a false alarm.
 *
 *   node scripts/check-engines-floor.mjs
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

/** @returns the engines.node range declared by a dependency, or null. */
function declaredNodeRange(name) {
  try {
    const manifestPath = require.resolve(`${name}/package.json`);
    return JSON.parse(readFileSync(manifestPath, "utf8"))?.engines?.node ?? null;
  } catch {
    // Package without an `exports` entry for package.json, or not resolvable
    // from here. Not an error: we cannot check what we cannot read, and CI
    // installs everything before this runs.
    return null;
  }
}

/**
 * A declared range is a constraint like `^22.22.2 || ^24.15.0 || >=26.0.0`.
 * We compare the lowest minor each clause admits, which is enough to spot the
 * case that matters: our `engines` promising a Node a dependency rejects.
 *
 * Accepts `^`, `>=` and a bare version, since all three carry a lower bound.
 * A clause that is a pure upper bound (`<22`, or a bare `*`) contributes
 * nothing. Returns the lowest floor, or null when no clause has a readable one
 * — the caller treats that as "cannot check" rather than "is fine".
 */
function lowestFloor(range) {
  let lowest = null;
  for (const clause of range.split("||")) {
    const m = clause.trim().match(/^(?:\^|>=)?\s*(\d+)\.(\d+)/);
    if (!m) continue;
    const minor = Number(`${m[1]}.${m[2]}`);
    if (lowest === null || minor < lowest) lowest = minor;
  }
  return lowest;
}

function fail(msg) {
  console.error(`❌ engines-floor check: ${msg}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const ours = pkg?.engines?.node;

if (!ours) {
  fail("package.json declares no engines.node — nothing to check against");
}

const ourFloor = lowestFloor(ours);
if (ourFloor === null) {
  fail(`cannot read a lower bound out of engines.node "${ours}"`);
}

const offenders = [];
for (const name of Object.keys(pkg.dependencies ?? {})) {
  const range = declaredNodeRange(name);
  if (!range) continue;
  const depFloor = lowestFloor(range);
  if (depFloor === null) continue;
  if (depFloor > ourFloor) {
    offenders.push(`${name} requires >= ${depFloor} (declared "${range}")`);
  }
}

if (offenders.length > 0) {
  fail(
    `engines.node "${ours}" admits Node ${ourFloor}, below what production ` +
      `dependencies require:\n  - ${offenders.join("\n  - ")}\n` +
      `Raise engines.node to cover the strictest floor.`,
  );
}

console.log(
  `✅ engines-floor: engines.node "${ours}" covers every production dependency floor.`,
);