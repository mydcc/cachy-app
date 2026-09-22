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
import { applySecurityHeaders, cacheControlFor, wrapWriteHead } from './server-headers.js';

const app = express();

// Level 6 compression improves the Lighthouse Performance Score. The default
// 1 KB threshold stays: gzipping tiny responses costs more CPU than it saves.
app.use(compression({ level: 6 }));

// Guarantee security headers on every response, including SvelteKit fallback
// and static responses. setHeader() alone is not enough: Node lets headers
// passed explicitly to res.writeHead() win over earlier setHeader() calls, so
// wrapWriteHead re-applies our headers right before the flush and overlays them
// onto any explicit headers argument (object, flat-array or pairs-array form).
// Cache-Control is not part of SECURITY_HEADERS, so per-asset cache policies
// from setHeaders survive untouched.
app.use((req, res, next) => {
  wrapWriteHead(res);
  applySecurityHeaders(res);
  next();
});

// Let SvelteKit serve static assets with correct caching headers. Security
// headers are explicitly applied via applySecurityHeaders(res) in setHeaders
// because express.static sets its own response headers and does not inherit
// from preceding middleware. path is a filesystem path (backslashes on Windows).
app.use(express.static('build/client', {
  index: false,
  setHeaders: (res, path) => {
    applySecurityHeaders(res);
    res.setHeader('Cache-Control', cacheControlFor(path));
  }
}));
app.use(handler);

const port = process.env.PORT || "3001";
// HOST is optional. Unset means every interface (the long-standing behaviour);
// set it to 127.0.0.1 behind a reverse proxy so the app is reachable only via
// nginx. adapter-node would read HOST itself, but this wrapper owns the listen
// call, so without this the value was silently ignored.
const host = process.env.HOST;
const server = app.listen(port, host, () => {
  // Report the address the OS actually bound rather than the requested host:
  // with HOST unset that is `::` (dual-stack any), not `0.0.0.0`.
  const address = server.address();
  const where =
    typeof address === "string" ? address : `${address.address}:${address.port}`;
  console.log(`Starting server on ${where}...`);
});

// Drain in-flight requests on SIGTERM/SIGINT instead of dropping them. Without
// this, deploy.sh's SIGTERM grace period is pointless: the process dies on the
// first signal and any request mid-flight is cut. SHUTDOWN_TIMEOUT keeps
// adapter-node's unit (seconds); the default sits just under deploy.sh's 10s
// SIGTERM-to-SIGKILL window so a clean exit wins the race.
const shutdownTimeoutMs =
  (Number(process.env.SHUTDOWN_TIMEOUT) > 0 ? Number(process.env.SHUTDOWN_TIMEOUT) : 9) * 1000;

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, draining in-flight requests...`);
    server.close(() => {
      console.log("All connections closed, exiting.");
      process.exit(0);
    });
    // Idle keep-alive sockets would otherwise hold server.close() open until
    // their timeout, even though no request is in flight.
    server.closeIdleConnections?.();
    // Hard stop for requests that do not finish in time. unref() so the timer
    // itself never keeps the process alive after a clean close.
    setTimeout(() => {
      console.warn(`Shutdown timeout (${shutdownTimeoutMs}ms) reached, forcing exit.`);
      process.exit(1);
    }, shutdownTimeoutMs).unref();
  });
}
