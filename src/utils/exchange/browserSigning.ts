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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * The single client-side entry point for a signed Cachy request (FEAT-0405).
 *
 * Every migrated call site collapses onto `exchangeSignedFetch`. The point of
 * the funnel is that `X-Api-Secret` has exactly one place it could be attached,
 * and there is none — this module never reads `keys.apiSecret` into a header.
 *
 * Two rules this module exists to enforce:
 *
 * 1. **Sign per call.** The envelope is never cached. `syncService` fires three
 *    concurrent POSTs and `feeRateService` a fourth; a memoised nonce would make
 *    the venue reject the later ones as replays.
 * 2. **The passphrase rides only where the route reaches Bitget.** The venue is
 *    resolved from `ROUTE_SIGNING_PLAN` first, and the Bitunix branch returns
 *    before the passphrase is ever read — so a Bitunix request cannot carry a
 *    credential Bitunix never asked for.
 *
 * Browser-safe: no `node:*` imports, no SvelteKit-only modules.
 */

import { signBitgetRequest, signBitunixRequest } from "../crypto/exchangeSigning";
import { correctedNow } from "./clockDrift";
import { planForRoute, type Venue } from "./restSigningPlan";

export interface ExchangeKeys {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface SignCachyRequestInput {
  /** Cachy proxy path, e.g. `/api/orders`. Query string and hash are ignored. */
  cachyPath: string;
  keys: ExchangeKeys;
  /**
   * Venue to sign for. Required only on the routes that accept more than one;
   * on a single-venue route it is inferred from the plan table and passing a
   * different venue is an error rather than a silent override.
   */
  venue?: Venue;
  /** JSON payload Cachy receives. The signed bytes for body-signed routes. */
  payload?: unknown;
  /** Parameters the signature covers on query-signed routes. */
  queryParams?: Record<string, string>;
  /**
   * The *venue* method, not the Cachy method. Defaults to `POST` for
   * body-signed routes and `GET` for query-signed ones. A query-signed route
   * still POSTs to Cachy; the venue call it proxies is a GET.
   */
  method?: string;
  /** Upstream path the venue signs. Bitget folds it into the prehash. */
  upstreamPath?: string;
  /** Injectable clock, for tests. Defaults to `correctedNow()`. */
  now?: () => number;
}

export interface SignedCachyRequest {
  headers: Record<string, string>;
  /** Request body to send, when the route carries one. */
  body?: string;
}

export const SIGNING_ERRORS = {
  ROUTE_NOT_MIGRATED: "SIGNING_ROUTE_NOT_MIGRATED",
  VENUE_REQUIRED: "SIGNING_VENUE_REQUIRED",
  VENUE_NOT_SUPPORTED: "SIGNING_VENUE_NOT_SUPPORTED",
  INSECURE_CONTEXT: "SIGNING_INSECURE_CONTEXT",
} as const;

/**
 * Builds the pre-signed envelope for one Cachy request.
 *
 * Throws `Error` carrying a `SIGNING_ERRORS` code rather than a message, so the
 * caller can map it to a locale string — same convention as `ORDER_ERRORS`.
 */
export async function signCachyRequest(
  input: SignCachyRequestInput,
): Promise<SignedCachyRequest> {
  // ADR-0013 failure mode 3. `crypto.subtle` is undefined outside a secure
  // context and the signers below would fail opaquely on `.digest of undefined`.
  if (!globalThis.crypto?.subtle) {
    throw new Error(SIGNING_ERRORS.INSECURE_CONTEXT);
  }

  const plan = planForRoute(input.cachyPath);
  if (!plan) throw new Error(SIGNING_ERRORS.ROUTE_NOT_MIGRATED);

  let venue = input.venue;
  if (!venue) {
    if (plan.venues.length !== 1) throw new Error(SIGNING_ERRORS.VENUE_REQUIRED);
    venue = plan.venues[0];
  }
  if (!plan.venues.includes(venue)) {
    throw new Error(SIGNING_ERRORS.VENUE_NOT_SUPPORTED);
  }

  const timestamp = (input.now ?? correctedNow)().toString();
  const headers: Record<string, string> = { "x-api-key": input.keys.apiKey };

  if (venue === "bitunix") {
    const result = await signBitunixRequest(
      input.keys.apiKey,
      input.keys.apiSecret,
      input.queryParams ?? {},
      plan.signed === "body" ? input.payload : null,
      { timestamp },
    );

    headers["x-api-sign"] = result.signature;
    headers["x-api-timestamp"] = result.timestamp;
    headers["x-api-nonce"] = result.nonce;
    if (plan.signed === "query") headers["x-api-query"] = result.queryString;

    return {
      headers,
      // The signer's own serialisation, not a second `JSON.stringify` of the
      // same object. Identical today, and staying identical is the whole point.
      body: plan.signed === "body" ? result.bodyStr : undefined,
    };
  }

  const method = input.method ?? (plan.signed === "body" ? "POST" : "GET");
  const result = await signBitgetRequest(
    input.keys.apiSecret,
    method,
    input.upstreamPath ?? input.cachyPath,
    input.queryParams ?? {},
    plan.signed === "body" ? input.payload : null,
    { timestamp },
  );

  headers["x-api-sign"] = result.signature;
  headers["x-api-timestamp"] = result.timestamp;
  if (plan.signed === "query") headers["x-api-query"] = result.queryString;

  // The ADR-0013 named exception, and the only place the passphrase is read.
  // No guard on `plan` here on purpose: this line is reachable only on the
  // Bitget branch, and `venue` was already checked against `plan.venues`, so a
  // route-level condition would be unconditionally true. A Bitunix request
  // cannot carry this header because the branch above returned first — which is
  // the property the test asserts, and the server re-checks it independently in
  // `assertPresignedConsistency`.
  if (input.keys.passphrase) {
    headers["x-api-passphrase"] = input.keys.passphrase;
  }

  return {
    headers,
    body: plan.signed === "body" ? result.bodyStr : undefined,
  };
}

/**
 * Signs and dispatches one Cachy request.
 *
 * `headers` is merged before the envelope, so a caller can add `x-provider` or
 * `content-type` but cannot overwrite `x-api-key` or `x-api-sign`.
 */
export async function exchangeSignedFetch(
  input: SignCachyRequestInput & {
    fetchFn?: typeof fetch;
    headers?: Record<string, string>;
  },
): Promise<Response> {
  const signed = await signCachyRequest(input);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...input.headers,
    // Last, so the envelope cannot be displaced by a caller-supplied header.
    // A caller that spreads its own `x-api-key` would otherwise sign with one
    // key and advertise another, and the server guard could not tell — it
    // compares signed bytes, not key identity.
    ...signed.headers,
  };

  const doFetch = input.fetchFn ?? fetch;
  return doFetch(input.cachyPath, {
    method: "POST",
    headers,
    body: signed.body ?? JSON.stringify(input.payload ?? {}),
  });
}
