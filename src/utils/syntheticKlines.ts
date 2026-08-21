/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import Decimal from "decimal.js";
import { safeTfToMs } from "./timeUtils";

/**
 * Aggregation state for synthetic timeframes (2m, 3m, 9m, ...).
 *
 * Bitunix only streams native intervals over WebSocket (1m, 5m, 15m, ...).
 * Synthetic timeframes are subscribed to their base feed and must be merged
 * client-side into the target bucket — otherwise charts on those timeframes
 * receive no live updates at all.
 */

export interface SyntheticCandle {
    time: number;
    open: string | number;
    high: string | number;
    low: string | number;
    close: string | number;
    volume: string | number;
}

// Internal aggregation state is strictly numeric — inputs may arrive as
// strings (NormalizedKline carries raw wire values), so every merge converts
// through Number() and volume sums through Decimal.
interface BucketCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: string;
}

const buckets = new Map<string, BucketCandle>();

function bucketKey(symbol: string, timeframe: string): string {
    return `${symbol}:${timeframe}`;
}

/**
 * Drops stored aggregation state. Called when a synthetic subscription goes
 * away so stale buckets cannot leak memory or pollute a future subscription
 * with old partial candles. Without arguments clears everything (tests).
 */
export function resetSyntheticCandles(symbol?: string, timeframe?: string): void {
    if (!symbol && !timeframe) {
        buckets.clear();
        return;
    }
    for (const key of Array.from(buckets.keys())) {
        const sep = key.lastIndexOf(":");
        if (sep === -1) continue;
        const sym = key.slice(0, sep);
        const tf = key.slice(sep + 1);
        if ((!symbol || sym === symbol) && (!timeframe || tf === timeframe)) {
            buckets.delete(key);
        }
    }
}

/**
 * Merges one base-timeframe candle into the currently open bucket of a
 * synthetic timeframe (e.g. a 1m push into the open 3m bucket).
 *
 * - The bucket time is floor-aligned to the TARGET timeframe boundary.
 * - Within a bucket: high takes the max, low the min, close the latest,
 *   volume is summed (Decimal to avoid float drift).
 * - Crossing a bucket boundary starts a fresh candle from the incoming open.
 *
 * Returns the aggregated candle for the synthetic timeframe, or null when the
 * timeframe cannot be parsed.
 */
export function aggregateIntoSyntheticBucket(
    symbol: string,
    timeframe: string,
    candle: SyntheticCandle,
): SyntheticCandle | null {
    const bucketMs = safeTfToMs(timeframe, 0);
    if (!bucketMs || bucketMs <= 0 || !Number.isFinite(candle.time)) return null;

    const bucketTime = Math.floor(candle.time / bucketMs) * bucketMs;
    const key = bucketKey(symbol, timeframe);
    const prev = buckets.get(key);

    if (!prev || prev.time !== bucketTime) {
        const fresh: BucketCandle = {
            time: bucketTime,
            open: Number(candle.open),
            high: Number(candle.high),
            low: Number(candle.low),
            close: Number(candle.close),
            volume: String(candle.volume),
        };
        buckets.set(key, fresh);
        return { ...fresh };
    }

    prev.high = Math.max(prev.high, Number(candle.high));
    prev.low = Math.min(prev.low, Number(candle.low));
    prev.close = Number(candle.close);
    prev.volume = new Decimal(String(prev.volume))
        .plus(new Decimal(String(candle.volume)))
        .toString();
    return { ...prev };
}
