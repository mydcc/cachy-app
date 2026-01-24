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
  "xcancel.com",
  "nuku.trabun.org",
  "nitter.tiekoetter.com",
  "nitter.space",
  "nitter.privacyredirect.com",
  "nitter.poast.org",
  "nitter.net",
  "nitter.catsarch.com",
  "nitter.popper.org",
  "lightbrd.com"
];

/**
 * Shuffles an array (Fisher-Yates)
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const POST: RequestHandler = async ({ request }) => {
  let url = "unknown";

  try {
    const body = await request.json();
    url = body.url;

    if (!url || typeof url !== "string") {
      return json({ error: "Missing or invalid URL parameter" }, { status: 400 });
    }

    const tryFetch = async (targetUrl: string, timeout = 5000): Promise<any> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7",
            "Accept-Language": "en-US,en;q=0.5",
            "Cache-Control": "max-age=0",
            "Referer": new URL(targetUrl).origin + "/"
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const xml = await response.text();
        clearTimeout(id);

        if (!xml.trim().startsWith("<")) {
          const preview = xml.substring(0, 100).replace(/\s+/g, " ");
          throw new Error(`Invalid format (Expected XML, got: "${preview}...")`);
        }

        const parsed = await parser.parseString(xml);
        if (!parsed || !parsed.items || parsed.items.length === 0) {
          throw new Error("Empty feed or incompatible structure");
        }
        return parsed;
      } catch (e: any) {
        clearTimeout(id);
        throw e;
      }
    };

    // Special logic for X/Twitter
    const isX = url.includes("nitter") || url.includes("x.com") || url.includes("twitter.com") || url.includes("xcancel");
    let feedData: any = null;

    if (isX) {
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;
      const pool = shuffle(NITTER_INSTANCES);

      console.log(`[X-NEWS] Request for path: ${path}. Shuffling instances...`);

      let lastError: any = null;
      for (const instance of pool) {
        const testUrl = `https://${instance}${path}`;
        try {
          feedData = await tryFetch(testUrl, 4000);
          if (feedData) {
            console.log(`[X-NEWS] Success with: ${instance}`);
            break;
          }
        } catch (e: any) {
          lastError = e;
          console.warn(`[X-NEWS] Instance ${instance} failed: ${e.message}`);
          continue;
        }
      }
      if (!feedData && lastError) throw lastError;
    } else {
      feedData = await tryFetch(url, 8000);
    }

    if (!feedData) throw new Error("No data fetched after all rotation attempts");

    const newsItems = (feedData.items || []).map((item: any) => ({
      title: item.title || "Untitled",
      url: item.link || url,
      source: feedData.title || new URL(url).hostname,
      published_at: item.isoDate || item.pubDate || new Date().toISOString(),
      description: item.contentSnippet || item.content || "",
    }));

    return json({
      items: newsItems,
      feedTitle: feedData.title,
    });

  } catch (error: any) {
    console.error(`[RSS-FETCH] Final Error for ${url}: ${error.message}`);
    return json(
      {
        error: "Failed to fetch RSS feed",
        details: error.message,
        isFormatError: true
      },
      { status: 500 },
    );
  }
};

