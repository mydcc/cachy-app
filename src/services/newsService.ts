/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { settingsState } from "../stores/settings.svelte";
import { rssParserService } from "./rssParserService";
import { discordService } from "./discordService";
import { getPresetUrls } from "../config/rssPresets";
import { logger } from "./logger";
import { apiQuotaTracker } from "./apiQuotaTracker.svelte";
import { dbService } from "./dbService";
import { z } from "zod";
import CryptoJS from "crypto-js";
import { safeJsonParse } from "../utils/safeJson";

const isBrowser = typeof window !== "undefined";

// --- Interfaces & Constants ---
export interface NewsItem {
  title: string;
  url: string;
  source: string;
  published_at: string;
  currencies?: { code: string; title: string }[];
  id?: string; // Hash für Deduplizierung
}

export interface SentimentAnalysis {
  score: number; // -1 to 1
  regime: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNCERTAIN";
  summary: string;
  keyFactors: string[];
}

const NewsItemSchema = z.object({
  title: z.string().min(1),
  url: z.string().url().or(z.string().startsWith("http")), // Strict but with fallback for internal formats
  source: z.string().min(1),
  published_at: z.string(),
  currencies: z.array(z.object({ code: z.string(), title: z.string() })).optional(),
  id: z.string().optional(),
});

const NewsCacheEntrySchema = z.object({
  symbol: z.string(),
  items: z.array(NewsItemSchema),
  timestamp: z.number(),
  lastApiCall: z.number(),
});

const SentimentAnalysisSchema = z.object({
  score: z.number(),
  regime: z.enum(["BULLISH", "BEARISH", "NEUTRAL", "UNCERTAIN"]),
  summary: z.string(),
  keyFactors: z.array(z.string()),
});

const SentimentCacheSchema = z.object({
  data: SentimentAnalysisSchema,
  timestamp: z.number(),
  newsHash: z.string(),
});

const COIN_ALIASES: Record<string, string[]> = {
  BTC: ["Bitcoin", "BTC"],
  ETH: ["Ethereum", "Ether", "ETH"],
  XRP: ["Ripple", "XRP"],
  SOL: ["Solana", "SOL"],
  ADA: ["Cardano", "ADA"],
  DOGE: ["Dogecoin", "DOGE"],
  DOT: ["Polkadot", "DOT"],
  MATIC: ["Polygon", "MATIC"],
  LTC: ["Litecoin", "LTC"],
  LINK: ["Chainlink", "LINK"],
  AVAX: ["Avalanche", "AVAX"],
  UNI: ["Uniswap", "UNI"],
  ATOM: ["Cosmos", "ATOM"],
  XLM: ["Stellar", "XLM"],
  XMR: ["Monero", "XMR"],
  ALGO: ["Algorand", "ALGO"],
  NEAR: ["Near Protocol", "NEAR"],
  BCH: ["Bitcoin Cash", "BCH"],
  TRX: ["Tron", "TRX"],
  ETC: ["Ethereum Classic", "ETC"],
};

function matchesSymbol(text: string, symbol: string): boolean {
  if (!text || !symbol) return false;
  const cleanSym = symbol.toUpperCase().replace("USDT", "").replace("USDC", "");
  const keywords = COIN_ALIASES[cleanSym] || [cleanSym];

  return keywords.some((k) => {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      return regex.test(text);
  });
}

const CACHE_PREFIX_NEWS_COIN = "news_"; // Prefixed ID for IDB
const CACHE_KEY_NEWS_GLOBAL = "news_global";
const CACHE_KEY_SENTIMENT = "sentiment_global";
const CACHE_TTL_NEWS = 1000 * 60 * 60 * 24; // 24 hours
const CACHE_TTL_SENTIMENT = 1000 * 60 * 15; // 15 minutes
const MIN_NEWS_PER_COIN = 10;
const MAX_NEWS_AGE_MS = 1000 * 60 * 60 * 24;
const MAX_SYMBOLS_CACHED = 20;

interface NewsCacheEntry {
  id: string; // Used as keyPath in IDB
  symbol: string;
  items: NewsItem[];
  timestamp: number;
  lastApiCall: number;
}

// Deduplication trackers
const pendingNewsFetches = new Map<string, Promise<NewsItem[]>>();
const pendingSentimentFetches = new Map<
  string,
  Promise<SentimentAnalysis | null>
>();

const MIN_FETCH_INTERVAL = 1000 * 60 * 30; // 30 mins

function shouldFetchNews(cached: NewsCacheEntry | undefined | null): boolean {
  if (!cached) {
    if (apiQuotaTracker.isQuotaExhausted("cryptopanic")) return false;
    return true;
  }

  const now = Date.now();
  const timeSinceLastCall = now - (cached.lastApiCall || 0);
  if (timeSinceLastCall < MIN_FETCH_INTERVAL) return false;

  if (apiQuotaTracker.isQuotaExhausted("cryptopanic")) return false;

  const ageMs = now - cached.timestamp;
  if (ageMs > MAX_NEWS_AGE_MS) return true;
  if (cached.items.length < MIN_NEWS_PER_COIN) return true;

  if (cached.items.length > 0) {
    const oldestNews = cached.items[cached.items.length - 1];
    const oldestNewsAge = now - new Date(oldestNews.published_at).getTime();
    if (oldestNewsAge > MAX_NEWS_AGE_MS) return true;
  }

  return false;
}

async function pruneOldCaches() {
  if (!isBrowser) return;

  try {
    // Fetch all items to ensure we find the oldest ones (preventing alphabet-biased leaks)
    // We assume the number of cached symbols isn't massive (e.g. < 1000)
    const allNews = await dbService.getAll<NewsCacheEntry>("news");
    if (allNews.length > MAX_SYMBOLS_CACHED) {
      const sorted = allNews.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const toDelete = sorted.slice(0, allNews.length - MAX_SYMBOLS_CACHED);

      for (const item of toDelete) {
        if (item.id) await dbService.delete("news", item.id);
      }
    }
  } catch (e) {
    logger.warn("market", "[pruneOldCaches] Failed to prune caches", e);
  }
}

/**
 * Generiert eine eindeutige ID für News-Items (für Deduplizierung)
 */
function generateNewsId(item: NewsItem): string {
  // Einfacher Hash aus URL + Titel
  const raw = encodeURIComponent(item.url + item.title);
  // Using CryptoJS for consistent, safe encoding (replaces unsafe btoa)
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(raw)).substring(0, 128);
}

export const newsService = {
  async fetchNews(symbol?: string): Promise<NewsItem[]> {
    const symbolKey = symbol || "global";
    const cacheKey = symbol ? CACHE_PREFIX_NEWS_COIN + symbolKey : CACHE_KEY_NEWS_GLOBAL;

    // Check if a request for this symbol is already in progress
    if (pendingNewsFetches.has(symbolKey)) {
      return pendingNewsFetches.get(symbolKey)!;
    }

    const fetchPromise = (async (): Promise<NewsItem[]> => {
      try {
        // 1. Cache-Validierung (ASYNC with IDB)
        const cached = await dbService.get<NewsCacheEntry>("news", cacheKey);

        // Zod validation optional here as IDB stores structured data,
        // but good for schema evolution protection.
        let validCached = cached;
        if (cached) {
          const validation = NewsCacheEntrySchema.safeParse(cached);
          if (!validation.success) {
            logger.warn("ai", `[newsService] Schema mismatch in DB for ${cacheKey}. Attempting partial recovery or clearing.`, validation.error);

            // If it's just a few items failing, we could filter them,
            // but since NewsCacheEntry is an object with an items array,
            // it's cleaner to just clear and re-fetch to ensure consistency.
            validCached = undefined;
            await dbService.delete("news", cacheKey);
          }
        }

        if (validCached && !shouldFetchNews(validCached)) {
          return validCached.items;
        }

        // 2. Prüfe Quota-Status
        const isQuotaExhausted = apiQuotaTracker.isQuotaExhausted("cryptopanic");
        if (isQuotaExhausted) {
          logger.warn("market", `[fetchNews] API quota exhausted, using stale cache or fallback for ${symbolKey}`);
          if (validCached && validCached.items.length > 0) {
            return validCached.items;
          }
        }

        const { cryptoPanicApiKey, newsApiKey } = settingsState;
        let newsItems: NewsItem[] = [];

        // Prioritize CryptoPanic (wenn Quota nicht erschöpft)
        if (cryptoPanicApiKey && !isQuotaExhausted) {
          try {
            const params: any = {
              filter: settingsState.cryptoPanicFilter || "important",
              public: "true",
            };
            if (symbol) {
              const cleanSymbol = symbol
                .replace("USDT", "")
                .replace("USDC", "");
              params.currencies = cleanSymbol;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            let res;
            try {
              res = await fetch("/api/external/news", {
                method: "POST",
                body: JSON.stringify({
                  source: "cryptopanic",
                  apiKey: cryptoPanicApiKey,
                  params,
                  plan: settingsState.cryptoPanicPlan || "developer",
                }),
                signal: controller.signal,
              });
            } finally {
              clearTimeout(timeoutId);
            }

            if (res.ok) {
              const text = await res.text();
              const data = safeJsonParse(text);
              newsItems = data.results.map((item: any) => ({
                title: item.title,
                url: item.url,
                source: item.source?.title || "Unknown",
                published_at: item.published_at,
                currencies: item.currencies,
                id: generateNewsId({ title: item.title, url: item.url, source: "", published_at: "" }),
              }));
              apiQuotaTracker.logCall("cryptopanic", true);
            } else {
              const errorText = await res.text();
              apiQuotaTracker.logCall("cryptopanic", false, `${res.status}: ${errorText}`);
              logger.error("market", `CryptoPanic error: ${res.status}`, errorText);
            }
          } catch (e: any) {
            const errorMsg = e?.message || String(e);
            apiQuotaTracker.logCall("cryptopanic", false, errorMsg);
            logger.error("market", "Failed to fetch CryptoPanic", e);
          }
        }

        // NewsAPI Fallback (wenn noch zu wenig News)
        if (newsItems.length < MIN_NEWS_PER_COIN && newsApiKey) {
          try {
            const q = symbol ? symbol : "crypto bitcoin ethereum";
            const params = {
              q,
              sortBy: "publishedAt",
              language: "en",
              pageSize: "10",
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            let res;
            try {
              res = await fetch("/api/external/news", {
                method: "POST",
                body: JSON.stringify({
                  source: "newsapi",
                  apiKey: newsApiKey,
                  params,
                }),
                signal: controller.signal,
              });
            } finally {
              clearTimeout(timeoutId);
            }

            if (res.ok) {
              const text = await res.text();
              const data = safeJsonParse(text);
              const mapped = data.articles.map((item: any) => ({
                title: item.title,
                url: item.url,
                source: item.source.name,
                published_at: item.publishedAt,
                currencies: [],
                id: generateNewsId({ title: item.title, url: item.url, source: "", published_at: "" }),
              }));
              newsItems = [...newsItems, ...mapped];
              apiQuotaTracker.logCall("newsapi", true);
            } else {
              const errorText = await res.text();
              apiQuotaTracker.logCall("newsapi", false, `${res.status}: ${errorText}`);
            }
          } catch (e: any) {
            const errorMsg = e?.message || String(e);
            apiQuotaTracker.logCall("newsapi", false, errorMsg);
            logger.error("market", "Failed to fetch NewsAPI", e);
          }
        }

        // Discord
        try {
          let discordItems = await discordService.fetchDiscordNews();
          if (symbol) {
            discordItems = discordItems.filter(item => matchesSymbol(item.title, symbol));
          }
          newsItems = [...newsItems, ...discordItems];
        } catch (e) {
          logger.error("market", "Failed to fetch Discord", e);
        }

        // RSS Feeds
        const rssUrls = [
          ...getPresetUrls(settingsState.rssPresets || []),
          ...(settingsState.customRssFeeds || []).filter(
            (u) => u && u.trim().length > 0,
          ),
        ];

        if (rssUrls.length > 0) {
          try {
            let rssItems = await rssParserService.parseMultipleFeeds(rssUrls);
            if (settingsState.rssFilterBySymbol && symbol) {
              rssItems = rssItems.filter(
                (item) =>
                  matchesSymbol(item.title, symbol) ||
                  matchesSymbol(item.url, symbol),
              );
            }
            newsItems = [...newsItems, ...rssItems];
          } catch (e) {
            logger.error("market", "Failed to fetch RSS feeds", e);
          }
        }

        // Deduplizierung basierend auf ID und strikte Filterung
        const uniqueNews = new Map<string, NewsItem>();
        newsItems.forEach((item) => {
          if (!item.url || typeof item.url !== "string" || item.url.trim() === "") {
            logger.debug("market", "[newsService] Skipping item without URL", item.title);
            return;
          }
          const id = item.id || generateNewsId(item);
          if (!uniqueNews.has(id)) {
            uniqueNews.set(id, { ...item, id });
          }
        });
        newsItems = Array.from(uniqueNews.values());

        // Sortierung nach Datum (neueste zuerst)
        newsItems.sort(
          (a, b) =>
            new Date(b.published_at).getTime() -
            new Date(a.published_at).getTime(),
        );

        // Limit to 100 items to prevent unbounded growth
        if (newsItems.length > 100) {
          newsItems = newsItems.slice(0, 100);
        }

        // Cache-Update with IDB
        const cacheEntry: NewsCacheEntry = {
          id: cacheKey, // keyPath
          symbol: symbolKey,
          items: newsItems,
          timestamp: Date.now(),
          lastApiCall: Date.now(),
        };

        await dbService.put("news", cacheEntry);

        // Bereinige alte Caches (Async)
        pruneOldCaches().catch(e => logger.warn("ai", "Prune failed", e));

        return newsItems;
      } finally {
        pendingNewsFetches.delete(symbolKey);
      }
    })();

    pendingNewsFetches.set(symbolKey, fetchPromise);
    return fetchPromise;
  },

  async analyzeSentiment(news: NewsItem[]): Promise<SentimentAnalysis | null> {
    if (news.length === 0) return null;
    const newsHash = news[0].title;

    if (pendingSentimentFetches.has(newsHash)) {
      return pendingSentimentFetches.get(newsHash)!;
    }

    // Immer serverseitig, kein allowClientSideAi mehr
    const analysisPromise = (async (): Promise<SentimentAnalysis | null> => {
      try {
        // IDB Read
        const cached = await dbService.get<{ data: SentimentAnalysis; timestamp: number; newsHash: string }>("sentiment", newsHash);

        if (
          cached &&
          Date.now() - cached.timestamp < CACHE_TTL_SENTIMENT &&
          cached.newsHash === newsHash
        ) {
          return cached.data;
        }

        const { aiProvider, geminiApiKey, openaiApiKey } = settingsState;
        if (!aiProvider) return null;

        const headlines = news
          .slice(0, 10)
          .map((n) => `- ${n.published_at}: ${n.title} (${n.source})`);

        // Prepare request to server
        const payload = {
          headlines,
          provider: aiProvider,
          model: aiProvider === "openai" ? (settingsState.openaiModel || "gpt-4o") : (settingsState.geminiModel || "gemini-1.5-flash"),
          apiKey: aiProvider === "openai" ? openaiApiKey : geminiApiKey
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s for AI

        // Secure Server-Side Execution
        const response = await fetch("/api/sentiment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Sentiment API failed (${response.status}): ${errText}`);
        }

        const text = await response.text();
        const data = safeJsonParse(text);
        if (data.error) throw new Error(data.error);

        const analysis: SentimentAnalysis = data.analysis;

        // IDB Write - use newsHash as key
        await dbService.put("sentiment", {
          data: analysis,
          timestamp: Date.now(),
          newsHash,
        });

        return analysis;
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (msg.includes("NO_GEMINI_KEY") || msg.includes("NO_OPENAI_KEY")) {
          logger.warn("ai", "Sentiment analysis skipped: Missing API Key");
        } else {
          logger.error("ai", "Sentiment Analysis Failed", e);
        }
        return {
          score: 0,
          regime: "UNCERTAIN",
          summary: "Failed to analyze sentiment.",
          keyFactors: [],
        };
      } finally {
        pendingSentimentFetches.delete(newsHash);
      }
    })();

    pendingSentimentFetches.set(newsHash, analysisPromise);
    return analysisPromise;
  },
};
