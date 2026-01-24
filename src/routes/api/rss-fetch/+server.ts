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

// Simple In-Memory Cache and Health Tracker for RSS Feeds
interface CachedFeed {
  data: any;
  timestamp: number;
}
interface HostHealth {
  consecutiveErrors: number;
  lastErrorTime: number;
}

const feedCache = new Map<string, CachedFeed>();
const hostHealth = new Map<string, HostHealth>();

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const HEALTH_BACKOFF = 15 * 60 * 1000; // 15 minutes backoff for failing hosts
const MAX_CONSECUTIVE_ERRORS = 3;
const MAX_CACHE_ENTRIES = 50;

const NITTER_INSTANCES = [
  "nitter.net",
  "nitter.poast.org",
  "nitter.cz",
  "nitter.privacydev.net",
  "nitter.it",
  "nitter.tinfoil-hat.net"
];

export const POST: RequestHandler = async ({ request }) => {
  let url = "unknown";
  let host = "unknown";

  try {
    const body = await request.json();
    url = body.url;

    if (!url || typeof url !== "string") {
      return json({ error: "Missing or invalid URL parameter" }, { status: 400 });
    }

    const tryFetch = async (targetUrl: string): Promise<any> => {
      try {
        const feed = await parser.parseURL(targetUrl);
        return feed;
      } catch (e: any) {
        throw e;
      }
    };

    // Special logic for Nitter/X
    const isNitter = NITTER_INSTANCES.some(inst => url.includes(inst));
    let feedData: any = null;

    if (isNitter) {
      // Try multiple Nitter instances if one fails
      let lastError = null;
      for (const instance of NITTER_INSTANCES) {
        // Replace the current host with a new one from the list
        const currentUrl = new URL(url);
        const testUrl = url.replace(currentUrl.hostname, instance);

        try {
          feedData = await tryFetch(testUrl);
          if (feedData) break;
        } catch (e) {
          lastError = e;
          continue;
        }
      }
      if (!feedData && lastError) throw lastError;
    } else {
      feedData = await tryFetch(url);
    }

    if (!feedData) throw new Error("No data fetched");

    // Success! Normalize to NewsItem format
    const newsItems = feedData.items.map((item: any) => ({
      title: item.title || "Untitled",
      url: item.link || url,
      source: feedData.title || new URL(url).hostname,
      published_at: item.isoDate || item.pubDate || new Date().toISOString(),
      description: item.contentSnippet || item.content || "",
    }));

    const responseData = {
      items: newsItems,
      feedTitle: feedData.title,
    };

    return json(responseData);

  } catch (error: any) {
    const isParsingError = error.message?.includes("Invalid XML") || error.message?.includes("Unable to parse XML");

    if (isParsingError) {
      console.error(`[RSS-FIX] Critical Format Error for ${url}: ${error.message}`);
    }

    return json(
      {
        error: "Failed to fetch RSS feed",
        details: error.message,
        isFormatError: isParsingError
      },
      { status: 500 },
    );
  }
};

