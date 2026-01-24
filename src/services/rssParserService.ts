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
        url: item.url,
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
    const results = await Promise.allSettled(
      urls.map((url) => this.parseRssFeed(url)),
    );

    const allItems: NewsItem[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        allItems.push(...result.value);
      } else {
        logger.warn(
          "market",
          `[rssParser] Failed to fetch feed ${urls[index]}`,
          result.reason,
        );
      }
    });

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
