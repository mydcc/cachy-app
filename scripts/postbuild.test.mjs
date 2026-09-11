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
import { patchBuildIndex } from './postbuild.mjs';

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
  });
});
