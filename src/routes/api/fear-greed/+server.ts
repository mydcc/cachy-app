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

// FEAT-0816 — the published crypto fear-and-greed index, for a veto that skips
// a setup at an extreme. One aggregate, named on the reading it produces
// (ADR-0029 decision 1).
//
// The request takes no parameters at all, so there is nothing here that could
// describe the trader: no symbol, no rule, no identity. The index is the same
// number for everyone and is cached under one key for everyone (decision 7).
//
// Five minutes of cache for a value published once a day: the point is not
// freshness but a ceiling on how often this process asks, since every armed
// rule naming the feed reads through this one entry.
const CACHE_TTL_MS = 300_000;

export const GET: RequestHandler = async ({ fetch }) => {
  try {
    const data = await cache.getOrFetch(
      "fear-greed:alternative-me",
      async () => {
        const response = await fetchWithTimeout(
          "https://api.alternative.me/fng/?limit=1",
          {},
          DEFAULT_UPSTREAM_TIMEOUT_MS,
          fetch,
        );

        if (!response.ok) {
          throw { status: response.status, message: await response.text() };
        }
        return safeJsonParse(await response.text());
      },
      CACHE_TTL_MS,
    );

    return json(data);
  } catch (error: unknown) {
    return marketDataErrorResponse(error, "fear-greed");
  }
};
