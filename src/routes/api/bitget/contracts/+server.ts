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
import { safeJsonParse } from "../../../../utils/safeJson";
import { fetchWithTimeout, DEFAULT_UPSTREAM_TIMEOUT_MS } from "../../../../utils/server/fetchWithTimeout";
import { isStatusError } from "../../../../utils/server/httpErrors";

// Public, no auth. Bitget V2 mix contracts (precision, size limits, leverage
// range, status per instrument) change rarely, so a longer TTL is fine.
// BUG-0501: the second venue's metadata source — V1 (/api/mix/v1/...) is
// decommissioned and answers 30032, so this is V2 or nothing.
export const GET: RequestHandler = async ({ url, fetch }) => {
  const symbols = url.searchParams.get("symbols");
  const cacheKey = `bitget-contracts:${symbols || "ALL"}`;
  const wanted = (symbols || "")
    .split(",")
    .map((s) => s.trim().toUpperCase().replace(/_UMCBL$/, ""))
    .filter((s) => s.length > 0);

  try {
    const data = await cache.getOrFetch(
      cacheKey,
      async () => {
        const apiUrl =
          "https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES";

        const response = await fetchWithTimeout(apiUrl, {}, DEFAULT_UPSTREAM_TIMEOUT_MS, fetch);
        if (!response.ok) {
          const errorText = await response.text();
          throw { status: response.status, message: errorText };
        }

        const text = await response.text();
        const parsed = safeJsonParse(text) as {
          code?: unknown;
          msg?: unknown;
          data?: Array<{ symbol?: unknown } & Record<string, unknown>>;
        };
        if (!parsed || !Array.isArray(parsed.data)) return parsed;
        if (wanted.length === 0) return parsed;
        return {
          ...parsed,
          data: parsed.data.filter((row) =>
            wanted.includes(String(row.symbol || "").toUpperCase()),
          ),
        };
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
