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
  "nitter.poast.org",
  "nuku.trabun.org",
  "nitter.cz",
  "nitter.privacy.com.de",
  "nitter.projectsegfau.lt",
  "nitter.eu.org",
  "xcancel.com"
];

// In-memory blacklist to temporarily skip failing instances
const instanceBackoff = new Map<string, number>();
const BACKOFF_MS = 2 * 60 * 1000; // 2 minutes ignore after failure

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
 * Deep-Search HTML Scraper for Nitter timeline
 * Focuses on content rather than container structure for maximum compatibility.
 */
function scrapeNitterHTML(html: string, baseUrl: string): any[] {
  const items: any[] = [];

  // Split into chunks by a reliable tweet container marker
  const blocks = html.split(/class\s*=\s*["'][^"']*(?:timeline-item|tweet-body)[^"']*["']/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    // Find the start of the tweet-content div
    const contentMatch = block.match(/class\s*=\s*["'][^"']*tweet-content[^"']*["'][^>]*>/);
    if (!contentMatch) continue;

    const startIndex = block.indexOf(contentMatch[0]) + contentMatch[0].length;
    const contentRaw = block.substring(startIndex);

    // Robust parsing of nested DIVs: count opening/closing tags to find the matching end
    let divDepth = 1;
    let pos = 0;
    while (divDepth > 0 && pos < contentRaw.length) {
      const nextOpen = contentRaw.indexOf("<div", pos);
      const nextClose = contentRaw.indexOf("</div>", pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        divDepth++;
        pos = nextOpen + 4;
      } else {
        divDepth--;
        pos = nextClose + 6;
      }
    }

    const textContent = contentRaw.substring(0, Math.max(0, pos - 6)).replace(/<[^>]*>/g, "").trim();
    if (!textContent || textContent.length < 3) continue;

    items.push({
      title: textContent.substring(0, 100) + (textContent.length > 100 ? "..." : ""),
      url: `https://${baseUrl}`, // Fallback to instance root
      source: baseUrl,
      published_at: new Date().toISOString(),
      description: textContent
    });
  }
  return items;
}

export const POST: RequestHandler = async ({ request }) => {
  let context = "unknown";

  try {
    const body = await request.json();
    const { url, xCmd } = body;

    const tryFetch = async (targetUrl: string, timeout = 6000): Promise<string> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      // Rotating User-Agents for better bypass
      const uas = [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      ];
      const ua = uas[Math.floor(Math.random() * uas.length)];

      try {
        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Cache-Control": "no-cache",
            "Upgrade-Insecure-Requests": "1"
          }
        });

        if (response.status === 429 || response.status === 403) throw new Error(`HTTP ${response.status}`);
        if (!response.ok) return "";

        const text = await response.text();
        clearTimeout(id);

        const lower = text.toLowerCase();
        if (
          lower.includes("cloudflare") ||
          lower.includes("anubis") ||
          lower.includes("robot checking") ||
          lower.includes("verifying your request") ||
          lower.includes("detected unusual activity") ||
          (lower.includes("ddos") && lower.includes("protection"))
        ) {
          throw new Error("Bot-Block");
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
        // Try multiple paths for a single instance for better resilience
        const paths = xCmd.type === "user"
          ? [`/${xCmd.value}`, `/${xCmd.value}/search?f=tweets&q=%20`] // Profile first, then space-search
          : [`/search?f=tweets&q=%23${xCmd.value}`, `/search?f=tweets&q=${xCmd.value}`];

        for (const targetPath of paths) {
          try {
            const html = await tryFetch(`https://${instance}${targetPath}`, 4000);
            if (!html) continue;

            const hasTitle = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "No Title").toLowerCase();

            // Redirect detection (many instances redirect to frontpage if profile fails)
            if (hasTitle === "nitter" || hasTitle.includes("homepage") || hasTitle.includes("welcome to nitter")) {
              console.warn(`[X-NEWS] Instance ${instance} redirected to homepage. Skipping.`);
              continue;
            }

            const items = scrapeNitterHTML(html, instance);
            if (items.length > 0) {
              console.log(`[X-NEWS] Success with: ${instance}${targetPath} (${items.length} news)`);
              return json({ items, feedTitle: `X: ${context}` });
            }

            // User-NotFound / Empty Detection
            const lowerHtml = html.toLowerCase();
            if (lowerHtml.includes("no tweets found") || lowerHtml.includes("user not found") || lowerHtml.includes("unavailable")) {
              console.log(`[X-NEWS] Instance ${instance} reports no tweets or user not found for ${xCmd.value}. Returning empty.`);
              return json({ items: [], feedTitle: `X: ${context} (Empty)` });
            }

            if (hasTitle.includes("loading")) continue;

            console.warn(`[X-NEWS] Instance ${instance}${targetPath} ("${hasTitle}") returned 0 news. Snippet: ${html.substring(0, 100).replace(/\n/g, " ")}`);
          } catch (e: any) {
            console.warn(`[X-NEWS] Instance ${instance} failed on ${targetPath}: ${e.message}`);
            // Move to next instance if it's a hard error like Bot-Block
            if (e.message.includes("HTTP") || e.message === "Bot-Block") {
              instanceBackoff.set(instance, now + BACKOFF_MS);
              break;
            }
          }
        }
      }
      throw new Error("All X-instances failed or returned empty content.");
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
