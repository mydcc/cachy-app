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
import { cache } from "$lib/server/cache";
import { safeJsonParse } from "../../../utils/safeJson";
import { fetchWithTimeout } from "../../../utils/server/fetchWithTimeout";

interface StatusError {
  status: number;
  message: string;
}

function isStatusError(error: unknown): error is StatusError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    typeof (error as { status: unknown }).status === "number" &&
    typeof (error as { message: unknown }).message === "string"
  );
}

// Public, no auth. Precision/limits/leverage-range/status per symbol change
// rarely, so a longer TTL than tickers/klines is fine.
export const GET: RequestHandler = async ({ url, fetch }) => {
  const symbols = url.searchParams.get("symbols");
  const cacheKey = `trading-pairs:${symbols || "ALL"}`;

  try {
    const data = await cache.getOrFetch(
      cacheKey,
      async () => {
        let apiUrl = "https://fapi.bitunix.com/api/v1/futures/market/trading_pairs";
        if (symbols) apiUrl += `?symbols=${symbols}`;

        const response = await fetchWithTimeout(apiUrl);
        if (!response.ok) {
          const errorText = await response.text();
          throw { status: response.status, message: errorText };
        }

        const text = await response.text();
        return safeJsonParse(text);
      },
      60000,
    );

    return json(data);
  } catch (error: unknown) {
    if (isStatusError(error)) {
      return new Response(error.message, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    return json({ message: `Internal server error: ${message}` }, { status: 500 });
  }
};
