/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
});

// Simple In-Memory Cache for RSS Feeds
interface CachedFeed {
  data: any;
  timestamp: number;
}
const feedCache = new Map<string, CachedFeed>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_ENTRIES = 50;

export const POST: RequestHandler = async ({ request }) => {
  let url = "unknown";

  try {
    const body = await request.json();
    url = body.url;

    if (!url || typeof url !== "string") {
      return json(
        { error: "Missing or invalid URL parameter" },
        { status: 400 },
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return json({ error: "Invalid URL format" }, { status: 400 });
    }

    // 1. Check Cache
    const cached = feedCache.get(url);
    const now = Date.now();
    if (cached && now - cached.timestamp < CACHE_TTL) {
      return json(cached.data);
    }

    // 2. Fetch and parse RSS feed
    const feed = await parser.parseURL(url);

    // Normalize to NewsItem format
    const newsItems = feed.items.map((item) => ({
      title: item.title || "Untitled",
      url: item.link || url,
      source: feed.title || new URL(url).hostname,
      published_at: item.isoDate || item.pubDate || new Date().toISOString(),
      description: item.contentSnippet || item.content || "",
    }));

    const responseData = {
      items: newsItems,
      feedTitle: feed.title,
      feedDescription: feed.description,
    };

    // 3. Update Cache
    if (feedCache.size >= MAX_CACHE_ENTRIES) {
      // Remove oldest entry (FIFO-ish)
      const firstEntry = feedCache.keys().next().value;
      if (firstEntry) feedCache.delete(firstEntry);
    }
    feedCache.set(url, { data: responseData, timestamp: now });

    return json(responseData);
  } catch (error: any) {
    // Check if we have a stale cache entry during error (Stale-While-Revalidate fallback)
    const staleCached = feedCache.get(url);
    if (staleCached) {
      // console.log(`[rss-fetch] Serving stale content for ${url} due to error`);
      return json(staleCached.data);
    }

    if (error.message?.includes("Status code 429")) {
      return json(
        { error: "Rate limit hit (Provider side). Returning stale content." },
        { status: 429 },
      );
    }

    if (error.code === "ENOTFOUND") {
      return json({ error: "Feed URL not found (DNS error)" }, { status: 404 });
    } else if (error.code === "ETIMEDOUT") {
      return json({ error: "Feed request timed out" }, { status: 504 });
    } else if (
      error.message?.includes("Invalid XML") ||
      error.message?.includes("Unable to parse XML")
    ) {
      return json({ error: "Invalid RSS/XML format" }, { status: 422 });
    }

    // Log unexpected errors
    console.error(`[rss-fetch] Unexpected Error for ${url}:`, {
      message: error.message,
      code: error.code,
    });

    return json(
      {
        error: "Failed to fetch RSS feed",
        details: error.message,
      },
      { status: 500 },
    );
  }
};
