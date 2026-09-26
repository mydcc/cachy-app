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
 * `.svelte` files are scanned too, and *unconditionally* (BUG-0534). A
 * component's `<script>` block runs the same conversions as a `.ts` file, and
 * the `.ts` selection rule — "imports decimal.js" — is precisely the blind
 * spot here: a component that converts a price with `parseFloat` instead of
 * using Decimal does not import decimal.js, so an import gate would skip
 * exactly the file the check exists to catch. The import gate is kept for
 * `.ts`, where it means what it says.
 *
 * Opt-out for known-safe uses (e.g. epoch-ms timestamps, array indices):
 * append   // audit: safe   to the offending line.  The comment must include
 * a brief reason so the exemption is self-documenting and reviewable.
 *
 * Usage: node scripts/audit-decimal.mjs [dir]   (default: src)
 * The optional directory exists so the test suite can point the script at a
 * fixture tree; a fixture under src/ would otherwise fail the real run.
 *
 * Exit codes: 0 = clean, 1 = violations found.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, process.argv[2] ?? 'src');

/**
 * Detects unsafe native-number conversion calls.
 * Anchored with \b so `.toNumber()` and `.toFixed()` are NOT matched —
 * those are Decimal → primitive conversions that are intentional and safe
 * at display / serialisation boundaries.
 */
const UNSAFE_PATTERN = /\b(Number|parseFloat)\s*\(/;

/**
 * Lines carrying this marker are explicitly acknowledged as non-financial.
 * Three comment forms, because a `.svelte` file has three places a flagged
 * call can sit and only one of them accepts a line comment:
 *
 *   <script> block        a line comment:  // audit: safe — <reason>
 *   attribute expression  a block comment inside the { } expression
 *   template text         an HTML comment directly after the { } expression
 *
 * The last two are why this accepts more than `//`: an HTML comment is not
 * valid inside a tag's attribute list, and a line comment is not a comment in
 * a template at all. Without all three, an exemption in those positions would
 * break the component instead of documenting it.
 */
const SAFE_MARKER = /(?:\/\/|\/\*|<!--)\s*audit:\s*safe/;

/** Only files that participate in financial math need to be audited. */
const DECIMAL_IMPORT = /from\s+['"]decimal\.js['"]/;

/** Exclude test, spec and benchmark files — they may legitimately wrap values. */
const EXCLUDE_PATTERN = /\.(test|spec|bench)\.[cm]?[jt]s$/;

/**
 * Skip lines that are entirely a comment — the pattern word "Number" or
 * "parseFloat" appearing in a documentation comment is not a real call site.
 * Matches lines whose first non-whitespace token is "//" or "/*" or "*", plus
 * the two markup comment forms a `.svelte` file can carry (BUG-0534).
 */
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|<!--|\{\/\*)/;

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
let tsScanned = 0;
let svelteScanned = 0;

for await (const file of walk(SRC)) {
  if (EXCLUDE_PATTERN.test(file)) continue;

  const content = await readFile(file, 'utf8');
  const isSvelte = file.endsWith('.svelte');

  // A `.ts` file is audited when it has opted into Decimal.js. A `.svelte`
  // file always is: see the note at the top of this file — the import gate
  // would skip exactly the component that converts a price natively.
  if (!isSvelte && !DECIMAL_IMPORT.test(content)) continue;

  if (isSvelte) svelteScanned++;
  else tsScanned++;

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (UNSAFE_PATTERN.test(line) && !SAFE_MARKER.test(line) && !COMMENT_LINE.test(line)) {
      const rel = relative(ROOT, file);
      console.error(`❌  ${rel}:${i + 1}:  ${line.trim()}`);
      violations++;
    }
  }
}

console.log(
  `\nScanned ${tsScanned} .ts file(s) (Decimal.js importers) and ` +
    `${svelteScanned} .svelte file(s) under ${relative(ROOT, SRC) || '.'}/.`,
);

if (violations > 0) {
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
