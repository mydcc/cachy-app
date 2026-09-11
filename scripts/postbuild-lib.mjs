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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The build output always lives at <repo-root>/build, regardless of the
// directory the build was invoked from, so resolve it from this module's
// location rather than the current working directory.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// adapter-node writes `build/index.js` as a standalone Polka entry that skips
// the Express wrapper (compression + security headers). This shim delegates to
// `../server.js` when executed, while still re-exporting the adapter's
// `handler` so importing the entry for that export stays side-effect free.
export const DELEGATE_SHIM = `import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { handler } from './handler.js';

export { handler };

// True when this file is the program entry point. \`node build\` passes the
// directory as argv[1] while \`node build/index.js\` passes the file, so a
// directory is resolved to its index.js before the comparison.
function isEntryPoint() {
  const arg = process.argv[1];
  if (!arg) return false;
  const resolved = path.resolve(arg);
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  const entry = stat && stat.isDirectory() ? path.join(resolved, 'index.js') : resolved;
  return import.meta.url === pathToFileURL(entry).href;
}

// Boot the Express wrapper (compression + security headers) only when executed;
// importing this module for \`handler\` must not start a second server.
if (isEntryPoint()) {
  await import('../server.js');
}
`;

/**
 * Rewrite the adapter's entry point so `node build` serves through the Express
 * wrapper. Throws when the adapter output is missing — a silent no-op would let
 * a build "succeed" without the delegation it promises.
 * @param {string} [root] repository root that contains `build/`
 * @returns {string} the patched file path
 */
export function patchBuildIndex(root = REPO_ROOT) {
  const buildIndexPath = path.join(root, 'build', 'index.js');
  if (!fs.existsSync(buildIndexPath)) {
    throw new Error(
      `postbuild: ${buildIndexPath} not found. Run this after a successful ` +
        '`vite build` (adapter-node output) produced the build/ directory.',
    );
  }
  fs.writeFileSync(buildIndexPath, DELEGATE_SHIM, 'utf-8');
  return buildIndexPath;
}
