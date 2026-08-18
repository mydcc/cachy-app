/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://s.cachy.app blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' blob: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-src 'self' https://space.cachy.app https:; frame-ancestors 'self'; connect-src 'self' https://s.cachy.app https://bam.nr-data.net https://bam.eu01.nr-data.net wss://fapi.bitunix.com wss://stream.bitunix.com wss://ws.bitget.com https://api.imgbb.com https://discord.com https://generativelanguage.googleapis.com https://api.openai.com");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// Let SvelteKit handle everything else, including static files
app.use(handler);

const port = process.env.PORT || "3001";
app.listen(port, () => {
  console.log(`Starting server on port ${port}...`);
});
