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
 * audit-decimal.mjs
 *
 * Scans every TypeScript source file that imports decimal.js (i.e. every file
 * that participates in financial math) for unsafe native-number conversions:
 *
 *   Number(...)   — narrows a union to number, losing Decimal precision
 *   parseFloat(…) — parses a string into a lossy IEEE-754 float
 *
 * These are the two patterns the original grep in audit.yml detected on the
 * original three hardcoded files.  This script extends that check to the
 * entire financial surface automatically — any new file that correctly imports
 * Decimal will be included in future runs without touching this script.
 *
 * `.svelte` files are scanned too, and without the import gate (BUG-0534). A
 * component's `<script>` block runs the same conversions as a `.ts` file, and
 * the `.ts` selection rule — "imports decimal.js" — is precisely the blind
 * spot here: a component that converts a price with `parseFloat` instead of
 * using Decimal does not import decimal.js, so an import gate would skip
 * exactly the file the check exists to catch. The import gate is kept for
 * `.ts`, where it means what it says.
 *
 * What this does not claim: detection is unchanged, so a conversion passed by
 * reference (`prices.map(Number)`) is still invisible. Widening the net to
 * components was this item's scope; re-tuning the patterns was explicitly not.
 *
 * Opt-out for known-safe uses (e.g. epoch-ms timestamps, array indices):
 * append   // audit: safe — <reason>   to the offending line. In a component
 * the marker takes one of three comment forms, because only one of the three
 * places a call can sit accepts a line comment — see SAFE_MARKER. The reason
 * is required and enforced, not merely documented.
 *
 * Usage: node scripts/audit-decimal.mjs [--case <fixture-case>]
 * `--case` exists so the test suite can point the script at one fixture case;
 * a fixture under src/ would otherwise fail the real run. It takes a case
 * *name* under a hardcoded root, never a path.
 *
 * Exit codes: 0 = clean, 1 = violations found.
 */

import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/**
 * Where to scan, derived rather than taken.
 *
 * The only reason this script ever looks anywhere but `src` is its own test
 * suite, which points it at a fixture case. So the argument is a *case name*,
 * not a path: it is matched against a whitelist of name characters and joined
 * onto a hardcoded fixture root, which makes a traversal impossible by
 * construction rather than by a check someone can forget. Nothing
 * command-line-shaped is ever concatenated into a path.
 *
 * `--case` also keeps the test affordance visible in the invocation instead of
 * hiding it behind a positional argument that looks like a real feature.
 */
const FIXTURE_ROOT = 'scripts/__fixtures__/audit-decimal';
const CASE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function scanTarget(argv) {
    if (argv[0] !== '--case') return 'src';
    const name = argv[1] ?? '';
    if (!CASE_NAME.test(name)) {
        throw new Error(`not a fixture case name: ${name}`);
    }
    return `${FIXTURE_ROOT}/${name}`;
}

/**
 * The scan directory, checked before anything is read.
 *
 * A fixture case name is already constrained to a single path segment under a
 * hardcoded root, so the only remaining escape is a symlink inside the fixture
 * tree. That is what the resolved containment check below is for, and it runs
 * on a value that is already inside the repository by construction.
 */
async function resolveScanDir(requested) {
    const rootReal = await realpath(ROOT);
    const target = await realpath(join(rootReal, requested));
    if (target !== rootReal && !target.startsWith(rootReal + sep)) {
        throw new Error(`refusing to scan outside the repository: ${target}`);
    }
    if (!(await stat(target)).isDirectory()) {
        throw new Error(`not a directory: ${target}`);
    }
    return target;
}

let SRC;
try {
    SRC = await resolveScanDir(scanTarget(process.argv.slice(2)));
} catch (error) {
    if (error?.code === 'ENOENT') {
        console.error(`audit-decimal: no such directory: ${scanTarget(process.argv.slice(2))}`);
    } else {
        console.error(`audit-decimal: ${error.message}`);
    }
    console.error('usage: node scripts/audit-decimal.mjs [--case <fixture-case>]');
    process.exit(2);
}

/**
 * Detects unsafe native-number conversion calls.
 * Anchored with \b so `.toNumber()` and `.toFixed()` are NOT matched —
 * those are Decimal → primitive conversions that are intentional and safe
 * at display / serialisation boundaries.
 */
const UNSAFE_PATTERN = /\b(Number|parseFloat)\s*\(/;

/**
 * Lines carrying this marker are explicitly acknowledged as non-financial.
 *
 * Three comment forms, because a `.svelte` file has three places a flagged call
 * can sit and only one of them accepts a line comment: a line comment in a
 * `<script>` block, a block comment inside a template expression's braces, and
 * an HTML comment after a template expression. The latter two are why this
 * accepts more than `//` — an HTML comment is invalid inside a tag's
 * attribute list, and a line comment is not a comment in a template at all, so
 * without all three an exemption in those positions would break the component
 * instead of documenting it.
 */
const SAFE_MARKER = /(?:\/\/|\/\*|<!--)\s*audit:\s*safe/;

/**
 * A marker that also carries a reason.
 *
 * The reason is the whole point of the marker, so it is enforced rather than
 * documented: a marker with nothing after it would otherwise be a green build,
 * and a green build is the thing this script exists to prevent.
 *
 * The separator is optional so `audit: safe — reason` and `audit: safe: reason`
 * both count, and the reason must start with a letter. Note that a plain
 * "any non-space character" check would be wrong here: the asterisk of a
 * closing block comment satisfies it, so a bare marker would pass.
 */
const SAFE_REASON = /(?:\/\/|\/\*|<!--)\s*audit:\s*safe\s*(?:[—–:-]\s*|\s+--?\s+)?[A-Za-z][\w ,;:'"()\/-]{3,}/;

/** Only files that participate in financial math need to be audited. */
const DECIMAL_IMPORT = /from\s+['"]decimal\.js['"]/;

/** Exclude test, spec and benchmark files — they may legitimately wrap values. */
const EXCLUDE_PATTERN = /\.(test|spec|bench)\.[cm]?[jt]s$|\.(test|spec|bench)\.svelte$/;

/**
 * Skip lines that are entirely a comment — the pattern word "Number" or
 * "parseFloat" appearing in a documentation comment is not a real call site.
 *
 * The comment must also *close* on the line — for the block forms. A `//`
 * line comment has no closing token and is always complete. A prefix-only test
 * would treat `<!-- TODO: replace Number(x) with Decimal --><span>{Number(x)}`
 * as a comment line and silently drop a real violation, which is the mechanism
 * by which a widened net quietly stops working.
 *
 * Svelte's own markup comment (`{/* … *\/}`) is deliberately not listed: the
 * repo's ESLint cannot parse it, so no component here can carry one.
 */
const COMMENT_LINE = /^\s*(?:\/\/.*|(?:\/\*|\*|<!--)[^*]*?(?:\*\/|-->)\}?)\s*$/;

/** `<style>` blocks hold CSS, where the word "Number(" is not a call site. */
const STYLE_BLOCK = /<style[^>]*>[\s\S]*?<\/style>/g;

/** Recursively yield every auditable source file under `dir`. */
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.svelte'))) {
      yield full;
    }
  }
}

let violations = 0;
let unreasoned = 0;
let tsScanned = 0;
let svelteScanned = 0;

try {
  for await (const file of walk(SRC)) {    if (EXCLUDE_PATTERN.test(file)) continue;

    const content = await readFile(file, 'utf8');
    const isSvelte = file.endsWith('.svelte');

    // A `.ts` file is audited when it has opted into Decimal.js. A `.svelte`
    // file always is: see the note at the top of this file — the import gate
    // would skip exactly the component that converts a price natively.
    if (!isSvelte && !DECIMAL_IMPORT.test(content)) continue;

    if (isSvelte) svelteScanned++;
    else tsScanned++;

    // A `<style>` block is CSS: "Number(" there is not a call site. Blanking
    // it keeps the line count intact, so reported line numbers stay true.
    const lines = (isSvelte ? content.replace(STYLE_BLOCK, (block) =>
      block.replace(/[^\n]/g, ' ')) : content).split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!UNSAFE_PATTERN.test(line) || COMMENT_LINE.test(line)) continue;
      if (SAFE_MARKER.test(line)) {
        if (SAFE_REASON.test(line)) continue;
        unreasoned++;
        console.error(
          `❌  ${relative(ROOT, file)}:${i + 1}:  exemption without a reason:  ${line.trim()}`,
        );
        continue;
      }
      console.error(`❌  ${relative(ROOT, file)}:${i + 1}:  ${line.trim()}`);
      violations++;
    }
  }
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.error(`audit-decimal: no such directory: ${SRC}`);
    console.error('usage: node scripts/audit-decimal.mjs [dir]   (default: src)');
    process.exit(2);
  }
  throw error;
}

console.log(
  `\nScanned ${tsScanned} .ts file(s) (Decimal.js importers) and ` +
    `${svelteScanned} .svelte file(s) under ${relative(ROOT, SRC) || '.'}/.`,
);

if (unreasoned > 0) {
  console.error(
    `\n${unreasoned} exemption(s) carry no reason.` +
      '\nAn `audit: safe` marker is a claim a reviewer can check, so the reason' +
      '\nis required:  // audit: safe — <what the value actually is>',
  );
}

if (violations > 0 || unreasoned > 0) {
  console.error(
    `\n${violations} violation(s) found.` +
      '\nUse Decimal.js for all financial values (price, qty, amount, balance, pnl, fee, margin).' +
      '\nIf the flagged Number() / parseFloat() is NOT a financial value (e.g. epoch-ms timestamp,' +
      '\narray index, canvas pixel coordinate, a display-only comparison), add' +
      '\n  // audit: safe — <reason>' +
      '\nto suppress it. The reason is required: it is what makes the exemption reviewable.'
  );
  process.exit(1);
} else {
  console.log('✅  No unsafe number operations found in audited files.');
}
