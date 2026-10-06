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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { patchBuildIndex, precompressFonts, DELEGATE_SHIM } from './postbuild-lib.mjs';

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

describe('precompressFonts', () => {
  /** @type {string} */
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cachy-postbuild-font-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns 0 when build/client directory does not exist', () => {
    expect(precompressFonts(root)).toBe(0);
  });

  it('precompresses font files under build/client with .br and .gz variants', () => {
    const fontsDir = path.join(root, 'build', 'client', 'fonts');
    fs.mkdirSync(fontsDir, { recursive: true });

    const fontPath = path.join(fontsDir, 'test-font.ttf');
    const txtPath = path.join(fontsDir, 'readme.txt');
    fs.writeFileSync(fontPath, 'fake ttf font data '.repeat(20), 'utf-8');
    fs.writeFileSync(txtPath, 'text content', 'utf-8');

    const count = precompressFonts(root);
    expect(count).toBe(1);

    expect(fs.existsSync(`${fontPath}.br`)).toBe(true);
    expect(fs.existsSync(`${fontPath}.gz`)).toBe(true);
    expect(fs.existsSync(`${txtPath}.br`)).toBe(false);
    expect(fs.existsSync(`${txtPath}.gz`)).toBe(false);
  });

  it('covers nested dirs, all extensions, and uppercase names', () => {
    const nested = path.join(root, 'build', 'client', 'fonts', 'sub');
    fs.mkdirSync(nested, { recursive: true });

    const names = ['a.ttf', 'b.WOFF', 'c.Woff2', 'd.otf', 'e.eot', 'f.OTF'];
    for (const name of names) {
      fs.writeFileSync(path.join(nested, name), `fake font data ${name} `.repeat(20), 'utf-8');
    }
    fs.writeFileSync(path.join(nested, 'notes.md'), 'not a font', 'utf-8');

    expect(precompressFonts(root)).toBe(names.length);

    for (const name of names) {
      const base = path.join(nested, name);
      expect(fs.existsSync(`${base}.br`)).toBe(true);
      expect(fs.existsSync(`${base}.gz`)).toBe(true);
    }
    expect(fs.existsSync(path.join(nested, 'notes.md.br'))).toBe(false);
  });

  it('is idempotent: a second run overwrites variants without nesting them', () => {
    const fontsDir = path.join(root, 'build', 'client', 'fonts');
    fs.mkdirSync(fontsDir, { recursive: true });

    const fontPath = path.join(fontsDir, 'roundtrip.woff2');
    fs.writeFileSync(fontPath, 'fake woff2 data '.repeat(20), 'utf-8');

    expect(precompressFonts(root)).toBe(1);
    expect(precompressFonts(root)).toBe(1);

    expect(fs.existsSync(`${fontPath}.br`)).toBe(true);
    expect(fs.existsSync(`${fontPath}.gz`)).toBe(true);
    expect(fs.existsSync(`${fontPath}.br.br`)).toBe(false);
    expect(fs.existsSync(`${fontPath}.gz.gz`)).toBe(false);
  });

  it('skips an unreadable font and still compresses the rest', () => {
    const fontsDir = path.join(root, 'build', 'client', 'fonts');
    fs.mkdirSync(fontsDir, { recursive: true });

    const badPath = path.join(fontsDir, 'broken.ttf');
    const goodPath = path.join(fontsDir, 'good.ttf');
    fs.writeFileSync(badPath, 'broken', 'utf-8');
    fs.writeFileSync(goodPath, 'good font data '.repeat(20), 'utf-8');

    const originalRead = fs.readFileSync;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...rest) => {
      if (String(p) === badPath) throw new Error('EACCES');
      return originalRead.call(fs, p, ...rest);
    });

    try {
      expect(precompressFonts(root)).toBe(1);
      expect(fs.existsSync(`${goodPath}.br`)).toBe(true);
      expect(fs.existsSync(`${goodPath}.gz`)).toBe(true);
      expect(fs.existsSync(`${badPath}.br`)).toBe(false);
      expect(warn).toHaveBeenCalled();
    } finally {
      readSpy.mockRestore();
      warn.mockRestore();
    }
  });
});
