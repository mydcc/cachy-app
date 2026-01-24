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
  "nitter.tinfoil-hat.net",
  "nitter.dr460negg.ca"
];

export const POST: RequestHandler = async ({ request }) => {
  let url = "unknown";

  try {
    const body = await request.json();
    url = body.url;

    if (!url || typeof url !== "string") {
      return json({ error: "Missing or invalid URL parameter" }, { status: 400 });
    }

    const tryFetch = async (targetUrl: string, timeout = 3000): Promise<any> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/rss+xml, application/xml, text/xml, */*"
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const xml = await response.text();
        clearTimeout(id);
        return await parser.parseString(xml);
      } catch (e: any) {
        clearTimeout(id);
        throw e;
      }
    };

    // Special logic for Nitter/X
    const isNitter = NITTER_INSTANCES.some(inst => url.includes(inst));
    let feedData: any = null;

    if (isNitter) {
      console.log(`[RSS-FETCH] Nitter Rotation started for: ${url}`);
      let lastError: any = null;
      for (const instance of NITTER_INSTANCES) {
        const urlObj = new URL(url);
        const testUrl = url.replace(urlObj.hostname, instance);

        console.log(`[RSS-FETCH] Trying Nitter instance: ${instance}...`);
        try {
          feedData = await tryFetch(testUrl, 3000); // 3s Timeout
          if (feedData) {
            console.log(`[RSS-FETCH] Success with instance: ${instance}`);
            break;
          }
        } catch (e: any) {
          lastError = e;
          console.warn(`[RSS-FETCH] Instance ${instance} failed: ${e.message}`);
          continue;
        }
      }
      if (!feedData && lastError) throw lastError;
    } else {
      feedData = await tryFetch(url, 8000); // Normal feeds get 8s
    }

    if (!feedData) throw new Error("No data fetched");

    // Success! Normalize to NewsItem format
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
    const isParsingError = error.message?.includes("Invalid XML") ||
      error.message?.includes("Unable to parse XML") ||
      error.name === "AbortError";

    console.error(`[RSS-FETCH] Final Error for ${url}: ${error.message}`);

    return json(
      {
        error: "Failed to fetch RSS feed after all attempts",
        details: error.message,
        isFormatError: isParsingError
      },
      { status: 500 },
    );
  }
};

