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

import { describe, it, expect } from 'vitest';
import {
  SECURITY_HEADERS,
  applySecurityHeaders,
  isImmutableAsset,
  cacheControlFor,
} from './server-headers.js';

function mockRes() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) {
      headers.set(name, value);
    },
  };
}

describe('SECURITY_HEADERS', () => {
  it('contains the full non-negotiable security header set', () => {
    const names = SECURITY_HEADERS.map(([name]) => name);
    expect(names).toContain('Strict-Transport-Security');
    expect(names).toContain('Content-Security-Policy');
    expect(names).toContain('X-Content-Type-Options');
    expect(names).toContain('X-Frame-Options');
    expect(names).toContain('Referrer-Policy');
    expect(names).toContain('Cross-Origin-Opener-Policy');
    expect(names).toContain('Permissions-Policy');
  });

  it('never sets Cross-Origin-Embedder-Policy (breaks embedded iframes)', () => {
    const names = SECURITY_HEADERS.map(([name]) => name);
    expect(names).not.toContain('Cross-Origin-Embedder-Policy');
  });

  it('CSP frame-src allows the metaverse and embedded iframe origins', () => {
    const csp = SECURITY_HEADERS.find(([name]) => name === 'Content-Security-Policy')?.[1];
    expect(csp).toContain(
      "frame-src 'self' https://space.cachy.app https://s.cachy.app https: blob: data:",
    );
  });

  it('Permissions-Policy delegates 3D metaverse permissions instead of blocking them', () => {
    const pp = SECURITY_HEADERS.find(([name]) => name === 'Permissions-Policy')?.[1];
    expect(pp).toContain('camera=(self "https://space.cachy.app")');
    expect(pp).toContain('xr-spatial-tracking');
    expect(pp).not.toContain('camera=()');
    expect(pp).not.toContain('geolocation=()');
  });
});

describe('applySecurityHeaders', () => {
  it('sets every header from SECURITY_HEADERS on the response', () => {
    const res = mockRes();
    applySecurityHeaders(res);
    for (const [name, value] of SECURITY_HEADERS) {
      expect(res.headers.get(name)).toBe(value);
    }
  });
});

describe('isImmutableAsset', () => {
  it('identifies fingerprinted SvelteKit assets under /_app/immutable/', () => {
    expect(isImmutableAsset('build/client/_app/immutable/entry/start.abc123.js')).toBe(true);
    expect(isImmutableAsset('build/client/_app/immutable/abc123.css')).toBe(true);
    expect(isImmutableAsset('build/client/_app/immutable/')).toBe(true);
  });

  it('rejects non-immutable paths', () => {
    expect(isImmutableAsset('build/client/index.html')).toBe(false);
    expect(isImmutableAsset('build/client/favicon.ico')).toBe(false);
    expect(isImmutableAsset('build/client/_app/entry/start.js')).toBe(false);
  });

  it('does not confuse the immutable-2 dir with the immutable dir', () => {
    expect(isImmutableAsset('build/client/_app/immutable-2/foo.js')).toBe(false);
  });
});

describe('cacheControlFor', () => {
  it('caches immutable assets for a year', () => {
    expect(cacheControlFor('build/client/_app/immutable/foo.abc123.js')).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('forces revalidation for everything else', () => {
    expect(cacheControlFor('build/client/index.html')).toBe('no-cache');
    expect(cacheControlFor('build/client/favicon.ico')).toBe('no-cache');
  });
});
