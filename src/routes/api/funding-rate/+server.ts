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
import { isStatusError } from "../../../utils/server/httpErrors";
import { sanitizeSymbol } from "../../../utils/server/symbolParam";

// Bitunix funding rate proxy:
// 1. If `symbol` is specified: proxies GET /api/v1/futures/market/get_funding_rate_history
// 2. If no `symbol`: proxies GET /api/v1/futures/market/funding_rate/batch (all pairs)
export const GET: RequestHandler = async ({ url, fetch }) => {
  const provider = url.searchParams.get("provider") || "bitunix";
  const rawSymbol = url.searchParams.get("symbol");
  // Sanitised before it reaches either sink — the upstream URL and the cache
  // key. The key used to carry the raw string, so `BTCUSDT&x=1` addressed an
  // entry no other caller could produce (BUG-0723).
  const symbol = rawSymbol === null ? null : sanitizeSymbol(rawSymbol);
  const limit = url.searchParams.get("limit") || "30";

  if (provider !== "bitunix") {
    return json({ message: "Unsupported provider" }, { status: 400 });
  }

  if (rawSymbol !== null && symbol === "") {
    return json({ message: "Invalid 'symbol' parameter" }, { status: 400 });
  }

  const cacheKey = symbol
    ? `funding-rate-history:${provider}:${symbol}:${limit}`
    : `funding-rate:${provider}`;

  try {
    const data = await cache.getOrFetch(
      cacheKey,
      async () => {
        let apiUrl = "https://fapi.bitunix.com/api/v1/futures/market/funding_rate/batch";
        if (symbol) {
          const parsedLimit = parseInt(limit, 10);
          const validLimit = isNaN(parsedLimit) ? 30 : Math.min(Math.max(parsedLimit, 1), 200);
          apiUrl = `https://fapi.bitunix.com/api/v1/futures/market/get_funding_rate_history?symbol=${encodeURIComponent(symbol)}&limit=${validLimit}`;
        }
        const response = await fetchWithTimeout(apiUrl, {}, DEFAULT_UPSTREAM_TIMEOUT_MS, fetch);

        if (!response.ok) {
          const errorText = await response.text();
          throw { status: response.status, message: errorText };
        }

        const text = await response.text();
        return safeJsonParse(text);
      },
      30000,
    );

    return json(data);
  } catch (error: unknown) {
    if (isStatusError(error)) {
      return new Response(error.message, {
        status: error.status,
      });
    }

    const message =
      error instanceof Error ? error.message : "An unknown error occurred.";
    return json(
      { message: `Internal server error: ${message}` },
      { status: 500 },
    );
  }
};
