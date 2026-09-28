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
 * What this does not claim: the general shape — any reference to `Number` /
 * `parseFloat` in a value position — is a parser's job, not a regex's. The
 * one reference form common enough to name, `.map(Number)` /
 * `.map(parseFloat)`, is detected (BUG-0571); anything more exotic stays
 * invisible. If more forms keep appearing, that is the signal to stop
 * extending the pattern list.
 *
 * Opt-out for known-safe uses (e.g. epoch-ms timestamps, array indices):
 * append   // audit: safe — <reason>   to the offending line. In a component
 * the marker takes one of three comment forms, because only one of the three
 * places a call can sit accepts a line comment — see SAFE_MARKER. The reason
 * is required and enforced, not merely documented.
 *
 * Usage: node scripts/audit-decimal.mjs   (always scans src/)
 * `auditDirectory(dir)` is exported so the test suite can scan a fixture tree;
 * see the note above it for why that is not a command-line argument.
 *
 * Exit codes: 0 = clean, 1 = violations found.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;

/**
 * The scan is a plain function over a directory, and the CLI is a thin wrapper.
 *
 * The function is exported so the test suite can point it at a fixture tree
 * directly. An earlier version took a directory as a command-line argument for
 * that purpose, which put a caller-controlled string into a path expression —
 * CodeQL's `js/path-injection`, and rightly so: a build script that will read
 * any path it is handed is a worse program than one that scans `src` and
 * nothing else. Fixtures therefore live outside `src/` and the test passes a
 * literal.
 */
/**
 * Detects unsafe native-number conversion calls.
 * Anchored with \b so `.toNumber()` and `.toFixed()` are NOT matched —
 * those are Decimal → primitive conversions that are intentional and safe
 * at display / serialisation boundaries.
 *
 * The second alternative covers a conversion passed by reference
 * (`prices.map(Number)`, BUG-0571): a bare function reference is the same
 * conversion with the syntax on the other side of the identifier, and the
 * call-only form never saw it. Narrow on purpose — `.map(` with the name
 * immediately inside the parens, so `mymap(Number)` or `.map(Number2)`
 * stay out, and the general value-position shape stays a parser's job.
 */
const UNSAFE_PATTERN = /\b(?:Number|parseFloat)\s*\(|\.map\(\s*(?:Number|parseFloat)\s*\)/;

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

/**
 * Audits one directory tree.
 *
 * Returns the findings instead of printing them, so a caller (the CLI, or the
 * test suite) decides what to do with them. `exemptionsWithoutReason` is kept
 * apart from `violations` because it is a different kind of failure: the line
 * is claimed safe, and the claim is unverifiable.
 */
export async function auditDirectory(dir) {
  const findings = [];
  let unreasoned = 0;
  let tsScanned = 0;
  let svelteScanned = 0;

  for await (const file of walk(dir)) {
    if (EXCLUDE_PATTERN.test(file)) continue;

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
        findings.push({
          file: relative(ROOT, file),
          line: i + 1,
          text: line.trim(),
          kind: 'unreasoned',
        });
        continue;
      }
      findings.push({ file: relative(ROOT, file), line: i + 1, text: line.trim(), kind: 'violation' });
    }
  }

  return { findings, unreasoned, tsScanned, svelteScanned };
}

/** Renders one finding the way the CLI and the test both want to read it. */
function formatFinding({ file, line, text, kind }) {
  const label = kind === 'unreasoned' ? 'exemption without a reason:' : '';
  return `❌  ${file}:${line}:  ${label}  ${text}`.replace(/\s+/g, ' ').trim();
}

/**
 * The CLI half. Guarded so that importing `auditDirectory` has no side effect —
 * a test that imports the function must not trigger a full scan of `src/`, and
 * a module that runs work on import cannot be reasoned about from its exports.
 */
const isEntryPoint =
    process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  let result;
  try {
    result = await auditDirectory(join(ROOT, 'src'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.error('audit-decimal: src/ not found');
      process.exit(2);
    }
    throw error;
  }

  for (const finding of result.findings) console.error(formatFinding(finding));

  const violations = result.findings.filter((f) => f.kind === 'violation').length;

  console.log(
    `\nScanned ${result.tsScanned} .ts file(s) (Decimal.js importers) and ` +
      `${result.svelteScanned} .svelte file(s) under src/.`,
  );

  if (result.unreasoned > 0) {
    console.error(
      `\n${result.unreasoned} exemption(s) carry no reason.` +
        '\nAn `audit: safe` marker is a claim a reviewer can check, so the reason' +
        '\nis required:  // audit: safe — <what the value actually is>',
    );
  }

  if (violations > 0 || result.unreasoned > 0) {
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
}
