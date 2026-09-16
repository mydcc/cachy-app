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
 * Shared route/signature table for FEAT-0405 (ADR-0013).
 *
 * One table, two readers: the browser helper that builds the pre-signed
 * envelope, and the server guard that decides whether an incoming envelope is
 * admissible. Client and server therefore cannot disagree about which routes
 * are migrated, what their signature covers, or whether a passphrase belongs on
 * the request — that disagreement is ADR-0013's second failure mode.
 *
 * When a route is migrated, add it here first. A route absent from this table
 * has not been cut over and still takes `X-Api-Secret`.
 *
 * Browser-safe: no `node:*` imports, no SvelteKit-only modules.
 */

export type Venue = "bitunix" | "bitget";

/** What the venue's signature covers for this route. */
export type SignatureShape = "query" | "body";

export interface RouteSigningPlan {
  /** `query`: the prehash covers sorted query params. `body`: it covers the body. */
  signed: SignatureShape;
  /**
   * Per-action override, for the route whose shape is a property of the action
   * it carries rather than of the route itself. Anything absent falls back to
   * `signed`, so a route that does not vary leaves this out.
   *
   * Read through `signatureShapeFor`, never directly — a caller that resolved
   * the shape itself could resolve it differently from the other side, which is
   * ADR-0013's second failure mode.
   */
  signedByAction?: Record<string, SignatureShape>;
  /** Venues the route accepts. Single-entry for the Bitunix-hardwired routes. */
  venues: readonly Venue[];
}

/**
 * The twelve migrated Cachy proxy routes.
 *
 * `orders` and `account-settings` sign the JSON body; the rest sign a query
 * string. The five routes carrying more than one venue are exactly those that
 * dispatch through `resolveVenue(exchange)` — the other seven call
 * `generateBitunixSignature` directly and reject `exchange !== "bitunix"`.
 *
 * `tpsl` is the one route that is both: its read actions sign a query and its
 * write actions sign a body, so it carries a `signedByAction` map on top of the
 * `query` default.
 */
export const ROUTE_SIGNING_PLAN = {
  "/api/orders": { signed: "body", venues: ["bitunix", "bitget"] },
  "/api/account-settings": { signed: "body", venues: ["bitunix", "bitget"] },
  "/api/balance": { signed: "query", venues: ["bitunix", "bitget"] },
  "/api/positions": { signed: "query", venues: ["bitunix", "bitget"] },
  "/api/account": { signed: "query", venues: ["bitunix", "bitget"] },
  // Read actions (`pending`, `history`) reach Bitunix as a signed GET; the
  // four write actions sign their body and POST it. The `query` default covers
  // the two readers, the map the four writers.
  "/api/tpsl": {
    signed: "query",
    signedByAction: {
      cancel: "body",
      modify: "body",
      place: "body",
      "place-position": "body",
    },
    venues: ["bitunix"],
  },
  "/api/leverage-margin-mode": { signed: "query", venues: ["bitunix"] },
  "/api/sync": { signed: "query", venues: ["bitunix"] },
  "/api/sync/orders": { signed: "query", venues: ["bitunix"] },
  "/api/sync/order-detail": { signed: "query", venues: ["bitunix"] },
  "/api/sync/positions-history": { signed: "query", venues: ["bitunix"] },
  "/api/sync/positions-pending": { signed: "query", venues: ["bitunix"] },
} as const satisfies Record<string, RouteSigningPlan>;

export type MigratedRoute = keyof typeof ROUTE_SIGNING_PLAN;

const MIGRATED_ROUTES = Object.keys(ROUTE_SIGNING_PLAN) as MigratedRoute[];

/**
 * Resolves a path to its plan row, ignoring any query string or hash.
 *
 * Returns `null` for an unmigrated route. Callers must treat `null` as "this
 * route still carries a raw secret" rather than as an error — the cutover is
 * incremental, so an unknown route is the normal case until the last PR lands.
 */
export function planForRoute(path: string): RouteSigningPlan | null {
  const [pathname] = path.split(/[?#]/);
  // Normalise before the lookup: a caller that cannot see a path variant cannot
  // protect it, and this function's miss becomes a silent `return` in the guard.
  // SvelteKit's `trailingSlash: 'never'` answers a trailing slash with a 308
  // before any handler runs, but that is the first line of defence, not this
  // one — a future endpoint may export `trailingSlash: 'ignore'`, and then the
  // request arrives here verbatim.
  const normalized = pathname.replace(/^\/+/, "/").replace(/(.)\/+$/, "$1");
  const match = MIGRATED_ROUTES.find((route) => route === normalized);
  return match ? ROUTE_SIGNING_PLAN[match] : null;
}

/**
 * `true` when the route is Bitget-reachable and therefore needs the passphrase
 * header.
 *
 * ADR-0013 carries a named exception permitting the Bitget passphrase to
 * transit; nothing else may. Driving the header off the table rather than off
 * the presence of `keys.passphrase` is what keeps a Bitunix request from
 * carrying a credential Bitunix never asked for.
 */
export function routeTakesPassphrase(route: RouteSigningPlan): boolean {
  return route.venues.includes("bitget");
}

/**
 * `true` when the route reaches Bitunix and therefore needs the nonce header.
 *
 * Bitunix folds a nonce into the prehash alongside the timestamp; Bitget has no
 * such field. A Bitunix request that arrived without one cannot be forwarded, so
 * the envelope reader refuses it as a missing envelope rather than sending an
 * empty nonce the venue would reject with a less legible error.
 */
export function routeTakesNonce(route: RouteSigningPlan): boolean {
  return route.venues.includes("bitunix");
}

/**
 * The shape *this* request is signed with — the route's own, unless `action`
 * names one of the route's exceptions.
 *
 * Both readers call this rather than reading `signed` themselves. On `/api/tpsl`
 * that is load-bearing: an envelope built for a query signature and checked as a
 * body one is a `PRESIGNED_DIVERGENCE` on a write, mid-trade. Sharing the
 * resolution is what makes the two sides agree about which shape a given
 * `action` has.
 */
export function signatureShapeFor(route: RouteSigningPlan, action?: string): SignatureShape {
  if (action === undefined) return route.signed;
  return route.signedByAction?.[action] ?? route.signed;
}

/**
 * The `action` a Cachy request URL carries, or `undefined` when it carries none.
 *
 * This is where a route whose shape varies learns which shape applies. It has to
 * be the URL: on a body-signed route the request body *is* the bytes the venue
 * signature covers, so the discriminator cannot ride inside it without becoming
 * part of the signature, and it cannot ride in `x-api-query`, which a body-signed
 * route ignores by design.
 *
 * Both sides read this from the same place — the browser from the path it is
 * about to call, the server from the URL it received — so neither can declare a
 * shape the other disagrees with. A route that does not vary its shape never has
 * one here and falls back to `signed`.
 */
export function cachyAction(path: string): string | undefined {
  const queryStart = path.indexOf("?");
  if (queryStart === -1) return undefined;
  const query = new URLSearchParams(path.slice(queryStart + 1));
  return query.get("action") ?? undefined;
}

/**
 * Bitunix only. `localeCompare`, not `<`, on purpose: this reproduces the
 * ordering `generateBitunixSignature` uses, and a different comparator reorders
 * the query string and therefore changes the signature.
 *
 * It is *not* the Bitget rule. `signBitgetRequest` and `generateBitgetSignature`
 * take the parameters in insertion order and do not sort at all, so this
 * comparator applied to a Bitget route would reorder the prehash. A3/A4 must not
 * reach for it on the Bitget half of the table.
 */
export function canonicalQueryString(params: Record<string, string>): string {
  return new URLSearchParams(
    Object.entries(params).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)),
  ).toString();
}

/**
 * The Bitunix prehash's query component: sorted `key + value` pairs with no
 * delimiter, per `docs/bitunix-api/01_sign.md`.
 *
 * Distinct from `canonicalQueryString` — that one is the URL representation
 * (`key=value&`), this one is the signature input. Both are needed and neither
 * substitutes for the other.
 */
export function canonicalQueryParamsInput(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");
}
