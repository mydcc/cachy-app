/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Symbol sanitising for the public market-data routes (BUG-0723).
 *
 * These handlers interpolate the caller's symbol into an upstream URL and a
 * cache key. Neither place may carry a separator, a fragment or an extra
 * parameter: `BTCUSDT&limit=1000` would change the upstream request, and the
 * same string would also let one caller address a cache entry no other caller
 * can produce. The allow-list is the alphabet the venues use for symbols.
 *
 * One helper for all of them, because the audit found the routes disagreeing:
 * funding-rate sanitised, position-tiers and trading-pairs did not.
 *
 * It delegates to `src/types/bitunixValidation.ts` rather than introducing a
 * second helper with the same name: that one is the canonical alphabet and
 * also uppercases, which makes `BTCUSDT` and `btcusdt` one cache entry instead
 * of two. A case-preserving copy here would be the same inconsistency one
 * import away.
 */

import { sanitizeSymbol as sanitizeVenueSymbol } from "../../types/bitunixValidation";

/** Uppercases and strips everything outside the venue symbol alphabet. */
export const sanitizeSymbol = sanitizeVenueSymbol;

/**
 * Sanitises a comma-separated symbol list, dropping empty members.
 *
 * Returns `""` when nothing valid remains; callers treat that as an invalid
 * request rather than as "no filter", which would silently widen the query to
 * every pair.
 */
export function sanitizeSymbolList(raw: string): string {
  return raw
    .split(",")
    .map(sanitizeSymbol)
    .filter((symbol) => symbol.length > 0)
    .join(",");
}
