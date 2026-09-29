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

import { safeTfToMs } from "../../utils/timeUtils";
import type { KlinePriceSource } from "../../utils/server/venues/types";

/**
 * Cache-key derivation for `/api/klines`.
 *
 * The client's initial history fetch asks for the newest candles with
 * `endTime = Date.now()` — millisecond precision, see
 * `marketWatcher/historyFetcher.ts:70` and `:128`. Every request therefore
 * produces a URL that never repeats, and a cache keyed on the raw request is
 * structurally incapable of hitting. That is not a tuning problem; it is the
 * key derivation.
 *
 * Flooring the requested end to the candle boundary fixes it. Every request
 * made during the same candle resolves to the same key, and the answer only
 * changes when the candle does — which is exactly what the TTL expresses.
 *
 * This module derives a key. It does not fetch, store, or decide freshness.
 */

/** A TTL under one second buys nothing over the next key. */
const MIN_TTL_MS = 1000;

/**
 * How long a pinned historical range stays cached.
 *
 * Long is safe here: a gap the venue fills afterwards appears in the next page
 * the client fetches, and `ensureHistory` re-reads and merges.
 */
export const HISTORICAL_TTL_MS = 5 * 60_000;

export interface NormalizedKlineRequest {
  provider: string;
  symbol: string;
  interval: string;
  limit: number;
  /** `null` for a rolling window; a ms timestamp for an explicit range. */
  start: number | null;
  end: number | null;
  priceSource: KlinePriceSource;
}

/** Rounds a timestamp down to the candle that contains it. */
export function floorToBar(timestamp: number, interval: string): number {
  const intervalMs = safeTfToMs(interval);
  return Math.floor(timestamp / intervalMs) * intervalMs;
}

/** The start of the candle that is currently forming. */
export function currentBarStart(interval: string, now: number): number {
  return floorToBar(now, interval);
}

/**
 * The candle boundary a request resolves to.
 *
 * An explicit `end` in the past resolves to its own candle, which never
 * changes again. A missing `end` — or one inside the forming candle —
 * resolves to the candle in progress, which changes every bar.
 */
export function effectiveBarStart(
  request: Pick<NormalizedKlineRequest, "end" | "interval">,
  now: number,
): number {
  const open = currentBarStart(request.interval, now);
  if (request.end === null) return open;
  const floored = floorToBar(request.end, request.interval);
  return floored > open ? open : floored;
}

/**
 * Cache key for a normalized request.
 *
 * Every field that changes the response is in the key, including
 * `priceSource`: a mark-price series and a last-price series for the same
 * symbol are different answers, and serving one for the other is the bug
 * BUG-0558 is about.
 */
export function klineCacheKey(
  request: NormalizedKlineRequest,
  now: number,
): string {
  const parts = [
    "klines",
    request.provider,
    request.symbol,
    request.interval,
    String(request.limit),
    request.start === null
      ? "-"
      : String(floorToBar(request.start, request.interval)),
    String(effectiveBarStart(request, now)),
    request.priceSource,
  ];
  return parts.join(":");
}

/**
 * How long the entry resolved at `now` stays valid.
 *
 * A rolling window is only true until the current candle closes, so its TTL is
 * that candle's remaining lifetime. A pinned range does not change at all, so
 * it gets the flat window above.
 */
export function klineCacheTtlMs(
  request: Pick<NormalizedKlineRequest, "end" | "interval">,
  now: number,
): number {
  const intervalMs = safeTfToMs(request.interval);
  const open = currentBarStart(request.interval, now);
  // Strictly before the forming candle, or the answer still moves. A window
  // ending inside the current bar carries a bar the venue is still writing,
  // so freezing it for minutes would pin a value that has not settled — and
  // that is the shape historyFetcher sends on every cold start, because it
  // asks with endTime = Date.now().
  const pinned =
    request.end !== null && floorToBar(request.end, request.interval) < open;
  if (pinned) {
    return HISTORICAL_TTL_MS;
  }
  return Math.max(MIN_TTL_MS, open + intervalMs - now);
}

/**
 * The route is public and the venue is the rate-limit bottleneck, so a
 * `limit` larger than anything a caller can legitimately use is capped rather
 * than forwarded. A caller asking for a million rows gets the ceiling the
 * venue itself serves, not a request the venue has to reject.
 */
export const MAX_KLINE_LIMIT = 1000;

export function clampKlineLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 1;
  return Math.min(Math.floor(limit), MAX_KLINE_LIMIT);
}
