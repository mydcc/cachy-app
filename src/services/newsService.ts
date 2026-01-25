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

const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";

function safeReadCache<T>(key: string): T | null {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
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
}

export interface SentimentAnalysis {
  score: number; // -1 to 1
  regime: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNCERTAIN";
  summary: string;
  keyFactors: string[];
}

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

const CACHE_KEY_NEWS = "cachy_news_cache";
const CACHE_KEY_SENTIMENT = "cachy_sentiment_cache";
const CACHE_TTL_NEWS = 1000 * 60 * 5; // 5 minutes
const CACHE_TTL_SENTIMENT = 1000 * 60 * 15; // 15 minutes

// Deduplication trackers
const pendingNewsFetches = new Map<string, Promise<NewsItem[]>>();
const pendingSentimentFetches = new Map<
  string,
  Promise<SentimentAnalysis | null>
>();

export const newsService = {
  async fetchNews(symbol?: string): Promise<NewsItem[]> {
    const symbolKey = symbol || "global";

    // Check if a request for this symbol is already in progress
    if (pendingNewsFetches.has(symbolKey)) {
      return pendingNewsFetches.get(symbolKey)!;
    }

    const fetchPromise = (async (): Promise<NewsItem[]> => {
      try {
        const cached = safeReadCache<{ data: NewsItem[]; timestamp: number; cachedSymbol?: string }>(CACHE_KEY_NEWS);
        if (
          cached &&
          Date.now() - cached.timestamp < CACHE_TTL_NEWS &&
          ((!symbol && !cached.cachedSymbol) || symbol === cached.cachedSymbol)
        ) {
          return cached.data;
        }

        const { cryptoPanicApiKey, newsApiKey } = settingsState;
        let newsItems: NewsItem[] = [];

        // Prioritize CryptoPanic
        if (cryptoPanicApiKey) {
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
              }));
            }
          } catch (e) {
            logger.error("market", "Failed to fetch CryptoPanic", e);
          }
        }

        // NewsAPI Fallback
        if (newsItems.length < 5 && newsApiKey) {
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
              }));
              newsItems = [...newsItems, ...mapped];
            }
          } catch (e) {
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

        newsItems.sort(
          (a, b) =>
            new Date(b.published_at).getTime() -
            new Date(a.published_at).getTime(),
        );

        safeWriteCache(CACHE_KEY_NEWS, {
          data: newsItems,
          timestamp: Date.now(),
          cachedSymbol: symbol,
        });

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
        const cached = safeReadCache<{ data: SentimentAnalysis; timestamp: number; newsHash: string }>(CACHE_KEY_SENTIMENT);
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
