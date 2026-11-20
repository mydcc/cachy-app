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

/**
 * FEAT-0816 — where each veto feed's number comes from, and what shape it
 * arrives in.
 *
 * One named source per feed (ADR-0029 decision 1), each recorded on the
 * reading it produces, so a suppression can still be read back when the
 * endpoint behind it has changed. Every response is validated before it is
 * believed: these are third-party aggregates outside our correctness control,
 * which is the whole reason ADR-0012 decision 7 keeps them out of triggers.
 *
 * The math in here is pure and tested; the fetches are thin and go through
 * Cachy's own proxy routes, which carry a symbol and nothing else -- no
 * identity, no rule, no watchlist (ADR-0029 decision 7).
 */

import { Decimal } from "decimal.js";
import { z } from "zod";
import type { FeedReading } from "../../lib/rules/feedReadings";
import { safeJsonParse } from "../../utils/safeJson";
import { fetchBitunixFundingRates } from "../api/marketData";
import { logger } from "../logger";

const MINUTE_MS = 60_000;

/** The funding batch carries no timestamp of its own; see `readFundingRate`. */
export const FUNDING_SOURCE = "bitunix:futures/market/funding_rate/batch";
export const OPEN_INTEREST_SOURCE = "bitget:mix/market/open-interest";
export const FEAR_GREED_SOURCE = "alternative.me:fng";

/**
 * How far apart two open-interest samples must be before their difference is
 * called a change, and how far apart they may be.
 *
 * Open interest is published as a level, not as a change, and nobody serves a
 * history we could replay (ADR-0029 decision 8). So the change is derived from
 * samples this session took: at least half an hour apart, or the number says
 * more about sampling noise than about the market, and at most two hours, or
 * it stops describing what is happening now.
 */
export const OI_MIN_SPAN_MS = 30 * MINUTE_MS;
export const OI_MAX_SPAN_MS = 120 * MINUTE_MS;

/**
 * A third-party number as a `Decimal`, or `undefined` when it is not one.
 *
 * `new Decimal("n/a")` throws rather than yielding something `isFinite()` can
 * refuse, and everything parsed in this module arrives from outside. A feed
 * that answers with a word must leave the feed unavailable, never take down
 * the pass that was reading it.
 */
function toDecimal(raw: string | number): Decimal | undefined {
  try {
    const value = new Decimal(String(raw));
    return value.isFinite() ? value : undefined;
  } catch {
    return undefined;
  }
}

/** One open-interest level as a source reported it. */
export interface OpenInterestSample {
  /** The source's own `ts`, not ours. */
  asOfMs: number;
  /** Platform-wide open interest in base coin, as delivered. */
  size: string;
}

/**
 * The open-interest change in **percent** over the widest usable sample span,
 * or `undefined` while the samples cannot support the claim.
 *
 * Percent, not a fraction: a trader writing "skip the setup when open interest
 * jumped more than five percent" types `5`. The funding rate next door is a
 * fraction because that is how an exchange publishes it, and the editor states
 * each unit rather than leaving the two to be guessed.
 *
 * Returns the newest sample's own timestamp, so the reading ages like the data
 * it describes and not like the moment this was computed.
 */
export function openInterestChangePercent(
  samples: readonly OpenInterestSample[],
): { value: string; asOfMs: number } | undefined {
  const ordered = [...samples].sort((a, b) => a.asOfMs - b.asOfMs);
  const newest = ordered[ordered.length - 1];
  if (newest === undefined) return undefined;

  // The newest sample that is already old enough: the window should be as
  // close to the minimum span as the samples allow, so the number describes
  // the recent move rather than the whole retention window.
  const inWindow = ordered.filter((sample) => {
    const span = newest.asOfMs - sample.asOfMs;
    return span >= OI_MIN_SPAN_MS && span <= OI_MAX_SPAN_MS;
  });
  const reference = inWindow[inWindow.length - 1];
  if (reference === undefined) return undefined;

  const from = toDecimal(reference.size);
  const to = toDecimal(newest.size);
  // A zero or unreadable level has no change to report. Not "0%", which would
  // read as a calm market, and not a division by zero either.
  if (from === undefined || to === undefined || from.lte(0)) return undefined;

  return {
    value: to.minus(from).dividedBy(from).times(100).toFixed(),
    asOfMs: newest.asOfMs,
  };
}

const OpenInterestResponse = z.object({
  data: z.object({
    ts: z.union([z.string(), z.number()]),
    openInterestList: z
      .array(z.object({ symbol: z.string(), size: z.union([z.string(), z.number()]) }))
      .min(1),
  }),
});

const FearGreedResponse = z.object({
  data: z
    .array(z.object({ value: z.union([z.string(), z.number()]), timestamp: z.union([z.string(), z.number()]) }))
    .min(1),
});

/**
 * A source's own timestamp field, as a number, or `undefined` when it is not
 * one.
 *
 * Timestamps only: the values this module compares against a trader's
 * threshold are `Decimal` end to end (`toDecimal` above), and nothing
 * financial goes through here.
 */
function sourceTimestamp(raw: string | number): number | undefined {
  const value = Number(raw); // audit: safe — epoch timestamp from a feed envelope, never a price or size
  return Number.isFinite(value) ? value : undefined;
}

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    const response = await fetch(path);
    if (!response.ok) return undefined;
    return safeJsonParse(await response.text());
  } catch (e) {
    logger.warn("alerts", `[Feeds] ${path} did not answer`, e);
    return undefined;
  }
}

/**
 * The current open-interest level for one market.
 *
 * A level, not yet a reading: the change the veto compares against needs two
 * of these, and the store keeps them.
 */
export async function readOpenInterestSample(
  symbol: string,
): Promise<OpenInterestSample | undefined> {
  const body = await readJson(`/api/open-interest?symbol=${encodeURIComponent(symbol)}`);
  if (body === undefined) return undefined;

  const parsed = OpenInterestResponse.safeParse(body);
  if (!parsed.success) {
    logger.warn("alerts", "[Feeds] Open interest answered in an unexpected shape");
    return undefined;
  }

  const asOfMs = sourceTimestamp(parsed.data.data.ts);
  const entry = parsed.data.data.openInterestList[0];
  if (asOfMs === undefined || entry === undefined) return undefined;

  const size = toDecimal(entry.size);
  if (size === undefined || size.lte(0)) return undefined;

  return { asOfMs, size: size.toFixed() };
}

/**
 * The current fear-and-greed index, 0..100.
 *
 * Market-wide: it names no symbol, so it is held once rather than per market.
 */
export async function readFearGreed(): Promise<FeedReading | undefined> {
  const body = await readJson("/api/fear-greed");
  if (body === undefined) return undefined;

  const parsed = FearGreedResponse.safeParse(body);
  if (!parsed.success) {
    logger.warn("alerts", "[Feeds] Fear and greed answered in an unexpected shape");
    return undefined;
  }

  const entry = parsed.data.data[0];
  if (entry === undefined) return undefined;
  const seconds = sourceTimestamp(entry.timestamp);
  const index = toDecimal(entry.value);
  // The published index is a number from 0 to 100. Anything else is not the
  // index, and a veto comparing against it would compare against nothing.
  if (seconds === undefined || index === undefined || index.lt(0) || index.gt(100)) {
    return undefined;
  }

  return {
    feed: "fear_greed",
    source: FEAR_GREED_SOURCE,
    value: index.toFixed(),
    asOfMs: seconds * 1000,
  };
}

/**
 * The current (predicted) funding rate for one market, as a fraction --
 * `0.0005` is 0.05%.
 *
 * The batch endpoint stamps nothing: the rate it returns is the next,
 * not-yet-settled one, so there is no instant it was "current" at. The reading
 * is therefore dated when we read it, and its age limit measures our own
 * polling health rather than a venue's publication rhythm. Saying that out
 * loud is the point -- a borrowed timestamp would claim a precision the source
 * never gave.
 */
export async function readFundingRate(symbol: string): Promise<FeedReading | undefined> {
  try {
    const rates = await fetchBitunixFundingRates();
    const entry = rates.get(symbol);
    if (entry === undefined || !entry.fundingRate.isFinite()) return undefined;

    return {
      feed: "funding_rate",
      source: FUNDING_SOURCE,
      value: entry.fundingRate.toFixed(),
      asOfMs: Date.now(),
    };
  } catch (e) {
    logger.warn("alerts", `[Feeds] Funding rate for ${symbol} did not answer`, e);
    return undefined;
  }
}
