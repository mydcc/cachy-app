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

export const GET: RequestHandler = async ({ url, fetch }) => {
  const symbols = url.searchParams.get("symbols");
  const provider = url.searchParams.get("provider") || "bitunix";
  const type = url.searchParams.get("type"); // 'price' (default) or '24hr'

  const cacheKey = `tickers:${provider}:${symbols || "ALL"}:${type || "default"}`;

  try {
    const data = await cache.getOrFetch(
      cacheKey,
      async () => {
        let apiUrl = "";
        if (provider === "bitget") {
          // Bitget Futures API
          if (symbols) {
             let sym = symbols.toUpperCase();
             if (!sym.includes("_")) sym += "_UMCBL";
             apiUrl = `https://api.bitget.com/api/mix/v1/market/ticker?symbol=${sym}`;
          } else {
             // All tickers
             apiUrl = `https://api.bitget.com/api/mix/v1/market/tickers?productType=umcbl`;
          }
        } else {
          // Default to Bitunix
          apiUrl = `https://fapi.bitunix.com/api/v1/futures/market/tickers`;
          if (symbols) {
            apiUrl += `?symbols=${symbols}`;
          }
        }

        const response = await fetch(apiUrl);

        if (!response.ok) {
          const errorText = await response.text();
          try {
            const data = safeJsonParse(errorText);
            if (
              data.code === 2 ||
              data.code === "2" ||
              (data.msg && data.msg.toLowerCase().includes("system error"))
            ) {
              // eslint-disable-next-line no-throw-literal
              throw { status: 404, message: "Symbol not found" };
            }
          } catch (e: any) {
            if (e.status === 404) throw e;
          }
          // eslint-disable-next-line no-throw-literal
          throw { status: response.status, message: errorText };
        }

        const text = await response.text();
        const data = safeJsonParse(text);
        if (
          provider !== "bitget" && // Bitget uses code 00000, handled below generally?
          data &&
          (data.code === 2 ||
            data.code === "2" ||
            (data.msg && data.msg.toLowerCase().includes("system error")))
        ) {
          // eslint-disable-next-line no-throw-literal
          throw { status: 404, message: "Symbol not found" };
        }

        return data;
      },
      1000,
    ); // 1 second TTL

    return json(data);
  } catch (error: any) {
    if (error && error.status && error.message) {
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
