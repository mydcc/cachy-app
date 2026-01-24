/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { NewsItem } from "./newsService";

/**
 * RSS Parser Service
 *
 * Handles fetching and parsing of RSS feeds via server-side endpoint.
 * Normalizes RSS items to NewsItem format for consistent handling.
 */

export const rssParserService = {
  /**
   * Fetch and parse RSS feed
   * @param url - RSS feed URL
   * @returns Array of normalized NewsItem objects
   */
  async parseRssFeed(input: string): Promise<NewsItem[]> {
    try {
      const isXCommand = input.startsWith("x:");
      const body = isXCommand
        ? { xCmd: { type: input.split(":")[1], value: input.split(":")[2] } }
        : { url: input };

      const response = await fetch("/api/rss-fetch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        // Silent fail for single feeds as the server might be rotating anyway
        return [];
      }

      const data = await response.json();

      // Map to NewsItem format (compatible with CryptoPanic/NewsAPI)
      return data.items.map((item: any) => ({
        title: item.title,
        url: item.url,
        source: item.source,
        published_at: item.published_at,
        currencies: [], // RSS feeds don't typically have currency tags
      }));
    } catch (error) {
      console.error(`[rssParser] Error parsing Feed ${input}:`, error);
      return []; // Graceful fallback: return empty array
    }
  },

  /**
   * Fetch multiple RSS feeds in parallel
   * @param urls - Array of RSS feed URLs
   * @returns Combined array of NewsItem objects from all feeds
   */
  async parseMultipleFeeds(urls: string[]): Promise<NewsItem[]> {
    const results = await Promise.allSettled(
      urls.map((url) => this.parseRssFeed(url)),
    );

    // Flatten results, filter out failed fetches
    const allItems: NewsItem[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        allItems.push(...result.value);
      } else {
        console.warn(
          `[rssParser] Failed to fetch feed ${urls[index]}:`,
          result.reason,
        );
      }
    });

    return allItems;
  },

  /**
   * Validate if URL is a valid RSS feed format
   * @param url - URL to validate
   * @returns True if URL format is valid
   */
  isValidFeedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  },
};
