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
import { archifyArgs, isPinnedInstall, readPin, resolveArchify } from './archify.mjs';

const PIN = { repo: 'https://example.invalid/archify.git', version: '3.2.0', commit: 'a'.repeat(40) };

describe('archify resolver', () => {
  /** @type {string} */
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cachy-archify-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** An install that looks right by version and layout but is not a git checkout of the pin. */
  function fakeInstall(version) {
    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'bin', 'archify.mjs'), '');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
  }

  it('reads the committed pin as a full commit SHA', () => {
    const pin = readPin();
    expect(pin.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(pin.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('rejects an install whose version matches but whose commit is unproven', () => {
    fakeInstall(PIN.version);
    expect(isPinnedInstall(dir, PIN)).toBe(false);
  });

  it('refuses an ARCHIFY_DIR that is not the pinned commit instead of trusting it', () => {
    fakeInstall('2.16.0-dev.0');
    expect(() => resolveArchify(PIN, { ARCHIFY_DIR: dir })).toThrow(/not the pinned Archify/);
  });

  it('builds the validate and build invocations from one place', () => {
    expect(archifyArgs('validate')).toContain('--quality');
    expect(archifyArgs('build', '/tmp/x.html').at(-1)).toBe('/tmp/x.html');
    expect(() => archifyArgs('nonsense')).toThrow(/unknown mode/);
  });
});
