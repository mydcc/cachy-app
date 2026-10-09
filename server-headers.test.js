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
  overlaySecurityHeaders,
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
    getHeader(name) {
      return headers.get(name);
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

  it('preserves an existing nonce CSP (SvelteKit kit.csp.mode "auto") and still sets the other headers', () => {
    const res = mockRes();
    const nonceCsp =
      "default-src 'self'; script-src 'self' 'nonce-abc123' 'wasm-unsafe-eval' https://s.cachy.app blob:";
    res.setHeader('Content-Security-Policy', nonceCsp);
    applySecurityHeaders(res);
    expect(res.headers.get('Content-Security-Policy')).toBe(nonceCsp);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
  });

  it('still overwrites a nonce-less CSP', () => {
    const res = mockRes();
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    applySecurityHeaders(res);
    expect(res.headers.get('Content-Security-Policy')).toBe(
      SECURITY_HEADERS.find(([name]) => name === 'Content-Security-Policy')[1],
    );
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

  it('preserves a nonce CSP in an explicit object while overlaying the rest', () => {
    const nonceCsp = "script-src 'self' 'nonce-abc123'";
    const explicit = {
      'content-security-policy': nonceCsp,
      'X-Frame-Options': 'evil',
    };
    overlaySecurityHeaders(explicit);
    expect(explicit['content-security-policy']).toBe(nonceCsp);
    expect(explicit['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('preserves a nonce CSP in a flat explicit array', () => {
    const nonceCsp = "script-src 'self' 'nonce-abc123'";
    const explicit = ['Content-Security-Policy', nonceCsp, 'X-Frame-Options', 'evil'];
    overlaySecurityHeaders(explicit);
    const i = explicit.findIndex(
      (v) => String(v).toLowerCase() === 'content-security-policy',
    );
    expect(explicit[i + 1]).toBe(nonceCsp);
    expect(explicit.filter((v) => v === 'evil')).toHaveLength(0);
    // The static CSP must not be appended a second time
    expect(
      explicit.filter((v) => String(v).toLowerCase() === 'content-security-policy'),
    ).toHaveLength(1);
  });

  it('preserves a nonce CSP in an explicit array of pairs', () => {
    const nonceCsp = "script-src 'self' 'nonce-abc123'";
    const explicit = [['Content-Security-Policy', nonceCsp]];
    overlaySecurityHeaders(explicit);
    expect(explicit).toContainEqual(['Content-Security-Policy', nonceCsp]);
    expect(
      explicit.filter(([name]) => String(name).toLowerCase() === 'content-security-policy'),
    ).toHaveLength(1);
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
    expect(cacheControlFor('build/client/wasm/technicals_wasm_bg.wasm.br')).toBe(
      'public, max-age=3600, must-revalidate',
    );
    expect(cacheControlFor('build/client/wasm/technicals_wasm.js')).toBe(
      'public, max-age=3600, must-revalidate',
    );
    expect(cacheControlFor('build/client/ammo/ammo.wasm.wasm')).toBe(
      'public, max-age=3600, must-revalidate',
    );
    expect(cacheControlFor('build/client/ammo/ammo.wasm.js.gz')).toBe(
      'public, max-age=3600, must-revalidate',
    );
    // The uncompressed name stays covered too: a variant-specific assertion
    // that replaces its sibling drops the case that has no suffix at all.
    expect(cacheControlFor('build/client/ammo/ammo.wasm.js')).toBe(
      'public, max-age=3600, must-revalidate',
    );
  });

  // A precompressed asset is the same resource as its uncompressed name, so
  // both must resolve to one policy. Normalizing only inside
  // isVersionedBinary() left hashed binaries and fonts losing `immutable` and
  // dropping to a short window or no-cache whenever a .br sibling existed.
  it('gives a compression variant the same cache policy as its original', () => {
    for (const asset of [
      'build/client/_app/immutable/foo.abc123.js',
      'build/client/fonts/Inter/Inter-VariableFont_opsz,wght.woff2',
      'build/client/fonts/Inter/Inter-VariableFont_opsz,wght.ttf',
      'build/client/wasm/technicals_wasm_bg.abc12345.wasm',
    ]) {
      const expected = cacheControlFor(asset);
      expect(cacheControlFor(`${asset}.br`), `${asset}.br`).toBe(expected);
      expect(cacheControlFor(`${asset}.gz`), `${asset}.gz`).toBe(expected);
    }
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

describe('wrapWriteHead', () => {
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
    // The explicit headers object is passed through by reference, with the
    // security headers overlaid (Node would otherwise prefer it over setHeader).
    expect(originalWriteHead).toHaveBeenCalledWith(200, {
      'content-type': 'text/html',
      ...Object.fromEntries(SECURITY_HEADERS),
    });
    expect(returned).toBe('sentinel');
  });

  it('preserves writeHead receiver, overloads, and repeated calls', () => {
    const res = mockRes();
    res.writeHead = function (...args) {
      // No `this` aliasing: return the receiver directly for the 0-arg probe.
      return args.length === 0 ? this : args.length;
    };

    wrapWriteHead(res);

    // Receiver is preserved through the wrapper
    expect(res.writeHead.call(res)).toBe(res);
    // 3-arg overload with status message passes all args through
    expect(res.writeHead(200, 'OK', { 'content-type': 'text/html' })).toBe(3);
    // Repeated calls stay idempotent — headers are simply overwritten
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('keeps the adapter-node nonce CSP end to end (blank-app regression)', () => {
    const res = mockRes();
    const originalWriteHead = vi.fn();
    res.writeHead = originalWriteHead;
    wrapWriteHead(res);

    // adapter-node path: res.writeHead(code, headers) with SvelteKit's
    // per-request nonce CSP in the explicit headers object. Node prefers the
    // explicit object over setHeader, so the nonce policy must survive there.
    const nonceCsp = "script-src 'self' 'nonce-abc123'";
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Security-Policy': nonceCsp,
    });

    expect(originalWriteHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/html',
      'Content-Security-Policy': nonceCsp,
      ...Object.fromEntries(
        SECURITY_HEADERS.filter(([name]) => name !== 'Content-Security-Policy'),
      ),
    });
  });

  // Regression: res.writeHead(code, headers) is the only place explicit headers
  // reach the wire, and Node accepts a plain object or an array there — not a
  // Web API Headers instance. Headers stores its entries internally and exposes
  // no own enumerable properties, so Node's own enumeration finds nothing and
  // silently drops every header the caller put in it. Verified against the Node
  // version this project pins: response carries neither content-type nor the
  // caller's own headers. The wrapper must normalize the shape first.
  it('normalizes a Web API Headers argument into a Node header object', () => {
    const res = mockRes();
    const originalWriteHead = vi.fn();
    res.writeHead = originalWriteHead;
    wrapWriteHead(res);

    res.writeHead(200, new Headers({ 'content-type': 'text/html', 'x-custom': 'a' }));

    const passed = originalWriteHead.mock.calls[0][1];
    expect(passed).not.toBeInstanceOf(Headers);
    expect(passed['content-type']).toBe('text/html');
    expect(passed['x-custom']).toBe('a');
    for (const [name, value] of SECURITY_HEADERS) {
      const key = Object.keys(passed).find((k) => k.toLowerCase() === name.toLowerCase());
      expect(key, `${name} must survive normalization`).toBeDefined();
      expect(passed[key]).toBe(value);
    }
  });

  it('keeps a nonce CSP that arrives as a Web API Headers object', () => {
    const res = mockRes();
    const originalWriteHead = vi.fn();
    res.writeHead = originalWriteHead;
    wrapWriteHead(res);

    const nonceCsp = "default-src 'self'; script-src 'self' 'nonce-xyz789'";
    res.writeHead(200, new Headers({ 'content-security-policy': nonceCsp }));

    const passed = originalWriteHead.mock.calls[0][1];
    expect(passed['content-security-policy']).toBe(nonceCsp);
    // overlaid names keep the canonical SECURITY_HEADERS spelling; HTTP header
    // names are case-insensitive, so look them up that way.
    const xcto = Object.keys(passed).find((k) => k.toLowerCase() === 'x-content-type-options');
    expect(xcto).toBeDefined();
    expect(passed[xcto]).toBe('nosniff');
    // The static CSP is not appended a second time.
    expect(
      Object.keys(passed).filter((k) => k.toLowerCase() === 'content-security-policy'),
    ).toHaveLength(1);
  });

  it('normalizes a Headers argument without disturbing the other writeHead overloads', () => {
    const res = mockRes();
    const originalWriteHead = vi.fn();
    res.writeHead = originalWriteHead;
    wrapWriteHead(res);

    // 3-arg overload: status message sits between the code and the headers.
    res.writeHead(200, 'OK', new Headers({ 'content-type': 'text/html' }));

    const call = originalWriteHead.mock.calls[0];
    expect(call[0]).toBe(200);
    expect(call[1]).toBe('OK');
    expect(call[2]['content-type']).toBe('text/html');
    expect(call[2]['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('normalizes duck-typed Headers objects from cross-realm or custom environments', () => {
    const res = mockRes();
    const originalWriteHead = vi.fn();
    res.writeHead = originalWriteHead;
    wrapWriteHead(res);

    const map = new Map([['content-type', 'text/html'], ['x-duck', 'quack']]);
    const duckHeaders = {
      set(k, v) { map.set(k.toLowerCase(), v); },
      get(k) { return map.get(k.toLowerCase()); },
      has(k) { return map.has(k.toLowerCase()); },
      forEach(cb) { map.forEach((v, k) => cb(v, k, this)); },
    };

    res.writeHead(200, duckHeaders);

    const passed = originalWriteHead.mock.calls[0][1];
    expect(passed).not.toBeInstanceOf(Headers);
    expect(passed['content-type']).toBe('text/html');
    expect(passed['x-duck']).toBe('quack');
    expect(passed['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains; preload');
    expect(passed['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('overlaySecurityHeaders mutates duck-typed Headers objects correctly', () => {
    const map = new Map([['x-custom', 'val']]);
    const duckHeaders = {
      set(k, v) { map.set(k, v); },
      get(k) { return map.get(k); },
      has(k) { return map.has(k); },
      forEach(cb) { map.forEach((v, k) => cb(v, k, this)); },
    };

    overlaySecurityHeaders(duckHeaders);

    expect(map.get('x-custom')).toBe('val');
    expect(map.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains; preload');
    expect(map.get('X-Content-Type-Options')).toBe('nosniff');
    expect(map.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(map.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('normalizes a foreign-realm-shaped Headers (instanceof-false, native methods, tag)', () => {
    // The observable shape of a genuine cross-realm Headers: `instanceof`
    // fails here, the tag reads "[object Headers]", and the four methods are
    // the native ones (case-insensitive, (value, name) arity). Delegation to
    // a real backing instance reproduces exactly what the code touches —
    // a second VM realm would only differ in a constructor identity the code
    // never reads (a bare `node:vm` context has no Headers global at all).
    const backing = new Headers([['content-type', 'text/html']]);
    const foreign = {
      [Symbol.toStringTag]: 'Headers',
      set: (k, v) => backing.set(k, v),
      get: (k) => backing.get(k),
      has: (k) => backing.has(k),
      forEach: (cb, thisArg) => backing.forEach(cb, thisArg),
    };
    expect(foreign instanceof Headers).toBe(false);
    expect(Object.prototype.toString.call(foreign)).toBe('[object Headers]');

    const res = mockRes();
    const originalWriteHead = vi.fn();
    res.writeHead = originalWriteHead;
    wrapWriteHead(res);

    res.writeHead(200, foreign);

    const passed = originalWriteHead.mock.calls[0][1];
    expect(passed).not.toBeInstanceOf(Headers);
    expect(passed['content-type']).toBe('text/html');
    expect(passed['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains; preload');
    expect(passed['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('preserves a nonce-carrying CSP on the duck-typed path', () => {
    const noncePolicy = "script-src 'self' 'nonce-abc123'";
    const map = new Map([['content-security-policy', noncePolicy]]);
    const duckHeaders = {
      set(k, v) { map.set(k.toLowerCase(), v); },
      get(k) { return map.get(k.toLowerCase()) ?? null; },
      has(k) { return map.has(k.toLowerCase()); },
      forEach(cb) { map.forEach((v, k) => cb(v, k, this)); },
    };

    overlaySecurityHeaders(duckHeaders);

    // Overwriting this would strip the nonces and leave a blank app.
    expect(map.get('content-security-policy')).toBe(noncePolicy);
    expect(map.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains; preload');
  });

  it('does not treat a tag-only object as Headers (no methods, no throw)', () => {
    // A bare `[object Headers]` tag without the four methods takes the
    // plain-object path, exactly as before the duck-typing support.
    const spoofed = {
      [Symbol.toStringTag]: 'Headers',
      'x-custom': 'val',
    };
    expect(Object.prototype.toString.call(spoofed)).toBe('[object Headers]');

    expect(() => overlaySecurityHeaders(spoofed)).not.toThrow();
    expect(spoofed['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains; preload');
  });

  it('throws instead of silently dropping headers when set() is a no-op', () => {
    const frozen = {
      set() {},
      get() { return null; },
      has() { return false; },
      forEach() {},
    };

    // Fail closed: a silent no-op would leave the response without security
    // headers and no error. The throw names the broken contract.
    expect(() => overlaySecurityHeaders(frozen)).toThrow(/did not retain the security overlay/);
  });
});
