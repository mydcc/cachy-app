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

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { UpstreamApiError } from "../../../utils/server/fetchWithTimeout";
import { VENUES, DEFAULT_VENUE_ID, resolveVenue } from "../../../utils/server/venues";
import type { KlinePriceSource } from "../../../utils/server/venues/types";

type ApiError = UpstreamApiError;

export const GET: RequestHandler = async ({ url }) => {
  const symbol = url.searchParams.get("symbol");
  const interval = url.searchParams.get("interval") || "1d";
  const limitParam = url.searchParams.get("limit");
  const startParam =
    url.searchParams.get("startTime") || url.searchParams.get("start");
  const endParam =
    url.searchParams.get("endTime") || url.searchParams.get("end");
  const provider = url.searchParams.get("provider") || "bitunix";
  const priceSourceParam = url.searchParams.get("priceSource");
  const limit = limitParam ? parseInt(limitParam) : 50;
  const start = startParam ? parseInt(startParam) : undefined;
  const end = endParam ? parseInt(endParam) : undefined;

  if (!symbol) {
    return json({ error: "Symbol is required" }, { status: 400 });
  }

  // Only `mark` opts out of the default. An unrecognised spelling is rejected
  // rather than treated as `last`: a caller that misspells the series it wants
  // must not be handed the other one.
  if (priceSourceParam !== null && priceSourceParam !== "last" && priceSourceParam !== "mark") {
    return json(
      { error: `Unknown priceSource "${priceSourceParam}"; expected "last" or "mark"` },
      { status: 400 },
    );
  }
  const priceSource: KlinePriceSource = priceSourceParam === "mark" ? "mark" : "last";

  // An unrecognised provider has always been served Bitunix data rather than
  // rejected — keeping that fallback is what makes this a refactor.
  const venue = resolveVenue(provider) ?? VENUES[DEFAULT_VENUE_ID];

  // Refused, not silently downgraded. A mark-price alarm answered with
  // last-price candles is a wrong alarm that looks like a right one.
  if (priceSource === "mark" && !venue.supportsMarkKlines) {
    return json(
      { error: `${venue.id} does not serve mark-price klines` },
      { status: 501 },
    );
  }

  try {
    const klines = await venue.fetchKlines({
      symbol,
      interval,
      limit,
      start,
      end,
      priceSource,
    });
    return json(klines);
  } catch (e: unknown) {
    console.error(`Error fetching klines from ${provider}:`, e);

    let status = 500;
    let message = "Failed to fetch klines";

    if (e instanceof Error) {
      message = e.message;
      const apiError = e as ApiError;
      if (typeof apiError.status === 'number') {
        status = apiError.status;
      }
    } else if (typeof e === 'object' && e !== null && 'message' in e) {
      // Fallback for non-Error objects that might have a message
      message = String((e as { message: unknown }).message);
    }

    return json({ error: message }, { status });
  }
};
