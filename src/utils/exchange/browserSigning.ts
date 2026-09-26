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

import {
  signBitgetRequest,
  signBitunixRequest,
  validateBitgetKeys,
  validateBitunixKeys,
} from "../crypto/exchangeSigning";
import { correctedNow } from "./clockDrift";
import {
  bitgetUpstreamPath,
  cachyAction,
  planForRoute,
  signatureShapeFor,
  type Venue,
} from "./restSigningPlan";
import { buildVenueBody } from "./venueBodies";
import { ORDER_ERRORS } from "./orderErrors";
import type { AccountSettingsPayload } from "../../types/accountSettingsSchemas";
import type { OrderRequestPayload } from "../../types/orderSchemas";

export interface ExchangeKeys {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface SignCachyRequestInput {
  /**
   * Cachy proxy path, e.g. `/api/orders`. A hash is ignored. The query string
   * is *not*: on a shape-varying route the `?action=` parameter is what both
   * sides resolve the signature shape from — see `action`.
   */
  cachyPath: string;
  keys: ExchangeKeys;
  /**
   * Venue to sign for. Required only on the routes that accept more than one;
   * on a single-venue route it is inferred from the plan table and passing a
   * different venue is an error rather than a silent override.
   */
  venue?: Venue;
  /**
   * JSON payload Cachy receives. On a body-signed route this is *not* what the
   * signature covers — see `venueBytesFor`.
   */
  payload?: unknown;
  /** Parameters the signature covers on query-signed routes. */
  queryParams?: Record<string, string>;
  /**
   * The action a shape-varying route (`/api/orders`, `/api/tpsl`) signs as —
   * `pending`, `place`, and friends. Overrides the `?action=` URL parameter
   * for shape resolution; a URL that carries a *different* action is refused
   * rather than signed, because the server resolves from the URL and the two
   * sides would diverge. `exchangeSignedFetch` also appends it to the request
   * URL, so a caller that declares it here does not hand-build a query string.
   */
  action?: string;
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
  VENUE_PATH_UNKNOWN: "SIGNING_VENUE_PATH_UNKNOWN",
  ACTION_MISMATCH: "SIGNING_ACTION_MISMATCH",
} as const;

/**
 * The bytes a venue signature covers on a body-signed action.
 *
 * A string payload is already the venue body and travels verbatim: `/api/tpsl`'s
 * write actions build theirs with `buildTpslWriteBody` and hand the result over,
 * because the `{ exchange, action, params }` object they start from is the
 * transport's business and Bitunix reads none of it.
 *
 * An object payload is a *Cachy* payload — it carries `type` and `exchange`,
 * which no venue body does — so `buildVenueBody` is what turns it into the bytes
 * the venue reads. Absent, or neither shape, is refused rather than signed as an
 * empty body: there is nothing to send, and the route cannot rebuild a venue
 * body from a payload that has no action in it either.
 */
function venueBytesFor(venue: Venue, payload: unknown): string {
  if (typeof payload === "string" && payload !== "") return payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
  }
  return buildVenueBody(venue, payload as OrderRequestPayload | AccountSettingsPayload);
}

/**
 * Cachy's own body for a body-signed action, which is deliberately *not* the
 * bytes that were signed (decision 1 in the feature doc).
 *
 * A venue body carries neither `type` nor `exchange`, so it cannot be what the
 * route receives: the route Zod-validates those two before it forwards anything,
 * and a body that failed to parse would be a 400 on every write. The signed bytes
 * therefore ride alongside them as `venueBody`, and the route forwards that field
 * verbatim — one serialisation, produced here, rather than two that must be kept
 * in step.
 *
 * A string payload needs no wrapper: it is already the transport body, which is
 * the `/api/tpsl` case.
 */
function cachyBodyFor(payload: unknown, venueBody: string): string {
  if (typeof payload === "string") return payload;
  return JSON.stringify({ ...(payload as Record<string, unknown>), venueBody });
}

/**
 * The action a request carries, as the Bitget path table keys it.
 *
 * `cachyAction` reads the URL and only the URL, because on a route whose
 * *shape* varies the discriminator must be there and nowhere else. The Bitget
 * endpoint varies with the action too, but on `/api/orders` the body-signed
 * writes carry theirs in `payload.type` — the field the route validates and
 * `executeOrder` switches on — so the URL alone would leave every Bitget write
 * with no row. URL first: a route that does vary its shape keeps resolving
 * from there, which is the property `cachyAction` exists to protect.
 */
function pathAction(input: SignCachyRequestInput): string | undefined {
  const fromUrl = cachyAction(input.cachyPath);
  if (fromUrl !== undefined) return fromUrl;

  const payload = input.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return undefined;
  }
  const type = (payload as Record<string, unknown>).type;
  return typeof type === "string" ? type : undefined;
}

/**
 * The URL the envelope is POSTed to. A caller that declares the action
 * explicitly does not also have to hand-build the query string the server
 * reads it from: on a shape-varying route the action rides in `?action=`, and
 * a URL without it would make the server resolve a different shape than the
 * one just signed. A URL that already carries the action is left alone — a
 * disagreeing one never reaches here, `signCachyRequest` refuses it first.
 */
function requestPathFor(cachyPath: string, action: string | undefined): string {
  if (action === undefined) return cachyPath;
  if (cachyAction(cachyPath) !== undefined) return cachyPath;
  const separator = cachyPath.includes("?") ? "&" : "?";
  return `${cachyPath}${separator}action=${encodeURIComponent(action)}`;
}

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

  // The key-shape check the server used to run in `validateKeys`. It needs the
  // secret, so it cannot survive there — and dropping it would turn a legible
  // "Invalid API Key" into an opaque venue rejection.
  const keyError =
    venue === "bitunix"
      ? validateBitunixKeys(input.keys.apiKey, input.keys.apiSecret)
      : validateBitgetKeys(input.keys.apiKey, input.keys.apiSecret, input.keys.passphrase);
  if (keyError) throw new Error(keyError);

  // The action a shape-varying route signs as. The URL stays the primary source —
  // it is the one place both sides can read — and the explicit field is the
  // override for callers that name the action in the payload rather than
  // hand-building a query string. Both present and disagreeing is a programming
  // bug with a guaranteed `PRESIGNED_DIVERGENCE` at the end of it, so it is
  // refused here, before anything is signed (ADR-0013, failure mode 2).
  const urlAction = cachyAction(input.cachyPath);
  if (input.action !== undefined && urlAction !== undefined && input.action !== urlAction) {
    throw new Error(SIGNING_ERRORS.ACTION_MISMATCH);
  }
  const action = input.action ?? urlAction;
  const shape = signatureShapeFor(plan, action);

  const venueBody = shape === "body" ? venueBytesFor(venue, input.payload) : undefined;
  // Narrowed off `venueBody` rather than re-testing `shape`: two ternaries on
  // the same condition are independent expressions, so the type checker reads
  // `venueBody` here as `string | undefined` and refuses the call.
  const transmitBody =
    venueBody === undefined ? undefined : cachyBodyFor(input.payload, venueBody);

  const timestamp = (input.now ?? correctedNow)().toString();
  const headers: Record<string, string> = { "x-api-key": input.keys.apiKey };

  if (venue === "bitunix") {
    const result = await signBitunixRequest(
      input.keys.apiKey,
      input.keys.apiSecret,
      input.queryParams ?? {},
      venueBody ?? null,
      { timestamp },
    );

    headers["x-api-sign"] = result.signature;
    headers["x-api-timestamp"] = result.timestamp;
    headers["x-api-nonce"] = result.nonce;
    if (shape === "query") headers["x-api-query"] = result.queryString;

    return { headers, body: transmitBody };
  }

  const method = input.method ?? (shape === "body" ? "POST" : "GET");
  // Bitget's prehash covers `method + requestPath + query + body`, so the path
  // it signs has to be the one Bitget will reconstruct — the *upstream* one,
  // not Cachy's. Signing `/api/positions` while the server forwards to
  // `/api/mix/v1/position/allPosition` is a signature Bitget rejects, and the
  // envelope guard cannot see it: both sides agree on the query string, which
  // is the only part it compares. Resolved from the same table `bitget.ts`
  // forwards from, so the two cannot disagree about this string.
  //
  // `input.upstreamPath` stays as the explicit override the conformance tests
  // pin a path with. A route with no entry is refused rather than signed over
  // the Cachy path: there is no "close enough" here, and the alternative is a
  // venue rejection in the middle of a trade.
  const upstreamPath =
    input.upstreamPath ?? bitgetUpstreamPath(input.cachyPath, action ?? pathAction(input));
  if (!upstreamPath) throw new Error(SIGNING_ERRORS.VENUE_PATH_UNKNOWN);

  const result = await signBitgetRequest(
    input.keys.apiSecret,
    method,
    upstreamPath,
    input.queryParams ?? {},
    venueBody ?? null,
    { timestamp },
  );

  headers["x-api-sign"] = result.signature;
  headers["x-api-timestamp"] = result.timestamp;
  if (shape === "query") headers["x-api-query"] = result.queryString;

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
    // `shape`, not `plan.signed`: on a route whose shape varies per action the
    // two differ, and the server reads the shape back off the URL. Resolving it
    // twice — once here from `plan`, once above into `shape` — is how those two
    // answers drift apart.
    body: transmitBody,
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
    /**
     * Typed to the call this function actually makes — a string path plus
     * `RequestInit` — not to `typeof fetch`. The app's authenticated fetch
     * takes only a string, so the wider type rejected every real caller while
     * this one describes nothing the function needs.
     *
     * A `fetchFn` that needs an invariant checked before every attempt may
     * carry it by accepting `appFetch`'s third `beforeAttempt` argument — see
     * `dispatchUnderSession` in `tradeService.ts` (BUG-0551). The narrower type
     * above accepts such a function unchanged, so the hook is a convention this
     * comment carries, not one the compiler enforces: wrapping `appFetch` in a
     * two-argument lambda would type-check and drop the guard.
     */
    fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
    headers?: Record<string, string>;
    /** Passed through to `fetch`; a caller with its own deadline needs it. */
    signal?: AbortSignal;
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
  return doFetch(requestPathFor(input.cachyPath, input.action), {
    method: "POST",
    headers,
    body: signed.body ?? JSON.stringify(input.payload ?? {}),
    signal: input.signal,
  });
}
