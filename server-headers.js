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
 * @param {{ setHeader: (name: string, value: string) => unknown }} res
 */
export function applySecurityHeaders(res) {
  for (const [name, value] of SECURITY_HEADERS) {
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
 * ([name, value, ...]) and arrays of pairs ([[name, value], ...]).
 * Array-form headers are mutated in place, preserving their shape.
 * @param {unknown} explicit the headers argument of the writeHead() call, if any
 */
export function overlaySecurityHeaders(explicit) {
  if (explicit === null || typeof explicit !== "object") {
    return;
  }
  if (Array.isArray(explicit)) {
    const names = new Set(SECURITY_HEADERS.map(([name]) => name.toLowerCase()));
    if (explicit.length > 0 && explicit.every((entry) => Array.isArray(entry))) {
      for (let i = explicit.length - 1; i >= 0; i -= 1) {
        if (names.has(String(explicit[i][0]).toLowerCase())) {
          explicit.splice(i, 1);
        }
      }
      for (const [name, value] of SECURITY_HEADERS) {
        explicit.push([name, value]);
      }
    } else {
      for (let i = explicit.length - 2; i >= 0; i -= 2) {
        if (names.has(String(explicit[i]).toLowerCase())) {
          explicit.splice(i, 2);
        }
      }
      for (const [name, value] of SECURITY_HEADERS) {
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
 * policies survive.
 * Idempotent: safe to call when the middleware already applied the headers,
 * since setHeader overwrites identical values. Preserves `this`, all
 * writeHead overloads, and the return value of the original.
 * @param {{ setHeader: (name: string, value: string) => unknown, writeHead: (...args: any[]) => any }} res
 */
export function wrapWriteHead(res) {
  const originalWriteHead = res.writeHead;
  res.writeHead = function (...args) {
    applySecurityHeaders(res);
    overlaySecurityHeaders(args.find((arg) => arg !== null && typeof arg === "object"));
    return originalWriteHead.apply(this, args);
  };
}

// Content-hash fingerprint as emitted by bundlers: name.<hex8+>.ext
// (e.g. start.abc123.js). Minimum 8 hex chars so plain version segments like
// the ".wasm" in ammo.wasm.wasm never match.
/** @type {RegExp} */
const HASHED_FILENAME = /\.[0-9a-f]{8,}\.[a-z0-9]+$/i;
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
 * Normalize path separators first: the callback receives a filesystem path,
 * which uses backslashes on Windows.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isImmutableAsset(filePath) {
  const normalized = filePath.split(path.sep).join("/");
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
 * files (.d.ts, .map, READMEs) stay on no-cache.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isVersionedBinary(filePath) {
  const normalized = filePath.split(path.sep).join("/");
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
  if (isImmutableAsset(filePath)) {
    return "public, max-age=31536000, immutable";
  }
  if (isVersionedBinary(filePath)) {
    return "public, max-age=3600, must-revalidate";
  }
  return "no-cache";
}
