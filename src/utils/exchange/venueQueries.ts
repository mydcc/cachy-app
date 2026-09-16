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
 * Query-parameter construction for the query-signed routes (FEAT-0405 A3).
 *
 * `venueBodies` covers the routes whose signature is over the body; this is the
 * same idea for the ones whose signature is over the query. The server rebuilds
 * the parameters the client signed and compares, so every default, clamp and
 * empty-value filter has to be applied on both sides. A default that only one
 * side applies is not a subtle bug — it is a `PRESIGNED_DIVERGENCE` on the next
 * request, and the reason these live in one module instead of inline in the
 * route that happens to need them.
 *
 * Key order does not matter here: the client's signer and the server's rebuild
 * both sort through `canonicalQueryString`. Values do.
 *
 * Browser-safe: no `node:*` imports, no server-only SvelteKit modules.
 */

/** Bitunix's page-size ceiling for the history endpoints. */
const HISTORY_LIMIT_DEFAULT = 50;
const POSITIONS_HISTORY_LIMIT_MAX = 100;
const SYNC_LIMIT_DEFAULT = 50;
const SYNC_LIMIT_MAX = 100;

export function buildOrderDetailQueryParams(orderId: string): Record<string, string> {
  return { orderId };
}

/**
 * `marginCoin` defaults to USDT because the venue's endpoint answers for a
 * single margin coin and every Cachy position is USDT-margined; the default
 * lives here rather than in the route's schema so the client sends the same
 * thing the server tests against.
 */
export function buildLeverageMarginModeQueryParams(input: {
  symbol: string;
  marginCoin?: string;
}): Record<string, string> {
  return {
    symbol: input.symbol,
    marginCoin: input.marginCoin ?? "USDT",
  };
}

/**
 * History of positions. `limit` is clamped to the venue's page-size ceiling
 * (Maximum: 100 per the Bitunix docs) rather than rejected — the client and
 * the server both build through this function, so a clamp keeps the two sides
 * in agreement and the request always venue-valid. Callers asking for more
 * than one page need the walk, not a bigger number.
 */
export function buildPositionsHistoryQueryParams(input: {
  limit?: number;
}): Record<string, string> {
  const requested = Number(input.limit ?? HISTORY_LIMIT_DEFAULT);
  const limit = Number.isNaN(requested)
    ? HISTORY_LIMIT_DEFAULT
    : Math.min(Math.max(requested, 1), POSITIONS_HISTORY_LIMIT_MAX);
  return { limit: String(limit) };
}

/**
 * History of trades. `limit` is clamped rather than rejected — the route used to
 * do this in its Zod transform, and a rejected sync is worse than a sync that
 * asked for a page size the venue allows.
 */
export function buildSyncQueryParams(input: {
  limit?: number | string;
  startTime?: number;
  endTime?: number;
}): Record<string, string> {
  const requested = Number(input.limit ?? SYNC_LIMIT_DEFAULT);
  const limit = Number.isNaN(requested)
    ? SYNC_LIMIT_DEFAULT
    : Math.min(Math.max(requested, 1), SYNC_LIMIT_MAX);

  const params: Record<string, string> = { limit: String(limit) };
  // Truthiness, not `!== undefined`: a zero timestamp is not a filter, and the
  // route has always dropped it.
  if (input.startTime) params.startTime = String(input.startTime);
  if (input.endTime) params.endTime = String(input.endTime);
  return params;
}

/**
 * One page of order history, walked by `endTime`.
 *
 * Pagination is the caller's: each page carries a different `endTime` derived
 * from the previous response, so each page is a different signed query and no
 * single envelope can cover the walk.
 */
export function buildSyncOrdersQueryParams(input: {
  limit?: number;
  endTime?: number;
}): Record<string, string> {
  const params: Record<string, string> = { limit: String(input.limit ?? 100) };
  if (input.endTime) params.endTime = String(input.endTime);
  return params;
}

/**
 * TP/SL read actions (`pending`, `history`). Empty strings are dropped, not just
 * `undefined` and `null`: a filter the caller left blank means "no filter" to
 * the venue, and sending it changes the signed query for no reason.
 */
export function buildTpslReadQueryParams(
  params: Record<string, unknown>,
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    cleaned[key] = String(value);
  }
  return cleaned;
}

/**
 * TP/SL write actions (`cancel`, `modify`, `place`, `place-position`).
 *
 * `null` is dropped here too, because the venue reads an explicit null as a
 * value rather than as absence, but an empty string is kept: these bodies carry
 * fields the venue distinguishes from "not sent".
 *
 * Returns the serialised body, not an object, because these are the bytes the
 * signature covers — the same reason `buildVenueBody` returns a string.
 */
export function buildTpslWriteBody(params: Record<string, unknown>): string {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    cleaned[key] = value;
  }
  return JSON.stringify(cleaned);
}
