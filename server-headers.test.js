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

import { describe, it, expect, vi } from 'vitest';
import {
  SECURITY_HEADERS,
  applySecurityHeaders,
  wrapWriteHead,
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

  it('CSP connect-src does not contain unused NewRelic endpoints (FEAT-0374)', () => {
    const csp = SECURITY_HEADERS.find(([name]) => name === 'Content-Security-Policy')?.[1];
    expect(csp).not.toContain('nr-data.net');
  });

  it('CSP connect-src allows every external notification channel host (FEAT-0397)', () => {
    // Same list as src/csp.test.ts for svelte.config.js: this header is the one
    // the production Express server actually sends, and it is maintained by
    // hand alongside svelte.config.js rather than generated from one source.
    const csp = SECURITY_HEADERS.find(([name]) => name === 'Content-Security-Policy')?.[1];
    expect(csp).toContain('https://discord.com');
    expect(csp).toContain('https://api.telegram.org');
    expect(csp).toContain('https://api.mailgun.net');
  });

  it('CSP connect-src allows https provider endpoints for browser-direct AI providers (FEAT-0467)', () => {
    const csp = SECURITY_HEADERS.find(([name]) => name === 'Content-Security-Policy')?.[1];
    expect(csp).toContain("connect-src 'self' https:");
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

  it('identifies font assets under /fonts/', () => {
    expect(isImmutableAsset('build/client/fonts/Inter/Inter-VariableFont_opsz,wght.ttf')).toBe(true);
    expect(isImmutableAsset('build/client/fonts/Manrope/Manrope.woff2')).toBe(true);
  });

  it('rejects non-immutable paths', () => {
    expect(isImmutableAsset('build/client/index.html')).toBe(false);
    expect(isImmutableAsset('build/client/favicon.ico')).toBe(false);
    expect(isImmutableAsset('build/client/_app/entry/start.js')).toBe(false);
    expect(isImmutableAsset('build/client/fonts/README.txt')).toBe(false);
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

describe('static asset headers integration', () => {
  it('applies security headers and cache control for express.static setHeaders callback', () => {
    const res = mockRes();
    const staticFilePath = 'build/client/_app/immutable/entry/start.abc123.js';

    // Simulate express.static setHeaders callback behavior
    applySecurityHeaders(res);
    res.setHeader('Cache-Control', cacheControlFor(staticFilePath));

    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
    expect(res.headers.get('Content-Security-Policy')).toBeDefined();
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('applies security headers when the express middleware wraps res.writeHead', () => {
    const res = mockRes();
    const originalWriteHead = vi.fn().mockReturnValue('sentinel');
    res.writeHead = originalWriteHead;

    // Exercise the real helper used by the server.js middleware, then simulate
    // a SvelteKit / sirv handler invoking res.writeHead(200, { 'content-type': 'text/html' })
    wrapWriteHead(res);
    const returned = res.writeHead(200, { 'content-type': 'text/html' });

    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
    expect(res.headers.get('Content-Security-Policy')).toBeDefined();
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(originalWriteHead).toHaveBeenCalledWith(200, { 'content-type': 'text/html' });
    expect(returned).toBe('sentinel');
  });

  it('preserves writeHead receiver, overloads, and repeated calls', () => {
    const res = mockRes();
    let observedThis;
    res.writeHead = function (...args) {
      observedThis = this;
      return args.length;
    };

    wrapWriteHead(res);

    // 3-arg overload with status message, called with explicit receiver
    expect(res.writeHead.call(res, 200, 'OK', { 'content-type': 'text/html' })).toBe(3);
    expect(observedThis).toBe(res);
    // Repeated calls stay idempotent — headers are simply overwritten
    res.writeHead(404);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
