/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { newsService } from "../services/newsService";
import type {
  NewsItem,
  SentimentAnalysis,
} from "../services/newsTypes";
import { logger } from "../services/logger";
import { settingsState } from "./settings.svelte";

class NewsStore {
  news = $state<NewsItem[]>([]);
  sentiment = $state<SentimentAnalysis | null>(null);
  isLoading = $state(false);
  error = $state<string | null>(null);
  lastSymbol = $state<string | undefined>(undefined);
  lastFetchTime = $state(0);

  // Cooldown to prevent infinite loops when API returns empty/fails silently
  private readonly FETCH_COOLDOWN = 60000; // 60s

  // Symbols with a refresh in progress, including the ones still parked on the
  // deliberate startup delay. Not $state: this is an internal concurrency guard,
  // not something the UI renders.
  private readonly pendingSymbols = new Set<string>();

  // BUG-0785: a refresh that resolves after the symbol moved must not overwrite
  // the newer symbol's news/sentiment. A refresh claims a generation as soon as
  // it is accepted — before the startup delay — and every write is applied only
  // while that generation is still the current one.
  private generation = 0;

  async refresh(symbol?: string, force = false) {
    if (!settingsState.enableNewsAnalysis) return;

    // Prevent concurrent loads for the same symbol.
    //
    // This cannot rely on `isLoading`, which is only set after the deliberate
    // 3s delay below. Two calls issued inside that window both passed the old
    // guard and both fetched — the exact duplicate the guard exists to stop,
    // and the likeliest case in practice (startup, or rapid symbol switching).
    // `pendingSymbols` is tracked separately so the UI-facing `isLoading` keeps
    // meaning "a request is actually in flight".
    if (!force && symbol !== undefined && this.pendingSymbols.has(symbol)) {
        return;
    }
    if (symbol !== undefined) this.pendingSymbols.add(symbol);

    // BUG-0785: claim the generation here, not after the startup delay below.
    // A call parked in that delay would otherwise claim a *higher* generation
    // when it wakes and win against a refresh that already landed, which is
    // exactly the stale write this guard exists to stop.
    const generation = ++this.generation;

    try {
    // Delay the RSS and News fetch to make it secondary (nachrangig)
    // so real-time data has priority during initialization.
    if (!force) {
        await new Promise(r => setTimeout(r, 3000));
    }

    // A newer refresh claimed the counter while this one was parked.
    if (generation !== this.generation) return;

    const now = Date.now();

    // Avoid redundant loads for same symbol unless forced
    if (!force && symbol === this.lastSymbol) {
      const isRecent = (now - this.lastFetchTime) < this.FETCH_COOLDOWN;

      // If we have data and no error, skip
      if (this.news.length > 0 && !this.error) return;

      // If we failed or got empty results recently, SKIP to prevent spam loop
      // This is crucial if rss-fetch returns 500 (empty) repeatedly
      if (isRecent) {
        // Only skip if we are within cooldown.
        // If it's been > 1 min, we try again.
        return;
      }
    }

    // BUG-0785: the symbol moved, so whatever is on screen belongs to the
    // previous one. Clearing here is what stops the panel from showing the old
    // market's headlines under the new ticker while the new fetch runs.
    if (symbol !== this.lastSymbol) {
      this.news = [];
      this.sentiment = null;
    }

    this.isLoading = true;
    this.error = null;
    this.lastSymbol = symbol;

    try {
      const items = await newsService.fetchNews(symbol);
      // BUG-0785: a newer refresh started while this one was in flight — drop
      // this result instead of writing it under the new symbol.
      if (generation !== this.generation) return;
      this.news = items || [];
      this.lastFetchTime = Date.now();

      if (this.news.length > 0) {
        const analysis = await newsService.analyzeSentiment(this.news);
        if (generation !== this.generation) return;
        this.sentiment = analysis;
      } else {
        this.sentiment = null;
      }
    } catch (e) {
      if (generation !== this.generation) {
        // Dropping the state write is the point; dropping the diagnostic is
        // not. Without this, a failure that only reproduces for one symbol
        // stays invisible whenever the user switches away mid-request.
        logger.warn(
          "market",
          `[News] Superseded refresh for ${symbol ?? "default"} failed`,
          e,
          true,
        );
        return;
      }
      logger.error("market", "Refresh failed", e);
      this.error = (e instanceof Error ? e.message : null) || "Failed to load news";
      // Update fetch time even on error to enforce cooldown
      this.lastFetchTime = Date.now();
    } finally {
      if (generation === this.generation) this.isLoading = false;
    }
    } finally {
      // Runs for every exit path, including the cooldown early-returns above,
      // so a skipped refresh cannot leave the symbol permanently blocked.
      if (symbol !== undefined) this.pendingSymbols.delete(symbol);
    }
  }
}

export const newsStore = new NewsStore();
