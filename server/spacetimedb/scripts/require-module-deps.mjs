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
 * Precondition for `npm run typecheck` in this directory.
 *
 * This module is its own package with its own committed lockfile, and nothing
 * installs it as part of the repository-wide `npm ci`. Without its own
 * `node_modules`, `tsc` walks up from `src/`, finds none, and resolves
 * `spacetimedb` from the repository root — which pins the 2.x major for the
 * browser bindings. The module is written against 1.x, so the six errors that
 * follow are an artefact of the resolution, not defects in the source: the same
 * command is clean once `node_modules/spacetimedb` exists.
 *
 * A `paths` mapping cannot express this precondition. TypeScript treats `paths`
 * as substitutions to try first and falls back to standard resolution when none
 * match, so pinning the path still resolves the root's 2.x when the directory
 * is absent — verified, not assumed. Hence the explicit check.
 *
 * The point is the message, not just the exit code. Left unguarded, the
 * mis-resolution reads as six broken reducer declarations, which sends the next
 * reader looking for a bug in `index.ts` instead of at the missing install.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sdkDir = join(moduleRoot, 'node_modules', 'spacetimedb');

if (!existsSync(sdkDir)) {
  console.error(
    [
      '',
      'The dependencies of this module are not installed.',
      '',
      'Without them, `tsc` resolves `spacetimedb` from the repository root',
      '(2.x, for the browser bindings) instead of this module (1.x), and every',
      'error it reports is a symptom of that mis-resolution rather than a defect',
      'in this source.',
      '',
      '  npm ci --prefix server/spacetimedb',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
