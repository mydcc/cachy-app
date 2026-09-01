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
export const SECURITY_HEADERS = [
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload"],
  ["Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://s.cachy.app blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: https://s.cachy.app; media-src 'self' blob: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-src 'self' https://space.cachy.app https://s.cachy.app https: blob: data:; frame-ancestors 'self'; connect-src 'self' https://s.cachy.app https://chat.cachy.app wss://chat.cachy.app https://*.cachy.app wss://*.cachy.app https://bam.nr-data.net https://bam.eu01.nr-data.net wss://fapi.bitunix.com wss://stream.bitunix.com wss://ws.bitget.com https://api.imgbb.com https://discord.com https://generativelanguage.googleapis.com https://api.openai.com"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "SAMEORIGIN"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
  // DO NOT add Cross-Origin-Embedder-Policy (COEP). COEP breaks embedded channel iframes (e.g. space.cachy.app Unity Metaverse) and external news modals.
  // DO NOT restrict camera, microphone, xr-spatial-tracking, or geolocation to () as it breaks 3D space.cachy.app metaverse and external iframe modals.
  ["Permissions-Policy", "camera=(self \"https://space.cachy.app\"), microphone=(self \"https://space.cachy.app\"), xr-spatial-tracking=(self \"https://space.cachy.app\" *), display-capture=(self \"https://space.cachy.app\"), fullscreen=*, autoplay=*, accelerometer=*, gyroscope=*, clipboard-write=*, encrypted-media=*, picture-in-picture=*, web-share=*, geolocation=*"],
];

export function applySecurityHeaders(res) {
  for (const [name, value] of SECURITY_HEADERS) {
    res.setHeader(name, value);
  }
}

/**
 * Fingerprinted SvelteKit assets live under /_app/immutable/ and are safe to
 * cache forever (immutable, content-hashed filenames). Everything else —
 * index.html, favicon.ico, non-hashed files — must revalidate.
 * Normalize path separators first: the callback receives a filesystem path,
 * which uses backslashes on Windows.
 */
export function isImmutableAsset(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  return normalized.includes("/_app/immutable/");
}

export function cacheControlFor(filePath) {
  return isImmutableAsset(filePath)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}
