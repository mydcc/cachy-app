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

/**
 * FEAT-0438 — a recorded market series, as opposed to the generated one.
 *
 * ## What this is, and why it exists next to `candleSeries.ts`
 *
 * `src/lib/rules/__fixtures__/candleSeries.ts` is a seeded pseudo-random walk.
 * It is deterministic and it catches what usually breaks in condition code —
 * indexing, warmup, cross direction — and FEAT-0028 says so plainly. What it
 * cannot catch is a condition that only misbehaves on a shape a real market
 * produces and the generator does not: a gap, a volume spike two orders of
 * magnitude above the median, a run that trends for days without reverting.
 *
 * This series has all three. 1000 closed hourly candles of BTCUSDT, roughly 42
 * days, trending 62.5k to 81.7k with a pullback, and a volume range of 91 to
 * 17909 against a median of 851. A volume-anomaly condition tuned on the
 * generated walk meets numbers here it never met there.
 *
 * ## Why 1000 candles
 *
 * Warmup differs per indicator, and an indicator asserted before it has warmed
 * up is not tested, only observed to be absent. The convention the cross-path
 * work uses — assert only after three times the slow period — puts an MA-200
 * cross at 600 candles. 1000 covers every parameterisation `IndicatorRef` can
 * currently express and leaves headroom for the windowed operands ADR-0016
 * added, whose lookback is capped at `MAX_RULE_WARMUP_CANDLES = 500`.
 *
 * ## Why the volume numbers look like the wrong side of the pair
 *
 * They are, and deliberately. Bitunix names its kline volume fields inverted
 * from the convention: for BTCUSDT at 77k, `quoteVol` is about 435 (that is
 * BTC, the *base*) and `baseVol` is about 33.5 million (USDT, the *quote*).
 * `fetchBitunixKlines` in `src/utils/server/venues/bitunix.ts` maps
 * `volume <- quoteVol`, so the engine sees base volume. This fixture copies
 * that mapping rather than the conventionally correct one — a fixture carrying
 * quote volume would be a series the application never produces, and every
 * volume condition asserted against it would be asserted against numbers it
 * cannot meet in production.
 *
 * ## Data class
 *
 * Class C. Public market data for one symbol, carrying no watchlist, account
 * or identity of any kind. See `docs/adr/0001-local-first-boundary.md`.
 *
 * ## Re-capturing
 *
 * Do not. The asserted candle indices in `recordedHistoryConditions.test.ts`
 * are indices into *this* series; a fresh capture moves every one of them. If
 * the series must be replaced, the expectations are recomputed with it, in the
 * same change.
 */

import type { EvaluationCandle } from "../../lib/rules/types";
import fixture from "./btcusdt-1h-recorded.json";

export interface RecordedSeriesMeta {
  symbol: string;
  venue: string;
  timeframe: string;
  captured_at: string;
  count: number;
  first_open_time_ms: number;
  last_open_time_ms: number;
  /** Which upstream field became `volume`. See the note above. */
  volume_field: string;
}

export const RECORDED_SERIES_META: RecordedSeriesMeta = {
  symbol: fixture.symbol,
  venue: fixture.venue,
  timeframe: fixture.timeframe,
  captured_at: fixture.captured_at,
  count: fixture.count,
  first_open_time_ms: fixture.first_open_time_ms,
  last_open_time_ms: fixture.last_open_time_ms,
  volume_field: fixture.volume_field,
};

/** The recorded candles, oldest first, contiguous on the hour. */
export const RECORDED_CANDLES: EvaluationCandle[] = fixture.candles as EvaluationCandle[];

export const RECORDED_TIMEFRAME = fixture.timeframe as "1h";

/** Milliseconds between two candles in this series. */
export const RECORDED_STEP_MS = 3_600_000;
