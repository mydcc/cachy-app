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
  overlaySecurityHeaders,
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

describe('overlaySecurityHeaders', () => {
  it('overlays security headers onto an explicit object, preserving other headers', () => {
    const explicit = {
      'X-Content-Type-Options': 'evil',
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    };
    overlaySecurityHeaders(explicit);
    expect(explicit['X-Content-Type-Options']).toBe('nosniff');
    expect(explicit['Content-Type']).toBe('text/html');
    expect(explicit['Cache-Control']).toBe('public, max-age=3600, must-revalidate');
    for (const [name, value] of SECURITY_HEADERS) {
      const key = Object.keys(explicit).find((k) => k.toLowerCase() === name.toLowerCase());
      expect(explicit[key]).toBe(value);
    }
  });

  it('overlays security headers onto a flat explicit array', () => {
    const explicit = ['X-Frame-Options', 'evil', 'Content-Type', 'text/html'];
    overlaySecurityHeaders(explicit);
    expect(explicit.filter((v) => v === 'evil')).toHaveLength(0);
    expect(explicit).toContain('Content-Type');
    for (const [name, value] of SECURITY_HEADERS) {
      const i = explicit.findIndex((v) => String(v).toLowerCase() === name.toLowerCase());
      expect(explicit[i + 1]).toBe(value);
    }
  });

  it('overlays security headers onto an explicit array of pairs without corrupting it', () => {
    const explicit = [
      ['X-Content-Type-Options', 'evil'],
      ['Content-Type', 'text/html'],
    ];
    overlaySecurityHeaders(explicit);
    expect(explicit.every((entry) => Array.isArray(entry))).toBe(true);
    const overridden = explicit.filter(
      ([name]) => name.toLowerCase() === 'x-content-type-options',
    );
    expect(overridden).toHaveLength(1);
    expect(overridden[0][1]).toBe('nosniff');
    expect(explicit).toContainEqual(['Content-Type', 'text/html']);
    for (const [name, value] of SECURITY_HEADERS) {
      expect(explicit).toContainEqual([name, value]);
    }
  });

  it('ignores missing or non-object headers arguments', () => {
    expect(() => overlaySecurityHeaders(undefined)).not.toThrow();
    expect(() => overlaySecurityHeaders(null)).not.toThrow();
    expect(() => overlaySecurityHeaders(200)).not.toThrow();
    expect(() => overlaySecurityHeaders('OK')).not.toThrow();
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

  it('treats hashed WASM and Ammo filenames as immutable, stable names as not', () => {
    expect(isImmutableAsset('build/client/wasm/technicals_wasm.a1b2c3d4.wasm')).toBe(true);
    expect(isImmutableAsset('build/client/ammo/ammo.BEEF1234.js')).toBe(true);
    // Stable filenames are rebuilt in place — never immutable (stale-indicator risk).
    expect(isImmutableAsset('build/client/wasm/technicals_wasm_bg.wasm')).toBe(false);
    expect(isImmutableAsset('build/client/wasm/technicals_wasm.js')).toBe(false);
    expect(isImmutableAsset('build/client/ammo/ammo.wasm.wasm')).toBe(false);
    expect(isImmutableAsset('build/client/ammo/ammo.wasm.js')).toBe(false);
    // Non-binary sidecars under /wasm/ stay revalidating.
    expect(isImmutableAsset('build/client/wasm/technicals_wasm.d.ts')).toBe(false);
    expect(isImmutableAsset('build/client/wasm/README.txt')).toBe(false);
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

  it('gives versioned WASM/Ammo binaries a bounded cache window with revalidation', () => {
    expect(cacheControlFor('build/client/wasm/technicals_wasm_bg.wasm')).toBe(
      'public, max-age=3600, must-revalidate',
    );
    expect(cacheControlFor('build/client/wasm/technicals_wasm.js')).toBe(
      'public, max-age=3600, must-revalidate',
    );
    expect(cacheControlFor('build/client/ammo/ammo.wasm.wasm')).toBe(
      'public, max-age=3600, must-revalidate',
    );
    expect(cacheControlFor('build/client/ammo/ammo.wasm.js')).toBe(
      'public, max-age=3600, must-revalidate',
    );
  });

  it('forces revalidation for WASM sidecar files', () => {
    expect(cacheControlFor('build/client/wasm/technicals_wasm.d.ts')).toBe('no-cache');
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
});
