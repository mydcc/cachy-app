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
  // Eleven actions ride this one route and only three of them reach Bitunix as
  // a signed GET: `pending`, `history` and `order-detail`, which is why the map
  // covers those three and nothing else. The other eight — `place-order`,
  // `close-position`, `modify-order`, `cancel-order`, `cancel-all`,
  // `close-all-positions`, `flash-close-position` — are signed POST bodies on
  // *both* venues, so the route's `body` default is their shape and no action
  // here needs a per-venue override. Bitunix documents the four writes as
  // `POST` with the parameters in the body (`docs/bitunix-api/07_trade.md`:
  // `cancel_orders`, `cancel_all_orders`, `close_all_position`,
  // `flash_close_position`), which is also how `bitunix.ts` sends them.
  "/api/orders": {
    signed: "body",
    signedByAction: {
      pending: "query",
      history: "query",
      "order-detail": "query",
    },
    venues: ["bitunix", "bitget"],
  },
  // Bitunix alone, although the route still takes an `exchange` field:
  // `venues/bitget.ts` resolves to `null` for every action in this family
  // (Bitget wires none of the four), so listing it here would let a Bitget
  // account sign a request that can only be refused. Naming one venue is what
  // makes the client refuse before the envelope is built, rather than after.
  "/api/account-settings": { signed: "body", venues: ["bitunix"] },
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

/**
 * The URL form of `params` as **this venue** serialises it.
 *
 * Bitunix sorts; Bitget takes insertion order — see the warning on
 * `canonicalQueryString` above, which is the Bitunix half of this rule and
 * must not be applied to a Bitget route. A server rebuilds a signed query
 * through here so the comparison against `x-api-query` is the same
 * serialisation the client signed rather than a second opinion about it.
 *
 * The parameter *record* is the caller's; only the order differs. That is why
 * the two query-param builders can be shared while this stays venue-aware.
 */
export function queryStringForVenue(venue: Venue, params: Record<string, string>): string {
  return venue === "bitunix"
    ? canonicalQueryString(params)
    : new URLSearchParams(params).toString();
}

/**
 * The Bitget endpoint a migrated route proxies.
 *
 * Bitget folds the request path into its prehash
 * (`timestamp + METHOD + path + body`), so the *client* has to sign with the
 * same string the server forwards. That makes the path shared knowledge in a
 * way Bitunix's prehash does not: Bitunix's covers only
 * `nonce + timestamp + apiKey + queryParams + body`, so nothing on the Bitunix
 * half of these routes changes when an upstream path is renamed.
 *
 * Only Bitget's rows live here, and `bitget.ts` reads them from here rather
 * than repeating the literals — a client and a server that disagree about this
 * string produce a venue rejection mid-trade and nothing earlier. A3's
 * conformance test carries its own sample paths on purpose: it pins the
 * serialisation of whatever a route passes, so it cannot detect a wrong path
 * and does not claim to.
 *
 * Returns `null` for a route or action Bitget does not reach, which a caller
 * treats as "this request cannot be signed for Bitget" rather than as an empty
 * path.
 */
const BITGET_UPSTREAM_PATHS: Record<string, string> = {
  "/api/account": "/api/mix/v1/account/account",
  // Bitget serves balance and account data from the same endpoint; the two
  // Cachy routes differ in how they map the answer, not in where they ask.
  "/api/balance": "/api/mix/v1/account/account",
  "/api/positions": "/api/mix/v1/position/allPosition",
};

/**
 * `/api/orders` is one Cachy route over several endpoints, so its paths are
 * keyed by the action the request carries. Repeating an endpoint is not a
 * redundancy to factor out: `place-order` and `close-position` are genuinely
 * different actions that Bitget happens to serve from one path, and a future
 * divergence between them belongs here, not behind a shared constant.
 */
const BITGET_ORDER_PATHS: Record<string, string> = {
  "place-order": "/api/mix/v1/order/placeOrder",
  "close-position": "/api/mix/v1/order/placeOrder",
  "cancel-order": "/api/mix/v1/order/cancel-order",
  // The two query-signed reads. `order-detail` has no row on purpose: Bitget
  // wires none of that action (`venues/bitget.ts` answers `null`), and a row
  // here would let a Bitget account sign a request the venue module then
  // refuses — the refusal belongs at the signer, before an envelope exists.
  pending: "/api/mix/v1/order/current",
  history: "/api/mix/v1/order/history",
};

export function bitgetUpstreamPath(cachyPath: string, action?: string): string | null {
  const [pathname] = cachyPath.split(/[?#]/);
  if (pathname === "/api/orders") {
    return action === undefined ? null : (BITGET_ORDER_PATHS[action] ?? null);
  }
  return BITGET_UPSTREAM_PATHS[pathname] ?? null;
}
