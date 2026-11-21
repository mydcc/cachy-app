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
 * FEAT-0816 — what the feed store asks for, and what it refuses to ask for.
 *
 * The promise under test is as much a privacy one as a performance one: only
 * the (market, feed) pairs an armed veto actually reads are ever requested, so
 * a trader with no feed veto causes no third-party traffic at all (ADR-0029
 * decision 7).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Condition, RuleDocument } from "../../lib/rules/types";

vi.mock("$app/env", () => ({ browser: true, dev: false }));
vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("./externalFeedSources", async (importOriginal) => {
  const original = await importOriginal<typeof import("./externalFeedSources")>();
  return {
    ...original,
    readFundingRate: vi.fn(),
    readOpenInterestSample: vi.fn(),
    readFearGreed: vi.fn(),
  };
});

import { externalFeedStore } from "./externalFeedStore";
import {
  readFearGreed,
  readFundingRate,
  readOpenInterestSample,
  OI_MIN_SPAN_MS,
  type FundingRateFetcher,
} from "./externalFeedSources";

/**
 * The store only passes this through to `readFundingRate`, which is mocked
 * here, so what it returns is never read. It exists because the port is
 * required -- and because asserting on its identity below is what proves the
 * store hands the wired fetcher on rather than reaching for one itself.
 */
const fundingPort: FundingRateFetcher = async () => new Map();

const SYMBOL = "BTCUSDT";
const START_MS = 1_770_000_000_000;

const fundingVeto: Condition = {
  kind: "external_feed",
  feed: "funding_rate",
  op: "gt",
  value: "0.01",
};

function rule(veto: Condition | undefined, overrides: Partial<RuleDocument> = {}): RuleDocument {
  return {
    schema_version: 1,
    id: "rule-1",
    name: "guard",
    symbol: SYMBOL,
    trigger_timeframe: "4h",
    conditions: {
      kind: "compare",
      left: { kind: "price", field: "close" },
      op: "gt",
      right: { kind: "constant", value: "0" },
      timeframe: "4h",
    },
    ...(veto ? { veto } : {}),
    action: { consequence_level: "notify" },
    provenance: { source: "human", created_at_ms: START_MS },
    ...overrides,
  };
}

/** One polling pass: `start` runs a tick immediately. */
async function pollOnce(rules: RuleDocument[]): Promise<void> {
  externalFeedStore.configure({ readRules: () => rules, fetchFundingRates: fundingPort });
  externalFeedStore.start();
  // The tick is async and deliberately not awaited by `start`; the sources are
  // mocked, so one turn of the microtask queue is the whole pass.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("the feed store", () => {
  beforeEach(() => {
    vi.mocked(readFundingRate).mockResolvedValue(undefined);
    vi.mocked(readOpenInterestSample).mockResolvedValue(undefined);
    vi.mocked(readFearGreed).mockResolvedValue(undefined);
  });

  afterEach(() => {
    externalFeedStore.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("asks for nothing when no armed veto reads a feed", async () => {
    await pollOnce([rule(undefined), rule({ kind: "position", side: "long", open: true })]);

    expect(readFundingRate).not.toHaveBeenCalled();
    expect(readOpenInterestSample).not.toHaveBeenCalled();
    expect(readFearGreed).not.toHaveBeenCalled();
  });

  it("asks only for the feed and market a veto actually names", async () => {
    await pollOnce([rule(fundingVeto)]);

    expect(readFundingRate).toHaveBeenCalledWith(SYMBOL, fundingPort);
    expect(readOpenInterestSample).not.toHaveBeenCalled();
    expect(readFearGreed).not.toHaveBeenCalled();
  });

  it("asks nothing on behalf of a paused rule", async () => {
    await pollOnce([rule(fundingVeto, { enabled: false })]);

    expect(readFundingRate).not.toHaveBeenCalled();
  });

  it("hands the reading it holds to the market that asked for it", async () => {
    vi.mocked(readFundingRate).mockResolvedValue({
      feed: "funding_rate",
      source: "bitunix:futures/market/funding_rate/batch",
      value: "0.0004",
      asOfMs: START_MS,
    });

    await pollOnce([rule(fundingVeto)]);

    expect(externalFeedStore.readFeeds(SYMBOL)).toEqual([
      expect.objectContaining({ feed: "funding_rate", value: "0.0004" }),
    ]);
    // Another market asked for nothing and is told nothing.
    expect(externalFeedStore.readFeeds("ETHUSDT")).toEqual([]);
  });

  it("serves the market-wide index to every market", async () => {
    vi.mocked(readFearGreed).mockResolvedValue({
      feed: "fear_greed",
      source: "alternative.me:fng",
      value: "18",
      asOfMs: START_MS,
    });

    await pollOnce([
      rule({ kind: "external_feed", feed: "fear_greed", op: "lt", value: "20" }),
    ]);

    expect(externalFeedStore.readFeeds("ETHUSDT")).toEqual([
      expect.objectContaining({ feed: "fear_greed", value: "18" }),
    ]);
  });

  it("holds no open-interest reading from one sample, and one once the span is real", async () => {
    // The clock has to move for the second sample to be asked for at all, and
    // the samples have to be far enough apart for the change to mean anything.
    vi.useFakeTimers();
    vi.setSystemTime(START_MS);

    const oiVeto: Condition = {
      kind: "external_feed",
      feed: "open_interest_change",
      op: "gt",
      value: "5",
    };
    vi.mocked(readOpenInterestSample).mockResolvedValue({ asOfMs: START_MS, size: "1000" });

    await pollOnce([rule(oiVeto)]);

    // One sample is a level, not a change: the feed stays unavailable rather
    // than reporting a calm 0%.
    expect(externalFeedStore.readFeeds(SYMBOL)).toEqual([]);

    vi.setSystemTime(START_MS + OI_MIN_SPAN_MS);
    vi.mocked(readOpenInterestSample).mockResolvedValue({
      asOfMs: START_MS + OI_MIN_SPAN_MS,
      size: "1100",
    });
    // Past the tick interval, so the running store asks again by itself.
    await vi.advanceTimersByTimeAsync(31_000);

    expect(externalFeedStore.readFeeds(SYMBOL)).toEqual([
      expect.objectContaining({ feed: "open_interest_change", value: "10" }),
    ]);
  });

  it("forgets what it held when it stops, so a stale reading cannot outlive it", async () => {
    vi.mocked(readFundingRate).mockResolvedValue({
      feed: "funding_rate",
      source: "bitunix:futures/market/funding_rate/batch",
      value: "0.0004",
      asOfMs: START_MS,
    });
    await pollOnce([rule(fundingVeto)]);
    expect(externalFeedStore.readFeeds(SYMBOL)).toHaveLength(1);

    externalFeedStore.stop();

    expect(externalFeedStore.readFeeds(SYMBOL)).toEqual([]);
  });
});
