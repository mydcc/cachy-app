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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { patchBuildIndex, DELEGATE_SHIM } from './postbuild-lib.mjs';

describe('patchBuildIndex', () => {
  /** @type {string} */
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cachy-postbuild-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('throws when the adapter entry point is missing instead of silently skipping', () => {
    expect(() => patchBuildIndex(root)).toThrow(/build\/index\.js not found/);
  });

  it('rewrites build/index.js to delegate to server.js and keep the handler export', () => {
    const buildDir = path.join(root, 'build');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'index.js'), '// adapter entry\n', 'utf-8');

    const target = patchBuildIndex(root);

    expect(target).toBe(path.join(buildDir, 'index.js'));
    const code = fs.readFileSync(target, 'utf-8');
    expect(code).toContain("await import('../server.js')");
    expect(code).toContain("import { handler } from './handler.js'");
    expect(code).toContain('export { handler }');
    // Must handle `node build` (argv[1] is the directory), not just the file.
    expect(code).toContain('function isEntryPoint()');
    // Symlink fix: both argv side and self side are canonicalized.
    expect(code).toContain('fs.realpathSync.native');
    expect(code).toContain('fileURLToPath');
  });

  it('resolves a symlinked entry to the same canonical file URL as the real path', () => {
    const realDir = path.join(root, 'real-build');
    fs.mkdirSync(realDir, { recursive: true });
    const realFile = path.join(realDir, 'index.js');
    fs.writeFileSync(realFile, '// adapter entry\n', 'utf-8');
    const linkDir = path.join(root, 'link-build');
    fs.symlinkSync(realDir, linkDir, 'dir');

    const viaSymlink = path.join(linkDir, 'index.js');
    const realEntry = fs.realpathSync.native(viaSymlink);
    expect(realEntry).toBe(realFile);
    expect(pathToFileURL(realEntry).href).toBe(pathToFileURL(realFile).href);
  });

  it('keeps the canonicalization logic in the generated shim', () => {
    expect(DELEGATE_SHIM).toContain('fs.realpathSync.native(entry)');
    expect(DELEGATE_SHIM).toContain('fs.realpathSync.native(self)');
    expect(DELEGATE_SHIM).toContain('fileURLToPath(import.meta.url)');
  });
});
