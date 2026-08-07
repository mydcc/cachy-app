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

import { json } from "@sveltejs/kit";
import crypto from "node:crypto";
import { createRateLimiter } from "./rateLimit";

/**
 * Self-service, anonymous client tokens (BUG-0052), replacing the single
 * shared `APP_ACCESS_TOKEN` that `checkAppAuth` used to compare against (see
 * the ADR-0002 amendment). A token identifies a *client*, not a person: no
 * registration, no personal data. `POST /api/auth/token` issues one; every
 * route that used to call `checkAppAuth` now calls `checkClientToken`
 * instead.
 *
 * Storage is in-memory and holds only `{ createdAt, requestCount, lastSeenAt }`
 * keyed by the token's SHA-256 hash — never the raw token, mirroring how
 * `APP_ACCESS_TOKEN` was hashed before comparison. This is per-process state:
 * it resets on restart and does not span multiple instances, an accepted
 * limitation for v1 (the same one the pre-existing news-proxy rate limiter
 * already had).
 */

interface TokenRecord {
  createdAt: number;
  requestCount: number;
  lastSeenAt: number;
}

const tokens = new Map<string, TokenRecord>();

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Issues a new token, storing only its hash. Returns the raw token — the only time it is ever visible. */
export function issueToken(): string {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  tokens.set(hashToken(token), { createdAt: now, requestCount: 0, lastSeenAt: now });
  return token;
}

// Per-token: generous ceiling for normal use (polling positions/balance/orders,
// market data, AI proxies). Abuse protection, not a cost gate — /api/sentiment
// and the AI proxies are BYOK-only, so a token can never spend the operator's
// money, only its own rate-limit budget.
const perTokenLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });

// Per-IP, summed across all of that IP's tokens: catches a single actor
// minting many tokens to route around the per-token ceiling above.
const perIpLimiter = createRateLimiter({ windowMs: 60_000, max: 600 });

function unauthorized(): Response {
  return json(
    { error: "Unauthorized: Invalid or missing client access token" },
    { status: 401 },
  );
}

function rateLimited(): Response {
  return json({ error: "Rate limit exceeded" }, { status: 429 });
}

/**
 * Guards a route with a self-issued client token. Two questions, in order:
 * does this token exist, and is it — and its IP — within its rate limit?
 *
 * `clientAddress` is passed in (each route's own `getClientAddress()`) rather
 * than read here, since a bare `Request` has no reliable notion of the
 * caller's IP on its own.
 */
export function checkClientToken(request: Request, clientAddress: string): Response | null {
  const rawToken = request.headers.get("x-app-access-token") || "";
  if (!rawToken) return unauthorized();

  const hash = hashToken(rawToken);
  const record = tokens.get(hash);
  if (!record) return unauthorized();

  if (!perIpLimiter.consume(clientAddress)) return rateLimited();
  if (!perTokenLimiter.consume(hash)) return rateLimited();

  record.requestCount += 1;
  record.lastSeenAt = Date.now();

  return null;
}

/** Test-only escape hatch: drops all issued tokens and rate-limit state. */
export function _resetForTests(): void {
  tokens.clear();
  perTokenLimiter.clear();
  perIpLimiter.clear();
}
