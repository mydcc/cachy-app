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

import { MemoryCache } from "./cache";
import {
  klineCacheKey,
  klineCacheTtlMs,
  type NormalizedKlineRequest,
} from "./klineCacheKey";

/**
 * The kline cache, separate from the shared singleton.
 *
 * Kline keys rotate — one per candle boundary, per symbol, per timeframe —
 * while the routes on the shared cache use a handful of long-lived keys. One
 * map for both would let a burst of kline traffic evict the ticker and
 * funding-rate entries, which are the two a user sees a stale price because
 * of. Separate maps, separate failure modes.
 *
 * A miss costs exactly what it costs today without a cache: one venue
 * request. So the bound is set for the memory, not for correctness.
 */
const klineCache = new MemoryCache(500);

export type KlineFetcher = () => Promise<unknown>;

/**
 * Fetches a kline response, or serves a still-valid one.
 *
 * The venue is called through `fetchFn` and nothing else. The request the
 * venue sees is the one the caller built, verbatim: the key is normalized but
 * the call is not, so no response a caller would get today is replaced by a
 * differently-scoped one.
 *
 * Because a rolling entry's TTL is the current candle's remaining lifetime,
 * such an entry is only ever served during the candle it was fetched in. The
 * newest forming bar it carries is therefore at most one bar old — and a
 * forming bar's close is not a settled value in the first place. The live
 * price never comes from here; it arrives over the venue's WebSocket.
 */
export async function getCachedKlines(
  request: NormalizedKlineRequest,
  fetchFn: KlineFetcher,
  now: number = Date.now(),
): Promise<unknown> {
  return klineCache.getOrFetch(
    klineCacheKey(request, now),
    fetchFn,
    klineCacheTtlMs(request, now),
  );
}

/** Test-only: drops every cached kline response. */
export function clearKlineCache(): void {
  klineCache.clear();
}
