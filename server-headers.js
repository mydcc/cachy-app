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
 * @param {{ setHeader: (name: string, value: string) => unknown, getHeader?: (name: string) => unknown }} res
 */
export function applySecurityHeaders(res) {
  for (const [name, value] of SECURITY_HEADERS) {
    if (name === "Content-Security-Policy" && typeof res.getHeader === "function") {
      const existing = res.getHeader(name);
      // The SvelteKit layer (kit.csp.mode "auto", see svelte.config.js) emits
      // a per-request nonce CSP via hooks.server.ts — it must win wherever
      // present; overwriting it would strip nonces and break inline scripts.
      if (existing != null && existing !== value) {
        continue;
      }
    }
    res.setHeader(name, value);
  }
}

/**
 * Re-apply security headers just before the response headers flush. The
 * SvelteKit handler (SPA fallback) answers via res.writeHead and would
 * otherwise bypass headers set in earlier middleware — installing this hook
 * per request covers every response path exactly once.
 * @param {{ writeHead: (...args: never[]) => unknown, headersSent?: boolean, setHeader: (name: string, value: string) => unknown, getHeader?: (name: string) => unknown }} res
 */
export function installSecurityHeadersHook(res) {
  const originalWriteHead = res.writeHead;
  res.writeHead = function (statusCode, ...args) {
    if (!res.headersSent) {
      applySecurityHeaders(res);
    }
    return originalWriteHead.call(this, statusCode, ...args);
  };
}

/**
 * Fingerprinted SvelteKit assets live under /_app/immutable/ and static fonts
 * under /fonts/ are safe to cache forever (immutable content/versioned assets).
 * Everything else — index.html, version.json, other non-hashed files — must
 * revalidate (static images and metadata cache briefly, see cacheControlFor).
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
  return false;
}

/**
 * @param {string} filePath
 * @returns {string}
 */
export function cacheControlFor(filePath) {
  if (isImmutableAsset(filePath)) {
    return "public, max-age=31536000, immutable";
  }
  const normalized = filePath.split(path.sep).join("/");
  // NOTE: .json stays on no-cache on purpose: non-fingerprinted JSON such as
  // _app/version.json or manifest.json changes on every deploy and must never
  // sit in a 1-day cache.
  if (/\.(png|svg|ico|jpg|jpeg|webp|xml|txt)$/i.test(normalized)) {
    return "public, max-age=86400, must-revalidate";
  }
  return "no-cache";
}
