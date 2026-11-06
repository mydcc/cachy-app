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

/*
 * arch-baseline-guard.mjs — the half of the BUG-0799 ratchet that needs the
 * base branch.
 *
 * `scripts/arch-cycles.mjs` compares the tree against
 * `scripts/arch-cycles.baseline.json`, and both travel in the same commit. So a
 * change can add an uphill edge and raise the baseline to match: the number it
 * is measured against moved with it. `--update-baseline` refuses that, but a
 * hand edit does not, and nothing in the repository could tell the difference.
 *
 * This reads the baseline from the **merge base** — the commit the branch
 * forked from — and fails if any frozen value rose between there and here. The
 * merge base, not `origin/develop`: a branch that is merely behind must not
 * look like a regression, and a release branch compared against `develop`
 * would report every later burn-down as noise.
 *
 *   node scripts/arch-baseline-guard.mjs                # against origin/develop
 *   node scripts/arch-baseline-guard.mjs origin/main    # explicit base ref
 *
 * Exit codes: 0 pass, 1 the baseline was raised, 2 the comparison could not be
 * made. 2 is a failure on purpose — a guard that passes when it cannot see the
 * base is the same as no guard, in a CI job whose `fetch-depth` someone will
 * eventually trim.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE_RELATIVE_PATH = "scripts/arch-cycles.baseline.json";

/** The frozen axes. `lazy` and `combined` carry different keys on purpose. */
const AXES = ["static", "lazy", "combined"];

function sumCycleMass(sccs) {
  if (!Array.isArray(sccs)) return 0;
  let total = 0;
  for (const entry of sccs) {
    if (Number.isFinite(entry?.size)) total += entry.size;
  }
  return total;
}

/**
 * Compare two baseline files and return the ways the newer one is looser.
 *
 * Two measurements, both chosen so a legitimate burn-down cannot trip them:
 *
 *   - every uphill pair may only fall. A pair that is absent on the base may
 *     not appear with a count: that is a new violation being frozen.
 *   - the total cycle mass per axis may only fall. Anchors are *not* compared
 *     by name: an SCC's anchor is its alphabetically first member, so a
 *     renamed file re-anchors a cycle without changing the graph. Summed mass
 *     survives renames, splits and merges, and a new cycle adds mass.
 *
 * @param {unknown} current baseline in the working tree
 * @param {unknown} base baseline at the merge base
 * @param {string} baseLabel where `base` came from, for the messages
 * @returns {string[]} failures; empty means the ratchet held
 */
export function compareBaselineRatchet(current, base, baseLabel = "the base branch") {
  const failures = [];

  const currentAxes = current && typeof current === "object" ? current : {};
  const baseAxes = base && typeof base === "object" ? base : {};

  // A baseline without these two is not a measuring stick; comparing against it
  // would pass everything. Refusing is the only safe reading.
  for (const required of ["static", "combined"]) {
    if (!baseAxes[required] || typeof baseAxes[required] !== "object") {
      failures.push(
        `the baseline from ${baseLabel} has no \`${required}\` block — it is not a baseline, ` +
          `so this comparison would prove nothing`,
      );
    }
  }
  if (failures.length > 0) return failures;

  if (!currentAxes.static || !currentAxes.combined) {
    failures.push("the baseline in this tree has no `static` or no `combined` block");
    return failures;
  }

  for (const axis of AXES) {
    const now = currentAxes[axis];
    const before = baseAxes[axis];
    if (!now) {
      failures.push(`the baseline in this tree drops the \`${axis}\` block`);
      continue;
    }

    for (const [pair, count] of Object.entries(now.uphillPairs ?? {})) {
      const allowed = before?.uphillPairs?.[pair];
      if (allowed === undefined) {
        failures.push(
          `[${axis}] ${pair} is frozen here but was not in the baseline on ${baseLabel} ` +
            `(${count} edges) — a new uphill pair cannot be introduced by raising the baseline`,
        );
      } else if (count > allowed) {
        failures.push(
          `[${axis}] ${pair} rose from ${allowed} to ${count} edges against ${baseLabel}`,
        );
      }
    }

    if (Array.isArray(now.sccs) || Array.isArray(before?.sccs)) {
      const nowMass = sumCycleMass(now.sccs);
      const beforeMass = sumCycleMass(before?.sccs);
      if (nowMass > beforeMass) {
        failures.push(
          `[${axis}] frozen cycle mass rose from ${beforeMass} to ${nowMass} files against ` +
            `${baseLabel} — a new or grown cycle was written into the baseline`,
        );
      }
    }
  }

  return failures;
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function stop(message, code) {
  console.error(`\n❌ ${message}`);
  process.exit(code);
}

function main(argv) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const baseRef = argv.find((argument) => !argument.startsWith("--")) ?? "origin/develop";
  const currentPath = path.join(repoRoot, BASELINE_RELATIVE_PATH);

  if (!existsSync(currentPath)) {
    stop(`${BASELINE_RELATIVE_PATH} does not exist in this tree`, 2);
  }

  let current;
  try {
    current = JSON.parse(readFileSync(currentPath, "utf8"));
  } catch (error) {
    stop(`${BASELINE_RELATIVE_PATH} is not valid JSON: ${error.message}`, 2);
  }

  let mergeBase;
  try {
    mergeBase = git(["merge-base", "HEAD", baseRef]);
  } catch {
    stop(
      `cannot resolve a merge base for ${baseRef}. A shallow clone has no history to compare ` +
        `against — CI needs \`fetch-depth: 0\` on the checkout step.`,
      2,
    );
  }
  if (!mergeBase) {
    stop(`\`git merge-base HEAD ${baseRef}\` returned nothing — no common ancestor`, 2);
  }

  let base;
  try {
    base = JSON.parse(git(["show", `${mergeBase}:${BASELINE_RELATIVE_PATH}`]));
  } catch {
    // The first PR to add the file: the base branch has nothing to compare
    // against, so the ratchet starts with this baseline.
    console.log(
      `\nℹ️  no ${BASELINE_RELATIVE_PATH} on ${baseRef} (${mergeBase.slice(0, 9)}) — ` +
        `this change introduces the baseline, nothing to ratchet against yet.`,
    );
    return;
  }

  const label = `${baseRef} (${mergeBase.slice(0, 9)})`;
  const failures = compareBaselineRatchet(current, base, label);

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} way(s) the import-graph baseline got looser than ${label}:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error("\nFix the regression instead of freezing it. Raising a number is not a burn-down.");
    process.exit(1);
  }

  console.log(`\n✅ the import-graph baseline only ratchets downward against ${label}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
