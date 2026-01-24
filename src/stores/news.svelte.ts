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

  async refresh(symbol?: string, force = false) {
    if (!settingsState.enableNewsAnalysis) return;

    // Prevent concurrent loads for the same symbol
    if (this.isLoading && symbol === this.lastSymbol && !force) {
        return;
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
    } catch (e: any) {
      logger.error("market", "Refresh failed", e);
      this.error = e.message || "Failed to load news";
      // Update fetch time even on error to enforce cooldown
      this.lastFetchTime = Date.now();
    } finally {
      this.isLoading = false;
    }
  }
}

export const newsStore = new NewsStore();
