/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import {
  newsService,
  type NewsItem,
  type SentimentAnalysis,
} from "../services/newsService";
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

    try {
    // Delay the RSS and News fetch to make it secondary (nachrangig)
    // so real-time data has priority during initialization.
    if (!force) {
        await new Promise(r => setTimeout(r, 3000));
    }

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

    this.isLoading = true;
    this.error = null;
    this.lastSymbol = symbol;

    try {
      const items = await newsService.fetchNews(symbol);
      this.news = items || [];
      this.lastFetchTime = Date.now();

      if (this.news.length > 0) {
        const analysis = await newsService.analyzeSentiment(this.news);
        this.sentiment = analysis;
      } else {
        this.sentiment = null;
      }
    } catch (e) {
      logger.error("market", "Refresh failed", e);
      this.error = (e instanceof Error ? e.message : null) || "Failed to load news";
      // Update fetch time even on error to enforce cooldown
      this.lastFetchTime = Date.now();
    } finally {
      this.isLoading = false;
    }
    } finally {
      // Runs for every exit path, including the cooldown early-returns above,
      // so a skipped refresh cannot leave the symbol permanently blocked.
      if (symbol !== undefined) this.pendingSymbols.delete(symbol);
    }
  }
}

export const newsStore = new NewsStore();
