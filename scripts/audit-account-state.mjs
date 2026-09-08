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
 * audit-account-state.mjs
 *
 * A value and its freshness stamp only mean something together. BUG-0409 gave
 * the mode chip a stamp per half so two readings from different moments can
 * never be paired; `accountState.setPositionMode()` is what keeps the two in
 * step. A direct assignment sets the value and leaves the stamp behind, and
 * nothing fails — the display simply ages dishonestly.
 *
 * Three bugs in this class (BUG-0409, BUG-0410, BUG-0412) were fixed one at a
 * time before it was clear they shared a shape: an invariant spread across two
 * fields, held together by convention. This check makes the convention fail
 * loudly instead of silently.
 *
 * Scope and honesty about it: this is a text scan. It catches the direct form,
 * `accountState.positionMode = x`, which is how every instance so far was
 * written. It does not catch an alias (`const s = accountState; s.positionMode
 * = x`). Closing that needs the type system — open as #2759 (setter-only fields). This check
 * is the cheap guard that holds until then, not a proof.
 *
 * Opt-out: append   // audit: safe — <reason>   to the line. The reason is not
 * optional; an unexplained exemption is how a rule rots.
 *
 * Exit codes: 0 = clean, 1 = violations found.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

/**
 * Fields whose value carries a freshness stamp written by the same setter.
 * Assigning either one directly breaks the pair.
 */
const GUARDED_FIELDS = ['positionMode', 'positionModeAt'];

/**
 * Matches an assignment to a guarded field, including the logical-assignment
 * forms. `=(?!=)` excludes `==` and `===`, so comparisons stay untouched.
 */
const ASSIGNMENT = new RegExp(
  String.raw`\baccountState\.(${GUARDED_FIELDS.join('|')})\s*(\?\?|\|\||&&)?=(?!=)`,
);

/**
 * Cases the pattern must get right, checked by `--selftest` before every scan.
 *
 * A guard that silently stops matching is the exact failure it exists to
 * prevent: the scan goes green, nobody looks again, and the rule quietly
 * stops holding. These cases fail loudly if the pattern is ever broken.
 */
const SELFTEST_CASES = [
  ['accountState.positionMode = "HEDGE";', true, 'plain assignment'],
  ['accountState.positionModeAt = Date.now();', true, 'stamp assigned alone'],
  ['    accountState.positionMode = data.positionMode || undefined;', true, 'indented assignment'],
  ['accountState.positionMode ??= fallback;', true, 'logical assignment'],
  ['if (accountState.positionMode === "HEDGE") return;', false, 'strict comparison'],
  ['if (accountState.positionMode == mode) return;', false, 'loose comparison'],
  ['accountState.setPositionMode(value);', false, 'the setter, which stamps'],
  ['const m = accountState.positionMode ?? "";', false, 'read into a local'],
  ['expect(accountState.positionMode).toBe("HEDGE");', false, 'assertion'],
];

function runSelfTest() {
  let failed = 0;
  for (const [line, shouldMatch, why] of SELFTEST_CASES) {
    const matched = ASSIGNMENT.test(line);
    if (matched !== shouldMatch) {
      console.error(
        `❌  self-test: expected ${shouldMatch ? 'a match' : 'no match'} (${why})\n    ${line}`,
      );
      failed++;
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} self-test case(s) failed — the pattern no longer guards what it claims.`);
    process.exit(1);
  }
  console.log(`✅  Pattern self-test passed (${SELFTEST_CASES.length} cases).`);
}

if (process.argv.includes('--selftest')) {
  runSelfTest();
  process.exit(0);
}

/** The store owns these fields; it is the one place allowed to assign them. */
const STORE_FILE = 'src/stores/account.svelte.ts';

/** Lines carrying this marker are explicitly acknowledged. */
const SAFE_MARKER = /\/\/\s*audit:\s*safe/;

/**
 * Tests may construct states the production code cannot reach — that is their
 * job. Excluding them keeps the check about shipped behaviour. Once #2759
 * makes the fields private, the compiler will reach the tests too.
 */
const EXCLUDE_PATTERN = /\.(test|spec|bench)\.[cm]?[jt]s$/;

/** A mention inside a comment is documentation, not a call site. */
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

/** Recursively yield every source file the app ships. */
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
let filesScanned = 0;

for await (const file of walk(SRC)) {
  if (EXCLUDE_PATTERN.test(file)) continue;
  const rel = relative(ROOT, file);
  if (rel === STORE_FILE) continue;

  const content = await readFile(file, 'utf8');
  if (!content.includes('accountState')) continue;

  filesScanned++;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ASSIGNMENT.test(line) && !SAFE_MARKER.test(line) && !COMMENT_LINE.test(line)) {
      console.error(`❌  ${rel}:${i + 1}:  ${line.trim()}`);
      violations++;
    }
  }
}

console.log(`\nScanned ${filesScanned} file(s) referencing accountState under src/.`);

if (violations > 0) {
  console.error(
    `\n${violations} violation(s) found.` +
      '\nWrite the position mode through accountState.setPositionMode(), which stamps' +
      '\npositionModeAt in the same step. A direct assignment leaves the stamp behind and' +
      '\nthe mode chip then pairs or blanks halves from different moments (BUG-0409).' +
      '\nIf a line genuinely must assign directly, append  // audit: safe — <reason>.',
  );
  process.exit(1);
} else {
  console.log('✅  Every position-mode write goes through the stamping setter.');
}
