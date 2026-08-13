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

// server.js
// Wrapper script to start the SvelteKit app with a default port of 3001
// This solves the issue where port 3000 is occupied on shared hosting (e.g. aaPanel)

import express from 'express';
import { handler } from './build/handler.js';

const app = express();

// Inject required security headers before handing off to SvelteKit
app.use((req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://s.cachy.app blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' blob: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-src 'self' https://space.cachy.app; frame-ancestors 'self'; connect-src 'self' https://s.cachy.app https://bam.nr-data.net https://bam.eu01.nr-data.net wss://fapi.bitunix.com wss://stream.bitunix.com wss://ws.bitget.com https://api.imgbb.com https://discord.com https://generativelanguage.googleapis.com https://api.openai.com");
  next();
});

// Let SvelteKit handle everything else, including serving static assets
app.use(handler);

// Set default port to 3001 if not already set via environment variable
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`Starting server on port ${port}...`);
});
