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
import zlib from 'node:zlib';
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
import { pathToFileURL, fileURLToPath } from 'node:url';
import { handler } from './handler.js';

export { handler };

// True when this file is the program entry point. \`node build\` passes the
// directory as argv[1] while \`node build/index.js\` passes the file, so a
// directory is resolved to its index.js before the comparison.
// Both sides are canonicalized with fs.realpathSync.native so symlinked
// hosting paths (e.g. aaPanel /www/wwwroot/cachy.app -> vhost dir) match,
// including under --preserve-symlinks where import.meta.url keeps the symlink.
function isEntryPoint() {
  const arg = process.argv[1];
  if (!arg) return false;
  const resolved = path.resolve(arg);
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  const entry = stat && stat.isDirectory() ? path.join(resolved, 'index.js') : resolved;
  let realEntry = entry;
  try {
    realEntry = fs.realpathSync.native(entry);
  } catch {
    // Keep resolved entry if realpath fails
  }
  let self = fileURLToPath(import.meta.url);
  try {
    self = fs.realpathSync.native(self);
  } catch {
    // Keep unresolved self if realpath fails
  }
  return pathToFileURL(self).href === pathToFileURL(realEntry).href;
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

const FONT_EXTENSION = /\.(ttf|woff2?|otf|eot)$/i;

// Quality 8 instead of BROTLI_MAX_QUALITY (11): q11 costs ~10x CPU for ~2-5%
// smaller output on fonts, and .woff2 inputs are already Brotli-compressed
// internally so recompressing them gains almost nothing either way. q8 keeps
// postbuild fast while staying within a few percent of max compression.
const BROTLI_QUALITY = 8;

/**
 * Precompress font files under build/client with Brotli and Gzip because
 * adapter-node omits font extensions from default precompression.
 * @param {string} [root] repository root that contains `build/`
 * @returns {number} number of font files precompressed
 */
export function precompressFonts(root = REPO_ROOT) {
  const clientDir = path.join(root, 'build', 'client');
  if (!fs.existsSync(clientDir)) {
    return 0;
  }

  let count = 0;

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && FONT_EXTENSION.test(entry.name)) {
        // One unreadable/corrupt font (or a full disk on one variant write)
        // must not abort the whole deploy: warn per file and continue.
        try {
          const data = fs.readFileSync(fullPath);

          const brData = zlib.brotliCompressSync(data, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
          });
          fs.writeFileSync(`${fullPath}.br`, brData);

          const gzData = zlib.gzipSync(data, { level: zlib.constants.Z_BEST_COMPRESSION });
          fs.writeFileSync(`${fullPath}.gz`, gzData);

          count += 1;
        } catch (err) {
          console.warn(`postbuild: skipping font ${fullPath}: ${err.message}`);
        }
      }
    }
  }

  walk(clientDir);
  return count;
}
