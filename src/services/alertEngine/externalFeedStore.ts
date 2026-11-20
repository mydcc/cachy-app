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
 * FEAT-0816 — the feed readings the evaluation loop reads, and the polling
 * that keeps them current.
 *
 * The loop is synchronous: a candle closes, every armed rule is answered, and
 * nothing in that path may await a network call. So the readings are held
 * here, refreshed on a timer, and handed over as a snapshot. A feed that has
 * not been fetched yet, or whose source is down, is simply absent -- and an
 * absent feed is what makes a veto fail open with a visible signal (ADR-0029
 * decision 3) rather than a stale number nobody can see.
 *
 * Only what somebody reads is fetched: the (market, feed) pairs come from the
 * armed rules' vetoes, so a trader with no feed veto causes no requests at
 * all. Nothing here is keyed by rule, bot or account -- the cache is per feed
 * and, where the feed is per-market, per symbol (decision 7).
 */

import { browser } from "$app/env";
import { feedsNamedBy, type FeedReading } from "../../lib/rules/feedReadings";
import type { ExternalFeedId } from "../../lib/rules/externalFeeds";
import type { RuleDocument } from "../../lib/rules/types";
import { logger } from "../logger";
import {
  OI_MAX_SPAN_MS,
  OPEN_INTEREST_SOURCE,
  openInterestChangePercent,
  readFearGreed,
  readFundingRate,
  readOpenInterestSample,
  type OpenInterestSample,
} from "./externalFeedSources";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/** How often the tick runs. Each feed decides for itself whether it is due. */
const TICK_MS = 30 * SECOND_MS;

/**
 * How often each feed is asked, comfortably inside its own age limit in
 * `MAX_FEED_AGE_MS` so a single failed request never makes a feed stale.
 *
 * Open interest is sampled more often than it is needed: the change is derived
 * from samples spanning at least half an hour, and a sparse sample set is the
 * one thing that cannot be fixed after the fact.
 */
const REFRESH_MS: Record<ExternalFeedId, number> = {
  funding_rate: 5 * MINUTE_MS,
  open_interest_change: 2 * MINUTE_MS,
  fear_greed: 30 * MINUTE_MS,
};

/** The most samples one market keeps. The span, not the count, is the limit. */
const MAX_OI_SAMPLES = 120;

type RuleReader = () => RuleDocument[];

class ExternalFeedStore {
  /** Per-market readings, keyed `symbol` then feed. */
  private readonly perMarket = new Map<string, Map<ExternalFeedId, FeedReading>>();
  /** Market-independent readings -- the fear-and-greed index names no symbol. */
  private readonly global = new Map<ExternalFeedId, FeedReading>();
  private readonly openInterest = new Map<string, OpenInterestSample[]>();
  /** When each `feed@symbol` was last asked, successful or not. */
  private readonly lastAsked = new Map<string, number>();
  /** Requests in flight, so a slow source cannot be asked again every tick. */
  private readonly inFlight = new Set<string>();
  private readRules: RuleReader = () => [];
  private timer: ReturnType<typeof setInterval> | undefined;

  /**
   * Which rules decide what is worth fetching. Injected for the same reason
   * the loop's readers are: this module must stay callable without a store.
   */
  configure(readRules: RuleReader): void {
    this.readRules = readRules;
  }

  /** Begin polling. Idempotent, and a no-op outside the browser. */
  start(): void {
    if (!browser || this.timer !== undefined) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    // Immediately, not only in thirty seconds: the first candle close after
    // arming would otherwise always find its feed unavailable and drop a veto
    // the trader had every reason to expect.
    void this.tick();
  }

  /**
   * Stop polling and forget what was held.
   *
   * Forgetting is deliberate: a reading kept across a disarm would be served
   * to the next armed session as if it had just been read, and its age is the
   * only thing standing between a veto and a stale number.
   */
  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.perMarket.clear();
    this.global.clear();
    this.openInterest.clear();
    this.lastAsked.clear();
  }

  /**
   * Everything held for one market, newest reading per feed.
   *
   * The loop decides what is fresh and what its rule actually reads; this is
   * the whole snapshot, copied so a caller cannot edit what the store holds.
   */
  readFeeds(symbol: string): readonly FeedReading[] {
    const market = this.perMarket.get(symbol);
    return [...this.global.values(), ...(market === undefined ? [] : market.values())];
  }

  /** The (market, feed) pairs the armed rules' vetoes actually read. */
  private wanted(): Map<ExternalFeedId, Set<string>> {
    const wanted = new Map<ExternalFeedId, Set<string>>();

    for (const rule of this.readRules()) {
      // A paused rule is not evaluated, so its veto asks nothing of anyone.
      if (rule.enabled === false) continue;
      for (const feed of feedsNamedBy(rule.veto)) {
        if (!(feed in REFRESH_MS)) continue;
        const id = feed as ExternalFeedId;
        const markets = wanted.get(id) ?? new Set<string>();
        markets.add(rule.symbol);
        wanted.set(id, markets);
      }
    }

    return wanted;
  }

  private due(key: string, feed: ExternalFeedId, nowMs: number): boolean {
    if (this.inFlight.has(key)) return false;
    const asked = this.lastAsked.get(key);
    return asked === undefined || nowMs - asked >= REFRESH_MS[feed];
  }

  /**
   * One polling pass. Never throws and never awaits on the caller's behalf:
   * a source that hangs must not hold up the others or the interval.
   */
  private async tick(): Promise<void> {
    const nowMs = Date.now();

    for (const [feed, markets] of this.wanted()) {
      if (feed === "fear_greed") {
        if (this.due(feed, feed, nowMs)) await this.refreshFearGreed(feed, nowMs);
        continue;
      }

      for (const symbol of markets) {
        const key = `${feed}@${symbol}`;
        if (!this.due(key, feed, nowMs)) continue;
        if (feed === "funding_rate") await this.refreshFunding(key, symbol, nowMs);
        if (feed === "open_interest_change") await this.refreshOpenInterest(key, symbol, nowMs);
      }
    }
  }

  private async guarded(key: string, nowMs: number, read: () => Promise<void>): Promise<void> {
    this.inFlight.add(key);
    this.lastAsked.set(key, nowMs);
    try {
      await read();
    } catch (e) {
      logger.warn("alerts", `[Feeds] ${key} could not be refreshed`, e);
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async refreshFearGreed(key: string, nowMs: number): Promise<void> {
    await this.guarded(key, nowMs, async () => {
      const reading = await readFearGreed();
      // A failed read leaves the previous reading in place to age out on its
      // own limit. Deleting it here would turn one dropped request into an
      // outage report the trader does not need.
      if (reading !== undefined) this.global.set(reading.feed, reading);
    });
  }

  private async refreshFunding(key: string, symbol: string, nowMs: number): Promise<void> {
    await this.guarded(key, nowMs, async () => {
      const reading = await readFundingRate(symbol);
      if (reading !== undefined) this.hold(symbol, reading);
    });
  }

  private async refreshOpenInterest(key: string, symbol: string, nowMs: number): Promise<void> {
    await this.guarded(key, nowMs, async () => {
      const sample = await readOpenInterestSample(symbol);
      if (sample === undefined) return;

      const kept = [...(this.openInterest.get(symbol) ?? []), sample]
        .filter((held) => sample.asOfMs - held.asOfMs <= OI_MAX_SPAN_MS)
        .slice(-MAX_OI_SAMPLES);
      this.openInterest.set(symbol, kept);

      const change = openInterestChangePercent(kept);
      // Fewer than two usable samples is not a value yet, and nothing is held:
      // the feed reads as unavailable until the span is real, which is the
      // honest answer rather than a zero percent that looks like a calm market.
      if (change === undefined) return;

      this.hold(symbol, {
        feed: "open_interest_change",
        source: OPEN_INTEREST_SOURCE,
        value: change.value,
        asOfMs: change.asOfMs,
      });
    });
  }

  private hold(symbol: string, reading: FeedReading): void {
    const market = this.perMarket.get(symbol) ?? new Map<ExternalFeedId, FeedReading>();
    market.set(reading.feed, reading);
    this.perMarket.set(symbol, market);
  }
}

/**
 * The instance the alert wiring starts and the evaluation loop reads.
 *
 * A singleton because the open-interest change is derived from samples taken
 * over time: a second instance would start its sample history from scratch and
 * report no change for the first half hour of its life.
 */
export const externalFeedStore = new ExternalFeedStore();
