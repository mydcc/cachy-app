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

import { handler } from './build/handler.js';
import express from 'express';
import compression from 'compression';

const app = express();

// Use compression to improve Lighthouse Performance Score
app.use(compression());

// Apply security headers to all requests
app.use((req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://s.cachy.app blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: https://s.cachy.app; media-src 'self' blob: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-src 'self' https://space.cachy.app https://s.cachy.app https: blob: data:; frame-ancestors 'self'; connect-src 'self' https://s.cachy.app https://chat.cachy.app wss://chat.cachy.app https://*.cachy.app wss://*.cachy.app https://bam.nr-data.net https://bam.eu01.nr-data.net wss://fapi.bitunix.com wss://stream.bitunix.com wss://ws.bitget.com https://api.imgbb.com https://discord.com https://generativelanguage.googleapis.com https://api.openai.com");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  // DO NOT add Cross-Origin-Embedder-Policy (COEP). COEP breaks embedded channel iframes (e.g. space.cachy.app Unity Metaverse) and external news modals.
  // DO NOT restrict camera, microphone, xr-spatial-tracking, or geolocation to () as it breaks 3D space.cachy.app metaverse and external iframe modals.
  res.setHeader("Permissions-Policy", "camera=(self \"https://space.cachy.app\"), microphone=(self \"https://space.cachy.app\"), xr-spatial-tracking=(self \"https://space.cachy.app\" *), display-capture=(self \"https://space.cachy.app\"), fullscreen=*, autoplay=*, accelerometer=*, gyroscope=*, clipboard-write=*, encrypted-media=*, picture-in-picture=*, web-share=*, geolocation=*");
  next();
});

// Serve static files to ensure they get compression and security headers
// SvelteKit's built-in static server (sirv) bypasses Express middleware for these.
app.use(express.static('build/client', {
  setHeaders: (res, path) => {
    if (path.includes('/_app/immutable/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Let SvelteKit handle everything else, including SSR and dynamic routes
app.use(handler);

const port = process.env.PORT || "3001";
app.listen(port, () => {
  console.log(`Starting server on port ${port}...`);
});
