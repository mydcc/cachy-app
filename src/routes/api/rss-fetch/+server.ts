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

// Long-term Tweet Store (in-memory for now, could be persisted to disk if needed)
// Map<UserHandle/Hashtag, Map<TweetID/TitleHash, Tweet>>
const tweetStore = new Map<string, Map<string, any>>();
const TWEET_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours for tweets

// Verified instances list (User Provided)
const NITTER_INSTANCES = [
  "xcancel.com",
  "nitter.tiekoetter.com",
  "nitter.privacyredirect.com",
  "nitter.poast.org",
  "nitter.catsarch.com",
  "nitter.space",
  "nitter.net",
  "lightbrd.com",
  "nuku.trabun.org"
];

// In-memory blacklist with dynamic backoff
const instanceBackoff = new Map<string, number>();
const BACKOFF_STEP = 5 * 60 * 1000; // 5 minutes base backoff
const MAX_BACKOFF = 60 * 60 * 1000; // Max 1 hour backoff

/**
 * Generates a simple hash for deduplication if no ID is available
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

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
 * Improved HTML Scraper for Nitter
 */
function scrapeNitterHTML(html: string, baseUrl: string): any[] {
  const items: any[] = [];
  const blocks = html.split(/class\s*=\s*["'][^"']*(?:timeline-item|tweet-body)[^"']*["']/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const contentMatch = block.match(/class\s*=\s*["'][^"']*tweet-content[^"']*["'][^>]*>/);
    if (!contentMatch) continue;

    const startIndex = block.indexOf(contentMatch[0]) + contentMatch[0].length;
    const contentRaw = block.substring(startIndex);

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

    const tweetId = hashString(textContent);

    // Try to find the tweet link
    const linkMatch = block.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*tweet-link[^"']*["']/);
    let tweetUrl = `https://x.com/search?q=${encodeURIComponent(textContent.substring(0, 50))}`;

    if (linkMatch && linkMatch[1]) {
      tweetUrl = `https://x.com${linkMatch[1]}`;
    }

    items.push({
      id: tweetId,
      title: textContent.substring(0, 100) + (textContent.length > 100 ? "..." : ""),
      url: tweetUrl,
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

    const tryFetch = async (targetUrl: string, timeout = 7000): Promise<string> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      const uas = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
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
            "Cache-Control": "no-cache",
            "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
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

    if (xCmd) {
      context = `@${xCmd.value}`;
      const now = Date.now();

      // 1. Check Long-term Cache first
      const storeKey = `${xCmd.type}:${xCmd.value}`;
      const stored = tweetStore.get(storeKey);
      if (stored) {
        // If we have data and it's fresh, return it
        const items = Array.from(stored.values()).filter(i => (now - new Date(i.cached_at).getTime()) < TWEET_CACHE_TTL);
        if (items.length > 5) { // Only return if we have a decent amount of fresh data
          console.log(`[X-NEWS] Serving from Long-term Cache: ${context} (${items.length} items)`);
          return json({ items, feedTitle: `X: ${context} (Cached)` });
        }
      }

      const available = NITTER_INSTANCES.filter(inst => (instanceBackoff.get(inst) || 0) < now);
      const pool = shuffle(available.length > 0 ? available : NITTER_INSTANCES);

      console.log(`[X-NEWS] Fetching: ${context}. Available: ${pool.length}/${NITTER_INSTANCES.length}`);

      for (const instance of pool) {
        const paths = xCmd.type === "user"
          ? [`/${xCmd.value}`, `/search?q=from:${xCmd.value}&f=tweets`]
          : [`/search?f=tweets&q=%23${xCmd.value}`];

        let failedOnMsg = "";

        for (const targetPath of paths) {
          try {
            await new Promise(r => setTimeout(r, Math.random() * 1000 + 500)); // Small random delay
            const html = await tryFetch(`https://${instance}${targetPath}`, 6000);

            if (!html) continue;

            const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
            const title = (titleMatch?.[1] || "").toLowerCase();

            if (title.includes("nitter") && !title.includes(xCmd.value.toLowerCase()) && !title.includes("search")) {
              // Likely a redirect to homepage or error page that didn't throw HTTP error
              continue;
            }

            const newItems = scrapeNitterHTML(html, instance);
            if (newItems.length > 0) {
              // Merge with store
              let userStore = tweetStore.get(storeKey);
              if (!userStore) {
                userStore = new Map();
                tweetStore.set(storeKey, userStore);
              }

              newItems.forEach(item => {
                if (!userStore!.has(item.id)) {
                  userStore!.set(item.id, { ...item, cached_at: new Date().toISOString() });
                }
              });

              const allItems = Array.from(userStore.values())
                .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
                .slice(0, 40);

              console.log(`[X-NEWS] Success: ${instance} for ${context} (${newItems.length} new, ${allItems.length} total)`);
              instanceBackoff.delete(instance); // Reset backoff on success
              return json({ items: allItems, feedTitle: `X: ${context}` });
            }
          } catch (e: any) {
            failedOnMsg = e.message;

            // Optimization: If user profile is blocked, search will likely be blocked too. 
            // Don't waste time trying the second path for this instance.
            if (e.message.includes("HTTP 403") || e.message.includes("Bot-Block") || e.message.includes("429")) {
              break;
            }
          }
        }

        // Log failure for this instance after trying paths
        if (failedOnMsg) {
          console.warn(`[X-NEWS] Instance ${instance} failed: ${failedOnMsg}`);
          const currentBackoff = instanceBackoff.get(instance) || 0;
          const newBackoff = Math.min(MAX_BACKOFF, Math.max(now + BACKOFF_STEP, currentBackoff + BACKOFF_STEP));
          instanceBackoff.set(instance, newBackoff);
        }
      }

      // Final fallback: Return what we have in store even if old
      if (stored && stored.size > 0) {
        return json({ items: Array.from(stored.values()), feedTitle: `X: ${context} (Stale)` });
      }

      throw new Error("All instances failed");
    } else if (url) {
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

      feedCache.set(url, { data: result, timestamp: Date.now() });
      return json(result);
    } else {
      return json({ error: "Missing parameters" }, { status: 400 });
    }

  } catch (error: any) {
    if (error.message === "All instances failed") {
      console.warn(`[RSS-FETCH] ${context} - All instances failed. Returning empty result.`);
      return json({
        items: [],
        feedTitle: `X: ${context} (Unavailable)`,
        error: "Unavailable",
      });
    }
    console.error(`[RSS-FETCH] Error: ${error.message}`);
    return json({ error: error.message }, { status: 500 });
  }
};
