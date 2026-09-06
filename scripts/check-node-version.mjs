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
 * Fails unless `.node-version` pins an exact Node.js version that satisfies
 * the `engines.node` range in `package.json`.
 *
 *   node scripts/check-node-version.mjs
 *
 * Why this exists: the pin silently drifted back to Node 20.18.3 twice via
 * sandbox sessions replaying stale files, while `engines` requires
 * `>=22.19.0` (undici 8 fails to import on Node 20 and trips the safeFetch
 * fail-closed guard). A floating pin (`22`, `lts/*`) would not catch that
 * either — the pin must be exact, and it must satisfy `engines`.
 *
 * The repository root is derived from this file's own location, never from
 * arguments or environment: there is no user-controlled input reaching any
 * path operation below.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const fail = (msg) => {
  console.error(`❌ node-version check: ${msg}`);
  process.exit(1);
};

let pinRaw;
try {
  pinRaw = readFileSync(join(root, '.node-version'), 'utf8').trim();
} catch {
  fail('cannot read .node-version');
}
if (!/^\d+\.\d+\.\d+$/.test(pinRaw)) {
  fail(`.node-version must pin an exact version like "26.8.1", got ${JSON.stringify(pinRaw)}`);
}
const pin = pinRaw.split('.').map(Number);

let engines;
try {
  engines = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).engines?.node;
} catch {
  fail('cannot read engines.node from package.json');
}
if (!engines) fail('package.json has no engines.node field to check against');

const cmp = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

// Minimal comparator evaluator: >=, <=, >, <, = (or bare), ^, ~, with full
// or partial versions, *-branches, and space-separated AND within || branches.
// Partial versions follow npm expansion: ">22" means ">=23.0.0",
// "<=22.1" means "<22.2.0", and a bare "22" matches any 22.x.
const satisfies = (range) =>
  range
    .split('||')
    .map((branch) => branch.trim())
    .some((branch) =>
      branch
        .split(/\s+/)
        .filter((token) => token !== '*' && token.toLowerCase() !== 'x')
        .every((token) => {
          const m = token.match(/^(>=|<=|>|<|=|==|\^|~)?v?(\d+)(?:\.(\d+|x))?(?:\.(\d+|x))?$/i);
          if (!m) fail(`unsupported engines comparator ${JSON.stringify(token)}`);
          const [, opRaw, majorRaw, minorRaw, patchRaw] = m;
          const op = opRaw === '==' ? '=' : opRaw || '=';
          const major = Number(majorRaw);
          const minor = minorRaw === undefined || minorRaw.toLowerCase() === 'x' ? null : Number(minorRaw);
          const patch = patchRaw === undefined || patchRaw.toLowerCase() === 'x' ? null : Number(patchRaw);

          if (op === '^') {
            return cmp(pin, [major, minor ?? 0, patch ?? 0]) >= 0 && pin[0] === major;
          }
          if (op === '~') {
            return (
              cmp(pin, [major, minor ?? 0, patch ?? 0]) >= 0 &&
              pin[0] === major &&
              (minor === null || pin[1] === minor)
            );
          }
          if (minor === null) {
            // Bare major: "=" matches any x.y.z on that major; inequalities
            // expand to the next major ("<22" → pin major < 22, ">22" → > 22).
            if (op === '=') return pin[0] === major;
            if (op === '>=') return pin[0] >= major;
            if (op === '<') return pin[0] < major;
            if (op === '<=') return pin[0] <= major;
            return pin[0] > major; // ">"
          }
          if (patch === null) {
            // Bare major.minor: "=" matches any patch; ">" / "<=" roll over
            // to the next minor (">22.1" → ">=22.2.0").
            if (op === '=') return pin[0] === major && pin[1] === minor;
            const next = [major, minor + 1, 0];
            const base = [major, minor, 0];
            if (op === '>=') return cmp(pin, base) >= 0;
            if (op === '>') return cmp(pin, next) >= 0;
            if (op === '<') return cmp(pin, base) < 0;
            return cmp(pin, next) < 0; // "<="
          }
          const base = [major, minor, patch];
          const order = cmp(pin, base);
          switch (op) {
            case '>=':
              return order >= 0;
            case '<=':
              return order <= 0;
            case '>':
              return order > 0;
            case '<':
              return order < 0;
            default:
              return order === 0;
          }
        }),
    );

if (!satisfies(engines)) {
  fail(`.node-version pins ${pinRaw} but package.json engines requires "${engines}" — raise the pin, never lower engines`);
}

console.log(`✅ .node-version pins ${pinRaw}, satisfying engines "${engines}".`);
