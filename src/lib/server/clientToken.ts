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
 *
 * Stored records are bounded (BUG-0287): a token expires `TOKEN_TTL_MS` after
 * issuance and is rejected-and-evicted on first use afterwards, and the map is
 * hard-capped at `TOKEN_MAP_CAP` entries with oldest-first eviction, so a
 * long-running process cannot accumulate state without bound no matter how
 * often clients re-mint. Either event is invisible to well-behaved clients:
 * `appFetch` recognizes this exact 401, mints a fresh token in the background
 * and retries once.
 */

interface TokenRecord {
  createdAt: number;
  requestCount: number;
  lastSeenAt: number;
}

const tokens = new Map<string, TokenRecord>();

// A token stops working 24h after issuance. Chosen so any normal usage
// pattern — a daily trading session, a browser tab left open overnight —
// outlives it without re-auth friction; and when it does lapse, the only
// client-visible effect is one background POST /api/auth/token (see appFetch).
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Hard ceiling on stored records, mirroring rateLimit.ts's maxTrackedKeys:
// bounds memory even if tokens are minted faster than they expire. Oldest-
// inserted entries go first; insertion order is issuance order because each
// record is inserted exactly once.
export const TOKEN_MAP_CAP = 10_000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isExpired(record: TokenRecord, now: number): boolean {
  return now - record.createdAt >= TOKEN_TTL_MS;
}

/**
 * Drops expired entries oldest-first. Map iteration is insertion order, which
 * here equals issuance order, so everything up to the first live entry is
 * expired and the scan can stop there.
 */
function evictExpired(now: number): void {
  for (const [hash, record] of tokens) {
    if (!isExpired(record, now)) break;
    tokens.delete(hash);
  }
}

/** Backstop cap: frees room for one more record by dropping the oldest ones. */
function makeRoom(): void {
  while (tokens.size >= TOKEN_MAP_CAP) {
    const oldest = tokens.keys().next().value;
    if (oldest === undefined) return;
    tokens.delete(oldest);
  }
}

/** Issues a new token, storing only its hash. Returns the raw token — the only time it is ever visible. */
export function issueToken(): string {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  evictExpired(now);
  makeRoom();
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

  // Expired: reject AND evict, so a stale hash cannot linger until some later
  // mint happens to sweep it. Checked before the limiters so a dead token does
  // not spend anyone's rate-limit budget.
  const now = Date.now();
  if (isExpired(record, now)) {
    tokens.delete(hash);
    return unauthorized();
  }

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

/** Test-only escape hatch: current number of stored token records. */
export function _tokenStoreSizeForTests(): number {
  return tokens.size;
}
