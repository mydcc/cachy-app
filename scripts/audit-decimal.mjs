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
 * Opt-out for known-safe uses (e.g. epoch-ms timestamps, array indices):
 * append   // audit: safe   to the offending line.  The comment must include
 * a brief reason so the exemption is self-documenting and reviewable.
 *
 * Exit codes: 0 = clean, 1 = violations found.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

/**
 * Detects unsafe native-number conversion calls.
 * Anchored with \b so `.toNumber()` and `.toFixed()` are NOT matched —
 * those are Decimal → primitive conversions that are intentional and safe
 * at display / serialisation boundaries.
 */
const UNSAFE_PATTERN = /\b(Number|parseFloat)\s*\(/;

/** Lines carrying this marker are explicitly acknowledged as non-financial. */
const SAFE_MARKER = /\/\/\s*audit:\s*safe/;

/** Only files that participate in financial math need to be audited. */
const DECIMAL_IMPORT = /from\s+['"]decimal\.js['"]/;

/** Exclude test, spec and benchmark files — they may legitimately wrap values. */
const EXCLUDE_PATTERN = /\.(test|spec|bench)\.[cm]?[jt]s$/;

/**
 * Skip lines that are entirely a comment — the pattern word "Number" or
 * "parseFloat" appearing in a documentation comment is not a real call site.
 * Matches lines whose first non-whitespace token is "//" or "/*" or "*".
 */
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

/** Recursively yield every .ts file under `dir`. */
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && full.endsWith('.ts')) {
      yield full;
    }
  }
}

let violations = 0;
let filesScanned = 0;

for await (const file of walk(SRC)) {
  if (EXCLUDE_PATTERN.test(file)) continue;

  const content = await readFile(file, 'utf8');

  // Only audit files that have opted into Decimal.js — they handle financial values.
  if (!DECIMAL_IMPORT.test(content)) continue;

  filesScanned++;
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

console.log(`\nScanned ${filesScanned} financial file(s) (Decimal.js importers) under src/.`);

if (violations > 0) {
  console.error(
    `\n${violations} violation(s) found.` +
      '\nUse Decimal.js for all financial values (price, qty, amount, balance, pnl, fee, margin).' +
      '\nIf the flagged Number() / parseFloat() is NOT a financial value (e.g. epoch-ms timestamp,' +
      '\narray index, canvas pixel coordinate), add  // audit: safe — <reason>  to suppress it.'
  );
  process.exit(1);
} else {
  console.log('✅  No unsafe number operations found in financial files.');
}
