/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { NewsItem } from "./newsService";
import { logger } from "./logger";

export const rssParserService = {
  async parseRssFeed(input: string): Promise<NewsItem[]> {
    try {
      const body = { url: input };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s client timeout

      const response = await fetch("/api/rss-fetch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return [];
      }

      const data = await response.json();

      return data.items.map((item: any) => ({
        title: item.title,
        url: item.url || input, // Fallback to feed URL if item URL is missing
        source: item.source,
        published_at: item.published_at,
        currencies: [],
      }));
    } catch (error) {
      logger.error("market", `[rssParser] Error parsing Feed ${input}`, error);
      return [];
    }
  },

  async parseMultipleFeeds(urls: string[]): Promise<NewsItem[]> {
    if (!urls || urls.length === 0) return [];

    const concurrency = Math.min(4, Math.max(1, urls.length));
    const allItems: NewsItem[] = [];
    let index = 0;

    const worker = async () => {
      while (true) {
        const current = index < urls.length ? urls[index++] : null;
        if (!current) break;
        try {
          const items = await this.parseRssFeed(current);
          allItems.push(...items);
        } catch (e) {
          logger.warn(
            "market",
            `[rssParser] Failed to fetch feed ${current}`,
            e,
          );
        }
      }
    };

    await Promise.all(new Array(concurrency).fill(0).map(() => worker()));

    return allItems;
  },

  isValidFeedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  },
};
