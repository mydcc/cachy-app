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
import path from "node:path";

// Single source of truth for the security and cache headers that the
// production Express server applies. Kept as plain (name, value) tuples so
// both the request middleware and the express.static setHeaders hook set
// identical values without drifting.
/** @type {[string, string][]} */
export const SECURITY_HEADERS = [
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload"],
  ["Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://s.cachy.app blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: https://s.cachy.app; media-src 'self' blob: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-src 'self' https://space.cachy.app https://s.cachy.app https: blob: data:; frame-ancestors 'self'; connect-src 'self' https: https://s.cachy.app https://chat.cachy.app wss://chat.cachy.app https://*.cachy.app wss://*.cachy.app wss://fapi.bitunix.com wss://stream.bitunix.com wss://ws.bitget.com https://api.imgbb.com https://discord.com https://api.telegram.org https://api.mailgun.net https://generativelanguage.googleapis.com https://api.openai.com"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "SAMEORIGIN"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
  // DO NOT add Cross-Origin-Embedder-Policy (COEP). COEP breaks embedded channel iframes (e.g. space.cachy.app Unity Metaverse) and external news modals.
  // DO NOT restrict camera, microphone, xr-spatial-tracking, or geolocation to () as it breaks 3D space.cachy.app metaverse and external iframe modals.
  ["Permissions-Policy", "camera=(self \"https://space.cachy.app\"), microphone=(self \"https://space.cachy.app\"), xr-spatial-tracking=(self \"https://space.cachy.app\" *), display-capture=(self \"https://space.cachy.app\"), fullscreen=*, autoplay=*, accelerometer=*, gyroscope=*, clipboard-write=*, encrypted-media=*, picture-in-picture=*, web-share=*, geolocation=*"],
];

/**
 * SvelteKit (kit.csp.mode "auto") emits a per-request Content-Security-Policy
 * carrying `nonce-…` tokens that match the inline scripts in the served HTML
 * (app.html helpers, theme init, SvelteKit bootstrap). That policy is
 * complete — generated from the directives in vite.config.ts — so wherever
 * it is present it must win: overwriting it with the static policy below
 * strips the nonces, the browser blocks every inline script including
 * kit.start(), and the app stays blank (SSR is disabled, so nothing renders
 * without the client bootstrap).
 *
 * Exported because the nonce question is not local to the Express server:
 * src/hooks.server.ts needs the identical answer, and keeping two copies of
 * "does this policy carry a nonce" is how one side later tightens its check
 * while the other silently keeps the looser one.
 * @param {unknown} value a header value in any Node shape
 * @returns {boolean}
 */
export function cspHasNonce(value) {
  if (typeof value === "string") return value.includes("nonce-");
  if (Array.isArray(value)) return value.some((entry) => cspHasNonce(entry));
  return false;
}

/**
 * Check if the given value is a Web API Headers instance or a duck-typed
 * Headers object (e.g. across VM contexts or custom implementations).
 *
 * Capability, not pedigree: the tag alone (`Symbol.toStringTag` or
 * `Object.prototype.toString`) proves nothing, and calling `.set`/`.forEach`
 * on a tag-only object would throw where the old code took the safe
 * plain-object path. All four methods must exist.
 *
 * Duck-typed implementations must honor the Headers contract: `get`/`has`/
 * `set` are case-insensitive on names, and `get` returns nullish (never
 * throws) for absent names. `overlaySecurityHeaders` additionally requires a
 * working `set` — it verifies one header took effect and throws otherwise
 * rather than silently dropping the security overlay.
 * @param {unknown} headers
 * @returns {boolean}
 */
function isHeadersInstance(headers) {
  if (typeof headers !== "object" || headers === null) return false;
  if (typeof Headers !== "undefined" && headers instanceof Headers) return true;
  const h = /** @type {Record<string, unknown>} */ (headers);
  return (
    typeof h.set === "function" &&
    typeof h.get === "function" &&
    typeof h.has === "function" &&
    typeof h.forEach === "function"
  );
}

/**
 * res.writeHead() is the only place explicit headers reach the wire, and Node
 * accepts a plain object or an array there — not a Web API Headers instance.
 * Headers keeps its entries in an internal slot and exposes no own enumerable
 * properties, so Node's enumeration of the argument finds nothing and silently
 * drops every header the caller put in it, security headers included.
 * Verified against the pinned Node version: the response carries neither the
 * caller's own headers nor anything applySecurityHeaders() had staged.
 * Normalizing to a plain object here is what makes the overlay meaningful.
 * @param {unknown} headers the headers argument of a writeHead() call
 * @returns {Record<string, string | string[]> | null} null when the argument is neither a Headers instance nor a duck-typed equivalent (see isHeadersInstance)
 */
function toNodeHeaders(headers) {
  if (!isHeadersInstance(headers)) {
    return null;
  }
  /** @type {Record<string, string | string[]>} */
  const normalized = {};
  /** @type {Headers} */ (headers).forEach((value, name) => {
    // Headers folds repeated names (Set-Cookie) into separate entries with the
    // same key; Node wants a string[] there, so collect instead of overwrite.
    const existing = normalized[name];
    if (existing === undefined) {
      normalized[name] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      normalized[name] = [existing, value];
    }
  });
  return normalized;
}

/**
 * @param {{ setHeader: (name: string, value: string) => unknown, getHeader?: (name: string) => unknown }} res
 */
export function applySecurityHeaders(res) {
  for (const [name, value] of SECURITY_HEADERS) {
    if (
      name === "Content-Security-Policy" &&
      typeof res.getHeader === "function" &&
      cspHasNonce(res.getHeader("Content-Security-Policy"))
    ) {
      continue;
    }
    res.setHeader(name, value);
  }
}

/**
 * Overlay SECURITY_HEADERS onto headers passed explicitly to res.writeHead().
 * Node lets explicit writeHead() headers win over earlier setHeader() calls,
 * so without this a caller passing its own headers could silently drop our
 * security headers. Cache-Control is not part of SECURITY_HEADERS, so
 * per-asset cache policies survive untouched.
 * Handles every Node header shape: plain objects, flat arrays
 * ([name, value, ...]) and arrays of pairs ([[name, value], ...]) — plus
 * Web API Headers instances and duck-typed equivalents (cross-realm or
 * custom, see isHeadersInstance), which are mutated in place via `.set()`.
 * Array-form headers are mutated in place, preserving their shape.
 * Exception: a Content-Security-Policy that already carries `nonce-…` tokens
 * (SvelteKit's per-request policy, see cspHasNonce) is left untouched —
 * overwriting it would strip the nonces and break the inline bootstrap
 * scripts, leaving a blank app.
 * @param {unknown} explicit the headers argument of the writeHead() call, if any
 */
export function overlaySecurityHeaders(explicit) {
  if (explicit === null || typeof explicit !== "object") {
    return;
  }
  if (isHeadersInstance(explicit)) {
    const headers = /** @type {Headers} */ (explicit);
    for (const [name, value] of SECURITY_HEADERS) {
      // No `.has()` probe: `get()` returns nullish for absent names (part of
      // the duck contract above), and `cspHasNonce` already reads that as
      // "no nonce, overwrite".
      if (
        name === "Content-Security-Policy" &&
        cspHasNonce(headers.get("Content-Security-Policy"))
      ) {
        continue;
      }
      headers.set(name, value);
    }
    // Fail closed, not open: a `set()` that silently drops (frozen or stub
    // implementation) would leave the response without security headers and
    // no error. HSTS is always set above (no nonce carve-out applies to it),
    // so its absence proves the overlay did not take effect.
    if (
      !String(headers.get("Strict-Transport-Security") ?? "").includes("max-age")
    ) {
      throw new TypeError(
        "overlaySecurityHeaders: Headers-like object did not retain the security overlay (set() is a no-op?)",
      );
    }
    return;
  }
  if (Array.isArray(explicit)) {
    const names = new Set(SECURITY_HEADERS.map(([name]) => name.toLowerCase()));
    if (explicit.length > 0 && explicit.every((entry) => Array.isArray(entry))) {
      const keepCsp = explicit.some(
        ([name, value]) =>
          String(name).toLowerCase() === "content-security-policy" &&
          cspHasNonce(value),
      );
      if (keepCsp) names.delete("content-security-policy");
      for (let i = explicit.length - 1; i >= 0; i -= 1) {
        if (names.has(String(explicit[i][0]).toLowerCase())) {
          explicit.splice(i, 1);
        }
      }
      for (const [name, value] of SECURITY_HEADERS) {
        if (!names.has(name.toLowerCase())) continue;
        explicit.push([name, value]);
      }
    } else {
      let keepCsp = false;
      for (let i = 0; i < explicit.length - 1; i += 2) {
        if (
          String(explicit[i]).toLowerCase() === "content-security-policy" &&
          cspHasNonce(explicit[i + 1])
        ) {
          keepCsp = true;
          break;
        }
      }
      if (keepCsp) names.delete("content-security-policy");
      for (let i = explicit.length - 2; i >= 0; i -= 2) {
        if (names.has(String(explicit[i]).toLowerCase())) {
          explicit.splice(i, 2);
        }
      }
      for (const [name, value] of SECURITY_HEADERS) {
        if (!names.has(name.toLowerCase())) continue;
        explicit.push(name, value);
      }
    }
    return;
  }
  const headers = /** @type {Record<string, string>} */ (explicit);
  for (const [name, value] of SECURITY_HEADERS) {
    const existing = Object.keys(headers).find(
      (key) => key.toLowerCase() === name.toLowerCase(),
    );
    if (
      name === "Content-Security-Policy" &&
      existing !== undefined &&
      cspHasNonce(headers[existing])
    ) {
      continue;
    }
    headers[existing ?? name] = value;
  }
}

/**
 * Wrap res.writeHead so security headers are applied right before the head
 * is flushed. SvelteKit's adapter-node handler and sirv can bypass Express
 * middleware by calling res.writeHead() directly (SPA fallback / SSR-off
 * HTML routes); the wrapper guarantees applySecurityHeaders(res) still runs.
 * Headers passed explicitly to writeHead() are overlaid via
 * overlaySecurityHeaders(), since Node lets them win over earlier
 * setHeader() calls — Cache-Control is untouched, so per-asset cache
 * policies survive. A Content-Security-Policy carrying `nonce-…` tokens
 * (SvelteKit's per-request policy) is preserved on both paths: stripping it
 * would block the inline bootstrap scripts and leave a blank app.
 * A Web API Headers instance is normalized to a plain Node header object
 * first, because Node otherwise discards the argument wholesale.
 * Idempotent: safe to call when the middleware already applied the headers,
 * since setHeader overwrites identical values. Preserves `this`, all
 * writeHead overloads, and the return value of the original.
 * @param {{ setHeader: (name: string, value: string) => unknown, writeHead: (...args: any[]) => any }} res
 */
export function wrapWriteHead(res) {
  const originalWriteHead = res.writeHead;
  res.writeHead = function (...args) {
    applySecurityHeaders(res);
    // writeHead(status[, statusMessage][, headers]) — the headers object is the
    // first non-null object argument, never the first argument, so a statusCode
    // alone or a "OK" message both leave this at -1.
    const headersIndex = args.findIndex(
      (arg) => arg !== null && typeof arg === "object",
    );
    if (headersIndex !== -1) {
      const normalized = toNodeHeaders(args[headersIndex]);
      if (normalized !== null) {
        args[headersIndex] = normalized;
      }
      overlaySecurityHeaders(args[headersIndex]);
    }
    return originalWriteHead.apply(this, args);
  };
}

// Content-hash fingerprint as emitted by bundlers: name.<hex8+>.ext
// (e.g. start.abc123.js). Minimum 8 hex chars so plain version segments like
// the ".wasm" in ammo.wasm.wasm never match.
/** @type {RegExp} */
const HASHED_FILENAME = /\.[0-9a-f]{8,}\.[a-z0-9]+$/i;

// Compression variants written by adapter-node (`precompress: true`). An asset
// is served from "<name>.br" / "<name>.gz" but is one and the same resource:
// "<name>.br" and "<name>" must get byte-identical cache policy, otherwise a
// client that once received the compressed variant revalidates far more often
// (or pins a stale body) than the same client on the uncompressed one.
/** @type {RegExp} */
const COMPRESSION_SUFFIX = /\.(br|gz)$/i;

/**
 * Normalize an asset path for cache-policy decisions: platform separators to
 * "/", any compression variant suffix removed. Applied once in
 * cacheControlFor() so isImmutableAsset() and isVersionedBinary() can never
 * disagree about whether two paths describe the same asset.
 * @param {string} filePath
 * @returns {string}
 */
function normalizeAssetPath(filePath) {
  return filePath.split(path.sep).join("/").replace(COMPRESSION_SUFFIX, "");
}
/**
 * Fingerprinted SvelteKit assets live under /_app/immutable/ and static fonts
 * under /fonts/ are safe to cache forever (immutable content/versioned assets).
 * WASM/Ammo binaries under /wasm/ and /ammo/ are only immutable when the
 * filename itself carries a content hash: the shipped files
 * (technicals_wasm_bg.wasm, ammo.wasm.wasm) keep stable names across rebuilds,
 * so a year-long `immutable` would pin returning users to stale indicator code
 * after a WASM redeploy. Stable-name binaries get a bounded cache window in
 * cacheControlFor() instead; hashing the filenames at build time would allow
 * promoting them to immutable (open improvement, not done here).
 * Everything else — index.html, favicon.ico, non-hashed files — must revalidate.
 * Compression variants (".br", ".gz") are stripped first, so an asset keeps one
 * policy across both representations; see normalizeAssetPath().
 * @param {string} filePath
 * @returns {boolean}
 */
export function isImmutableAsset(filePath) {
  const normalized = normalizeAssetPath(filePath);
  if (normalized.includes("/_app/immutable/")) {
    return true;
  }
  if (normalized.includes("/fonts/") && /\.(ttf|woff2?|eot|otf)$/i.test(normalized)) {
    return true;
  }
  if (
    (normalized.includes("/wasm/") || normalized.includes("/ammo/")) &&
    HASHED_FILENAME.test(normalized)
  ) {
    return true;
  }
  return false;
}

/**
 * Rebuildable binaries served under stable filenames (/wasm/, /ammo/).
 * Their content changes without the URL changing, so they must never be
 * `immutable` — they get a short bounded cache window with mandatory
 * revalidation instead. Restricted to the loader-relevant extensions; sidecar
 * files (.d.ts, .map, READMEs) stay on no-cache. Compression variants are
 * stripped first; see normalizeAssetPath().
 * @param {string} filePath
 * @returns {boolean}
 */
export function isVersionedBinary(filePath) {
  const normalized = normalizeAssetPath(filePath);
  return (
    (normalized.includes("/wasm/") || normalized.includes("/ammo/")) &&
    /\.(wasm|js)$/i.test(normalized)
  );
}

/**
 * @param {string} filePath
 * @returns {string}
 */
export function cacheControlFor(filePath) {
  const normalized = normalizeAssetPath(filePath);
  if (isImmutableAsset(normalized)) {
    return "public, max-age=31536000, immutable";
  }
  if (isVersionedBinary(normalized)) {
    return "public, max-age=3600, must-revalidate";
  }
  return "no-cache";
}
