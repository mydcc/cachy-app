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

const CACHE_KEY_NEWS = "cachy_news_cache";
const CACHE_KEY_SENTIMENT = "cachy_sentiment_cache";
const CACHE_TTL_NEWS = 1000 * 60 * 5; // 5 minutes
const CACHE_TTL_SENTIMENT = 1000 * 60 * 15; // 15 minutes

export const newsService = {
  async fetchNews(symbol?: string): Promise<NewsItem[]> {
    const cached = localStorage.getItem(CACHE_KEY_NEWS);
    if (cached) {
      const { data, timestamp, cachedSymbol } = JSON.parse(cached);
      // If symbol matches (or both undefined) and cache is fresh
      if (
        Date.now() - timestamp < CACHE_TTL_NEWS &&
        ((!symbol && !cachedSymbol) || symbol === cachedSymbol)
      ) {
        return data;
      }
    }

    const { cryptoPanicApiKey, newsApiKey } = settingsState;
    let newsItems: NewsItem[] = [];

    // Prioritize CryptoPanic for crypto
    if (cryptoPanicApiKey) {
      try {
        const params: any = {
          filter: settingsState.cryptoPanicFilter || "important",
          public: "true",
        };
        if (symbol) {
          // CryptoPanic uses "currencies" param, e.g. "BTC"
          // We need to strip "USDT" suffix usually
          const cleanSymbol = symbol.replace("USDT", "").replace("USDC", "");
          params.currencies = cleanSymbol;
        }

        const res = await fetch("/api/external/news", {
          method: "POST",
          body: JSON.stringify({
            source: "cryptopanic",
            apiKey: cryptoPanicApiKey,
            params,
            plan: settingsState.cryptoPanicPlan || "developer"
          }),
        });

        if (res.ok) {
          const data = await res.json();
          // Map CryptoPanic format
          newsItems = data.results.map((item: any) => ({
            title: item.title,
            url: item.url,
            source: item.source?.title || "Unknown",
            published_at: item.published_at,
            currencies: item.currencies
          }));
        }
      } catch (e) {
        // console.error("Failed to fetch CryptoPanic:", e);
      }
    }

    // Fallback or Addition: NewsAPI (only if CryptoPanic didn't yield enough or is missing)
    if (newsItems.length < 5 && newsApiKey) {
      try {
        const q = symbol ? symbol : "crypto bitcoin ethereum";
        const params = {
          q,
          sortBy: "publishedAt",
          language: "en",
          pageSize: "10"
        };

        const res = await fetch("/api/external/news", {
          method: "POST",
          body: JSON.stringify({
            source: "newsapi",
            apiKey: newsApiKey,
            params
          })
        });

        if (res.ok) {
          const data = await res.json();
          const mapped = data.articles.map((item: any) => ({
            title: item.title,
            url: item.url,
            source: item.source.name,
            published_at: item.publishedAt,
            currencies: []
          }));
          newsItems = [...newsItems, ...mapped];
        }
      } catch (e) {
        // console.error("Failed to fetch NewsAPI:", e);
      }
    }

    // Sort by date desc
    newsItems.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());

    // Cache
    localStorage.setItem(CACHE_KEY_NEWS, JSON.stringify({
      data: newsItems,
      timestamp: Date.now(),
      cachedSymbol: symbol
    }));

    return newsItems;
  },

  async analyzeSentiment(news: NewsItem[]): Promise<SentimentAnalysis | null> {
    if (news.length === 0) return null;

    // Check Cache
    const cached = localStorage.getItem(CACHE_KEY_SENTIMENT);
    if (cached) {
      const { data, timestamp, newsHash } = JSON.parse(cached);
      // Simple hash check: if first news title is same, assume same news set (heuristic)
      const currentHash = news[0].title;
      if (Date.now() - timestamp < CACHE_TTL_SENTIMENT && newsHash === currentHash) {
        return data;
      }
    }

    const { aiProvider, geminiApiKey, openaiApiKey, anthropicApiKey } = settingsState;

    if (!aiProvider) return null;

    // Construct Prompt
    const headlines = news.slice(0, 10).map(n => `- ${n.published_at}: ${n.title} (${n.source})`).join("\n");
    const prompt = `
You are a Financial Reinforcement Learning (FinRL) Environment Interpreter.
Your task is to analyze the "External World State" based on recent news headlines.

NEWS HEADLINES:
${headlines}

INSTRUCTIONS:
1. Analyze the sentiment of these headlines collectively.
2. Assign a sentiment score from -1.0 (Extreme Bearish/Fear) to 1.0 (Extreme Bullish/Greed).
3. Determine the current market regime: BULLISH, BEARISH, NEUTRAL, or UNCERTAIN.
4. Summarize the "state of the world" in one sentence for a trading bot.
5. List 2-3 key factors driving this sentiment.

OUTPUT FORMAT (JSON ONLY):
{
  "score": number,
  "regime": "string",
  "summary": "string",
  "keyFactors": ["string", "string"]
}
`;

    async function fetchWithRetry(prompt: string, apiKey: string, modelName: string, retries = 3, delay = 2000): Promise<string> {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });

      for (let i = 0; i < retries; i++) {
        try {
          const result = await model.generateContent(prompt);
          return result.response.text();
        } catch (e: any) {
          const errMsg = e?.message || "";
          const isOverloaded = errMsg.includes("503") || errMsg.includes("overloaded");
          const isQuota = errMsg.includes("429") || errMsg.toLowerCase().includes("quota");

          if (isQuota) {
            // console.warn(`[newsService] Gemini Quota Exceeded (429). Stopping retries.`);
            throw new Error("GEMINI_QUOTA_EXCEEDED"); // Custom error to catch below
          }

          if (isOverloaded && i < retries - 1) {
            // console.warn(`[newsService] Gemini overloaded, retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
            continue;
          }
          throw e;
        }
      }
      return "";
    }

    try {
      let resultText = "";

      if (aiProvider === "gemini" && geminiApiKey) {
        resultText = await fetchWithRetry(prompt, geminiApiKey, settingsState.geminiModel || "gemini-1.5-flash");
      } else if (aiProvider === "openai" && openaiApiKey) {
        // Dynamic import to avoid loading openai in browser bundle
        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey: openaiApiKey, dangerouslyAllowBrowser: true });
        const completion = await openai.chat.completions.create({
          messages: [{ role: "system", content: "You are a financial analyst." }, { role: "user", content: prompt }],
          model: settingsState.openaiModel || "gpt-4o",
          response_format: { type: "json_object" }
        });
        resultText = completion.choices[0].message.content || "{}";
      }

      if (!resultText) throw new Error("No response from AI");

      // Clean markdown code blocks if present
      resultText = resultText.replace(/```json/g, "").replace(/```/g, "").trim();
      const analysis: SentimentAnalysis = JSON.parse(resultText);

      // Cache
      localStorage.setItem(CACHE_KEY_SENTIMENT, JSON.stringify({
        data: analysis,
        timestamp: Date.now(),
        newsHash: news[0].title
      }));

      return analysis;

    } catch (e: any) {
      // Graceful error logging
      const msg = e?.message || "";
      if (msg.includes("GEMINI_QUOTA_EXCEEDED") || msg.includes("429") || msg.toLowerCase().includes("quota")) {
        // console.warn("Sentiment Analysis: AI Quota Exceeded (Warning only).");
      } else {
        // console.error("Sentiment Analysis Failed:", e);
      }

      return {
        score: 0,
        regime: "UNCERTAIN",
        summary: msg.includes("QUOTA") ? "Analysis unavailable (AI Quota Exceeded)." : "Failed to analyze sentiment.",
        keyFactors: []
      };
    }
  }
};
