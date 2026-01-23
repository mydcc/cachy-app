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

  async refresh(symbol?: string, force = false) {
    if (!settingsState.enableNewsAnalysis) return;

    // Avoid redundant loads for same symbol unless forced
    if (
      !force &&
      symbol === this.lastSymbol &&
      this.news.length > 0 &&
      !this.error
    ) {
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.lastSymbol = symbol;

    try {
      const items = await newsService.fetchNews(symbol);
      this.news = items || [];

      if (this.news.length > 0) {
        const analysis = await newsService.analyzeSentiment(this.news);
        this.sentiment = analysis;
      } else {
        this.sentiment = null;
      }
    } catch (e: any) {
      logger.error("market", "Refresh failed", e);
      this.error = e.message || "Failed to load news";
    } finally {
      this.isLoading = false;
    }
  }
}

export const newsStore = new NewsStore();
