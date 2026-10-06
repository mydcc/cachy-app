/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Content-Security-Policy directives for the SvelteKit `auto` CSP mode.
 * Single source of truth, imported by both `vite.config.ts` (which hands it
 * to the `sveltekit()` plugin) and `src/csp.test.ts` (which guards it).
 *
 * Non-negotiable: `frame-src` must keep `space.cachy.app` / `s.cachy.app`
 * (3D Metaverse iframe, embedded news), and `connect-src` must keep every
 * external channel host in use. See BUG-0270, FEAT-0374, FEAT-0397, FEAT-0467.
 */
export const cspDirectives: Record<string, string[]> = {
  "default-src": ["self"],
  "script-src": ["self", "wasm-unsafe-eval", "https://s.cachy.app", "blob:"],
  "style-src": ["self", "unsafe-inline"],
  "img-src": ["self", "data:", "https:"],
  "media-src": ["self", "blob:", "https:"],
  "font-src": ["self", "data:"],
  "object-src": ["none"],
  "base-uri": ["self"],
  "frame-src": [
    "self",
    "https://space.cachy.app",
    "https://s.cachy.app",
    "https:",
    "blob:",
    "data:",
  ],
  "frame-ancestors": ["self"],
  "connect-src": [
    "self",
    "https:",
    "https://s.cachy.app",
    "https://chat.cachy.app",
    "wss://chat.cachy.app",
    "https://*.cachy.app",
    "wss://*.cachy.app",
    "wss://fapi.bitunix.com",
    "wss://stream.bitunix.com",
    "wss://ws.bitget.com",
    "https://api.imgbb.com",
    "https://discord.com",
    "https://api.telegram.org",
    "https://api.mailgun.net",
    "https://generativelanguage.googleapis.com",
    "https://api.openai.com",
  ],
};
