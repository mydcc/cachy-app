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
import { applySecurityHeaders, cacheControlFor } from './server-headers.js';

const app = express();

// Use compression to improve Lighthouse Performance Score
app.use(compression());

// Apply security headers to all requests. Runs before express.static, so
// static assets already carry them — no need to repeat the call in setHeaders.
app.use((req, res, next) => {
  applySecurityHeaders(res);
  next();
});

// Let SvelteKit serve static assets with correct caching headers.
// express.static does not inherit headers set in preceding middleware, so
// applySecurityHeaders(res) must be called explicitly in setHeaders.
app.use(express.static('build/client', {
  index: false,
  setHeaders: (res, path) => {
    applySecurityHeaders(res);
    res.setHeader('Cache-Control', cacheControlFor(path));
  }
}));
app.use(handler);

const port = process.env.PORT || "3001";
app.listen(port, () => {
  console.log(`Starting server on port ${port}...`);
});
