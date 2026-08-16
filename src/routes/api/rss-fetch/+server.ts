/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import Parser from "rss-parser";
import { checkClientToken } from "../../../lib/server/clientToken";
import { createRateLimiter } from "../../../lib/server/rateLimit";
import { sanitizeHtmlToText } from "../../../lib/server/sanitizer";

// checkClientToken already rate-limits per token/IP; this is defense in depth
// on top of it (BUG-0052)
const _rateLimits = createRateLimiter({ windowMs: 60 * 1000, max: 30 });

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
});

// Advanced Cache for RSS feeds
interface CachedFeed {
  data: unknown;
  timestamp: number;
}

const feedCache = new Map<string, CachedFeed>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes for standard RSS
const MAX_CACHE_SIZE = 100;

function isPrivateOrReservedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Localhost, metadata and internal TLDs
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".lan") ||
    lower.endsWith(".home") ||
    lower.endsWith(".arpa")
  ) {
    return true;
  }

  // IPv6 loopback / private
  if (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fe80:") ||
    lower.startsWith("fc00:") ||
    lower.startsWith("fd00:") ||
    lower.startsWith("::ffff:")
  ) {
    return true;
  }

  // Check IPv4 address
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = lower.match(ipv4Regex);
  if (match) {
    const octets = match.slice(1).map(Number);
    if (octets.some((o) => o > 255)) return true;

    const [a, b] = octets;
    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 169.254.0.0/16 (Link-Local & Cloud Metadata / AWS IMDS)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private Class B)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (Private Class C)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (a >= 224) return true;
  }

  return false;
}

function isUrlAllowed(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    // 1. Only http and https
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;

    // 2. Reject private, loopback, or metadata addresses
    if (isPrivateOrReservedHost(u.hostname)) return false;

    // 3. Must have a valid dot in hostname (e.g. bitcoin-kurier.de)
    if (!u.hostname.includes(".")) return false;

    return true;
  } catch {
    return false;
  }
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  if (!_rateLimits.consume(getClientAddress())) {
    return json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { url } = body;

    if (!url || !isUrlAllowed(url)) {
      return json({ error: "Invalid or prohibited URL" }, { status: 403 });
    }

    const tryFetch = async (targetUrl: string, timeout = 10000): Promise<string> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      const uas = [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
      ];
      const ua = uas[Math.floor(Math.random() * uas.length)];

      try {
        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": ua,
            "Accept": "application/rss+xml, application/xml, text/xml, application/atom+xml, text/html;q=0.9, */*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "max-age=0",
          },
        });

        if (response.status === 429 || response.status === 403) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        clearTimeout(id);

        const lower = text.toLowerCase();
        if (
          lower.includes("cloudflare") &&
          (lower.includes("verify you are human") || lower.includes("challenge-running"))
        ) {
          throw new Error("Bot-Block");
        }
        return text;
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
    };

    if (url) {
      // Standard RSS with memory cache
      const cached = feedCache.get(url);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return json(cached.data);
      }

      const xml = await tryFetch(url, 10000);
      const parsed = await parser.parseString(xml);
      const result = {
        items: (parsed.items || []).map((item) => ({
          title: item.title || "Untitled",
          url: item.link || url,
          source: parsed.title || new URL(url).hostname,
          published_at: item.isoDate || item.pubDate || new Date().toISOString(),
          description: sanitizeHtmlToText(item.contentSnippet || item.summary || item.content || ""),
        })),
        feedTitle: parsed.title,
      };

      // Enforce Cache Limit (LRU-ish: delete oldest if full)
      if (feedCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = feedCache.keys().next().value;
        if (oldestKey) feedCache.delete(oldestKey);
      }

      feedCache.set(url, { data: result, timestamp: Date.now() });
      return json(result);
    } else {
      return json({ error: "Missing parameters" }, { status: 400 });
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[RSS-FETCH] Error: ${message}`);
    return json({ error: message }, { status: 500 });
  }
};
