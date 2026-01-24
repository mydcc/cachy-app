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
  "nitter.privacyredirect.com",
  "lightbrd.com",
  "nitter.catsarch.com",
  "nitter.tiekoetter.com",
  "nitter.space",
  "nitter.poast.org",
  "nitter.net",
  "nitter.popper.org"
];

// In-memory blacklist to temporarily skip failing instances
const instanceBackoff = new Map<string, number>();
const BACKOFF_MS = 5 * 60 * 1000; // 5 minutes ignore after failure

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

/**
 * Super-lightweight HTML Scraper for Nitter timeline
 */
function scrapeNitterHTML(html: string, baseUrl: string): any[] {
  const items: any[] = [];
  const itemRegex = /<div class="timeline-item[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
  const contentRegex = /<div class="tweet-content[^>]*>([\s\S]*?)<\/div>/;
  const dateRegex = /<span class="tweet-date"><a href="([^"]*)" title="([^"]*)">/;

  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];
    const contentMatch = block.match(contentRegex);
    const dateMatch = block.match(dateRegex);

    if (contentMatch) {
      const text = contentMatch[1].replace(/<[^>]*>/g, "").trim();
      const relativeLink = dateMatch ? dateMatch[1] : "";
      const dateStr = dateMatch ? dateMatch[2] : new Date().toISOString();

      items.push({
        title: text.substring(0, 80) + (text.length > 80 ? "..." : ""),
        url: relativeLink ? `https://${baseUrl}${relativeLink}` : "",
        source: baseUrl,
        published_at: dateStr,
        description: text
      });
    }
  }
  return items;
}

export const POST: RequestHandler = async ({ request }) => {
  let context = "unknown";

  try {
    const body = await request.json();
    const { url, xCmd } = body;

    const tryFetch = async (targetUrl: string, timeout = 5000): Promise<string> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache"
          }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        clearTimeout(id);

        if (text.toLowerCase().includes("cloudflare") || text.toLowerCase().includes("anubis")) {
          throw new Error("Blocked by Bot Protection (HTML Challenge)");
        }
        return text;
      } catch (e: any) {
        clearTimeout(id);
        throw e;
      }
    };

    if (xCmd) {
      context = `@${xCmd.value}`;
      const now = Date.now();
      const available = NITTER_INSTANCES.filter(inst => (instanceBackoff.get(inst) || 0) < now);
      const pool = shuffle(available.length > 0 ? available : NITTER_INSTANCES);

      console.log(`[X-NEWS] COMMAND: ${xCmd.type} for ${xCmd.value}. Trying ${pool.length} instances...`);

      for (const instance of pool) {
        const targetPath = xCmd.type === "user"
          ? `/${xCmd.value}`
          : `/search?f=tweets&q=%23${xCmd.value}`;

        try {
          const html = await tryFetch(`https://${instance}${targetPath}`, 4000);
          const items = scrapeNitterHTML(html, instance);

          if (items.length > 0) {
            console.log(`[X-NEWS] Success with: ${instance} (${items.length} news)`);
            return json({ items, feedTitle: `X: ${context}` });
          }
          console.warn(`[X-NEWS] Instance ${instance} returned no items`);
        } catch (e: any) {
          console.warn(`[X-NEWS] Instance ${instance} failed: ${e.message}`);
          instanceBackoff.set(instance, now + BACKOFF_MS);
        }
      }
      throw new Error("All X-instances failed or blocked.");
    } else if (url) {
      const xml = await tryFetch(url, 8000);
      const parsed = await parser.parseString(xml);
      return json({
        items: (parsed.items || []).map((item: any) => ({
          title: item.title || "Untitled",
          url: item.link || url,
          source: parsed.title || new URL(url).hostname,
          published_at: item.isoDate || item.pubDate || new Date().toISOString(),
          description: item.contentSnippet || item.content || "",
        })),
        feedTitle: parsed.title,
      });
    } else {
      return json({ error: "Missing parameters" }, { status: 400 });
    }

  } catch (error: any) {
    console.error(`[RSS-FETCH] Error: ${error.message}`);
    return json({ error: error.message }, { status: 500 });
  }
};

