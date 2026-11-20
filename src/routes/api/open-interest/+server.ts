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
import { marketDataErrorResponse } from "../../../utils/server/marketDataError";
import { sanitizeSymbol } from "../../../utils/server/symbolParam";

// FEAT-0816 — platform-wide open interest for one USDT-M market, from Bitget's
// public endpoint (`docs/bitget-api/03_market.md`, "Get Open Interest"). Public
// market data: the request carries a symbol and nothing else, and the cache key
// is derived from the sanitised symbol alone (ADR-0029 decision 7).
//
// Bitget is the source for every market here, including one a rule trades on
// another venue: open interest is a fact about the market, not about the
// account, and the reading records which endpoint produced it.
const CACHE_TTL_MS = 30_000;
const PRODUCT_TYPE = "USDT-FUTURES";

export const GET: RequestHandler = async ({ url, fetch }) => {
  const rawSymbol = url.searchParams.get("symbol");
  const symbol = rawSymbol === null ? "" : sanitizeSymbol(rawSymbol);

  if (symbol === "") {
    return json({ message: "Invalid 'symbol' parameter" }, { status: 400 });
  }

  try {
    const data = await cache.getOrFetch(
      `open-interest:bitget:${symbol}`,
      async () => {
        const apiUrl = `https://api.bitget.com/api/v2/mix/market/open-interest?symbol=${encodeURIComponent(symbol)}&productType=${PRODUCT_TYPE}`;
        const response = await fetchWithTimeout(apiUrl, {}, DEFAULT_UPSTREAM_TIMEOUT_MS, fetch);

        if (!response.ok) {
          throw { status: response.status, message: await response.text() };
        }
        return safeJsonParse(await response.text());
      },
      CACHE_TTL_MS,
    );

    return json(data);
  } catch (error: unknown) {
    return marketDataErrorResponse(error, "open-interest");
  }
};
