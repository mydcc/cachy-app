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

// Advanced Cache and Persistent Store for Tweets
interface CachedFeed {
  data: any;
  timestamp: number;
}

// Memory Cache for active session
const feedCache = new Map<string, CachedFeed>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes for standard RSS
const MAX_CACHE_SIZE = 100;

// Security: Allowlist for RSS sources (SSRF Protection)
const ALLOWED_DOMAINS = [
  "cointelegraph.com", "coindesk.com", "decrypt.co", "theblock.co",
  "rss.app", "polymarket.com", "medium.com"
];

function isUrlAllowed(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    // 1. Block non-http/https
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;

    // 2. Block private IPs (Basic check, effectively covered by domain allowlist, but good practice)
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname.startsWith("192.168.") || u.hostname.startsWith("10.")) {
      return false;
    }

    // 3. Strict Domain Allowlist
    return ALLOWED_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || !isUrlAllowed(url)) {
      return json({ error: "Invalid or prohibited URL" }, { status: 403 });
    }

    const tryFetch = async (targetUrl: string, timeout = 7000): Promise<string> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      const uas = [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0"
      ];
      const ua = uas[Math.floor(Math.random() * uas.length)];

      try {
        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "max-age=0",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
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
          lower.includes("verify you are human") ||
          lower.includes("access denied") ||
          text.length < 500 // Suspiciously short response
        ) {
          throw new Error("Bot-Block");
        }
        return text;
      } catch (e: any) {
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

      const xml = await tryFetch(url, 8000);
      const parsed = await parser.parseString(xml);
      const result = {
        items: (parsed.items || []).map((item: any) => ({
          title: item.title || "Untitled",
          url: item.link || url,
          source: parsed.title || new URL(url).hostname,
          published_at: item.isoDate || item.pubDate || new Date().toISOString(),
          description: item.contentSnippet || item.content || "",
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

  } catch (error: any) {
    console.error(`[RSS-FETCH] Error: ${error.message}`);
    return json({ error: error.message }, { status: 500 });
  }
};
