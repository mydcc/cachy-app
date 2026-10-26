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

import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { cache } from "#lib/server/cache.js";
import { safeJsonParse } from "../../../utils/safeJson";
import { fetchWithTimeout, DEFAULT_UPSTREAM_TIMEOUT_MS } from "../../../utils/server/fetchWithTimeout";
import { VENUES, DEFAULT_VENUE_ID, resolveVenue } from "../../../utils/server/venues";
import { isStatusError } from "../../../utils/server/httpErrors";
import { marketDataErrorResponse } from "../../../utils/server/marketDataError";
import { sanitizeSymbolList } from "../../../utils/server/symbolParam";

export const GET: RequestHandler = async ({ url, fetch }) => {
  const rawSymbols = url.searchParams.get("symbols");
  // Sanitised before both sinks — the venue URL and the cache key. The raw
  // string used to be able to append `&foo=bar` to the Bitunix request and
  // became its own cache entry (BUG-0723). Uppercasing also folds
  // `btcusdt`/`BTCUSDT` into one entry.
  const symbols = rawSymbols === null ? null : sanitizeSymbolList(rawSymbols);
  if (rawSymbols !== null && symbols === "") {
    return json({ message: "Invalid 'symbols' parameter" }, { status: 400 });
  }

  const provider = url.searchParams.get("provider") || "bitunix";
  const type = url.searchParams.get("type"); // 'price' (default) or '24hr'

  // As on the klines route, an unrecognised provider is served Bitunix data
  // rather than rejected.
  const venue = resolveVenue(provider) ?? VENUES[DEFAULT_VENUE_ID];

  // The "all tickers" key and an explicit filter can never collide: the
  // sentinel is outside the sanitised alphabet (BUG-0723).
  const cacheKey =
    symbols === null
      ? `tickers:${provider}:all:${type || "default"}`
      : `tickers:${provider}:filter:${symbols}:${type || "default"}`;

  try {
    const data = await cache.getOrFetch(
      cacheKey,
      async () => {
        const apiUrl = venue.tickersUrl({ symbols });

        const response = await fetchWithTimeout(apiUrl, {}, DEFAULT_UPSTREAM_TIMEOUT_MS, fetch);

        if (!response.ok) {
          const errorText = await response.text();
          let data: unknown;
          try {
            data = safeJsonParse(errorText);
          } catch {
            // Upstream body wasn't JSON; fall through to the generic error below.
          }

          if (venue.isSymbolNotFoundBody(data)) {
            throw { status: 404, message: "Symbol not found" };
          }

          throw { status: response.status, message: errorText };
        }

        const text = await response.text();
        const data = safeJsonParse(text);
        if (venue.isSymbolNotFoundBody(data)) {
           
          throw { status: 404, message: "Symbol not found" };
        }

        return data;
      },
      1000,
    ); // 1 second TTL

    return json(data);
  } catch (error: unknown) {
    // 404 is our own "unknown symbol" answer, not upstream text; clients render
    // it directly. Every other status goes through the generic boundary.
    if (isStatusError(error) && error.status === 404) {
      return new Response("Symbol not found", { status: 404 });
    }
    return marketDataErrorResponse(error, "tickers");
  }
};
