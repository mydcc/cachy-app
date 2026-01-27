/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { settingsState } from "../stores/settings.svelte";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { rssParserService } from "./rssParserService";
import { discordService } from "./discordService";
import { getPresetUrls } from "../config/rssPresets";
import { logger } from "./logger";
import { apiQuotaTracker } from "./apiQuotaTracker";
import { z } from "zod";

const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";

function safeReadCache<T>(key: string, schema?: z.ZodType<T>): T | null {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (schema) {
      const validation = schema.safeParse(parsed);
      if (!validation.success) {
        // Log brief error to avoid console spam
        logger.log("ai", `[newsService] Cache validation failed for ${key}, resetting cache.`);
        localStorage.removeItem(key);
        return null;
      }
      return validation.data;
    }

    return parsed as T;
  } catch (e) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    logger.warn("ai", `[newsService] Corrupted cache cleared for ${key}`);
    return null;
  }
}

function safeWriteCache<T>(key: string, value: T) {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    logger.warn("ai", `[newsService] Failed to persist cache ${key}`);
  }
}

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
  title: z.string(),
  url: z.string(),
  source: z.string(),
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

  const lowerText = text.toLowerCase();
  return keywords.some((k) => lowerText.includes(k.toLowerCase()));
}

const CACHE_PREFIX_NEWS_COIN = "cachy_news_coin_"; // Pro-Coin-Cache
const CACHE_KEY_NEWS_GLOBAL = "cachy_news_global"; // Globaler Pool
const CACHE_KEY_SENTIMENT = "cachy_sentiment_cache";
const CACHE_TTL_NEWS = 1000 * 60 * 60 * 24; // 24 Stunden
const CACHE_TTL_SENTIMENT = 1000 * 60 * 15; // 15 minutes
const MIN_NEWS_PER_COIN = 10; // Mindestanzahl News pro Coin
const MAX_NEWS_AGE_MS = 1000 * 60 * 60 * 24; // 24h max Alter
const MAX_SYMBOLS_CACHED = 20; // Max. Symbole im Cache

interface NewsCacheEntry {
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

const MIN_FETCH_INTERVAL = 1000 * 60 * 30; // 30 Minuten Cooldown zwischen API Calls

/**
 * Prüft, ob News für ein Symbol abgerufen werden müssen
 */
function shouldFetchNews(symbol: string | undefined): boolean {
  const symbolKey = symbol || "global";
  const cacheKey = symbol ? CACHE_PREFIX_NEWS_COIN + symbolKey : CACHE_KEY_NEWS_GLOBAL;
  const cached = safeReadCache<NewsCacheEntry>(cacheKey, NewsCacheEntrySchema);

  if (!cached) {
    return true;
  }

  const now = Date.now();

  // 0. Hard Limit: Respektiere Cooldown (Rate Limit Schutz)
  // Egal wie "schlecht" der Cache ist, wir fragen nicht öfter als alle 30min an.
  const timeSinceLastCall = now - (cached.lastApiCall || 0);
  if (timeSinceLastCall < MIN_FETCH_INTERVAL) {
    return false;
  }

  const ageMs = now - cached.timestamp;

  // Bedingung 1: Cache selbst ist veraltet (älter als 24h)
  if (ageMs > MAX_NEWS_AGE_MS) {
    return true;
  }

  // Bedingung 2: Weniger als MIN_NEWS_PER_COIN News
  // Nur wenn wir noch Quota haben und der letzte Call länger her ist
  if (cached.items.length < MIN_NEWS_PER_COIN) {
    return true;
  }

  // Bedingung 3: Älteste News ist > 24h alt (bei vollem Cache)
  if (cached.items.length > 0) {
    const oldestNews = cached.items[cached.items.length - 1];
    const oldestNewsAge = now - new Date(oldestNews.published_at).getTime();
    if (oldestNewsAge > MAX_NEWS_AGE_MS) {
      return true;
    }
  }

  return false;
}

/**
 * Bereinigt alte Caches wenn zu viele Symbole gespeichert sind
 */
function pruneOldCaches() {
  if (!isBrowser) return;

  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX_NEWS_COIN));

    if (keys.length > MAX_SYMBOLS_CACHED) {
      // Sortiere nach Alter (älteste zuerst)
      const sorted = keys
        .map(k => ({
          key: k,
          entry: safeReadCache<NewsCacheEntry>(k, NewsCacheEntrySchema),
        }))
        .filter(x => x.entry !== null)
        .sort((a, b) => a.entry!.timestamp - b.entry!.timestamp);

      // Lösche älteste bis unter Limit
      const toDelete = sorted.slice(0, keys.length - MAX_SYMBOLS_CACHED);
      toDelete.forEach(x => {
        localStorage.removeItem(x.key);
      });
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
  return btoa(encodeURIComponent(item.url + item.title)).substring(0, 32);
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
        // 1. Cache-Validierung mit intelligenter Logik
        const cached = safeReadCache<NewsCacheEntry>(cacheKey, NewsCacheEntrySchema);
        if (cached && !shouldFetchNews(symbol)) {
          return cached.items;
        }

        // 2. Prüfe Quota-Status
        const isQuotaExhausted = apiQuotaTracker.isQuotaExhausted("cryptopanic");
        if (isQuotaExhausted) {
          logger.warn("market", `[fetchNews] API quota exhausted, using stale cache or fallback for ${symbolKey}`);
          // Nutze alte Cache-Daten wenn vorhanden
          if (cached && cached.items.length > 0) {
            return cached.items;
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

            const res = await fetch("/api/external/news", {
              method: "POST",
              body: JSON.stringify({
                source: "cryptopanic",
                apiKey: cryptoPanicApiKey,
                params,
                plan: settingsState.cryptoPanicPlan || "developer",
              }),
            });

            if (res.ok) {
              const data = await res.json();
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

            const res = await fetch("/api/external/news", {
              method: "POST",
              body: JSON.stringify({
                source: "newsapi",
                apiKey: newsApiKey,
                params,
              }),
            });

            if (res.ok) {
              const data = await res.json();
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

        // RSS Feeds (Only if enabled in settings)
        if (settingsState.enableNewsScraper) {
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
        }

        // Deduplizierung basierend auf ID
        const uniqueNews = new Map<string, NewsItem>();
        newsItems.forEach(item => {
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

        // Cache-Update mit neuer Struktur
        const cacheEntry: NewsCacheEntry = {
          symbol: symbolKey,
          items: newsItems,
          timestamp: Date.now(),
          lastApiCall: Date.now(),
        };
        safeWriteCache(cacheKey, cacheEntry);

        // Bereinige alte Caches
        pruneOldCaches();

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
        const cached = safeReadCache<{ data: SentimentAnalysis; timestamp: number; newsHash: string }>(CACHE_KEY_SENTIMENT, SentimentCacheSchema);
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
          .map((n) => `- ${n.published_at}: ${n.title} (${n.source})`)
          .join("\n");
        const prompt = `Analyze sentiment for these headlines. score -1 to 1. regime: BULLISH, BEARISH, NEUTRAL, UNCERTAIN.\n\n${headlines}\n\nOutput JSON ONLY: { "score": number, "regime": "string", "summary": "string", "keyFactors": ["string"] }`;

        let resultText = "";

        if (aiProvider === "gemini" && geminiApiKey) {
          const genAI = new GoogleGenerativeAI(geminiApiKey);
          const model = genAI.getGenerativeModel({
            model: settingsState.geminiModel || "gemini-1.5-flash",
          });

          let lastErr = null;
          for (let i = 0; i < 3; i++) {
            try {
              const result = await model.generateContent(prompt);
              resultText = result.response.text();
              break;
            } catch (e: any) {
              lastErr = e;
              const msg = e?.message || "";
              if (msg.includes("503") || msg.includes("overloaded")) {
                await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
                continue;
              }
              throw e;
            }
          }
          if (!resultText && lastErr) throw lastErr;
        } else if (aiProvider === "openai" && openaiApiKey) {
          const { default: OpenAI } = await import("openai");
          const openai = new OpenAI({
            apiKey: openaiApiKey,
            dangerouslyAllowBrowser: true,
          });
          const completion = await openai.chat.completions.create({
            messages: [
              { role: "system", content: "Analyze sentiment." },
              { role: "user", content: prompt },
            ],
            model: settingsState.openaiModel || "gpt-4o",
            response_format: { type: "json_object" },
          });
          resultText = completion.choices[0].message.content || "{}";
        }

        if (!resultText) return null;
        const analysis: SentimentAnalysis = JSON.parse(
          resultText
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim(),
        );

        safeWriteCache(CACHE_KEY_SENTIMENT, {
          data: analysis,
          timestamp: Date.now(),
          newsHash,
        });

        return analysis;
      } catch (e: any) {
        logger.error("ai", "Sentiment Analysis Failed", e);
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
