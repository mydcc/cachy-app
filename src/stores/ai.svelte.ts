/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";
import { Decimal } from "decimal.js";

import { settingsState, type AiProvider } from "./settings.svelte";
import { tradeState } from "./trade.svelte";
import { marketState } from "./market.svelte";
import { accountState } from "./account.svelte";
import { journalState } from "./journal.svelte";
import { cmcService } from "../services/cmcService";
import { indicatorState } from "./indicator.svelte";
import { technicalsService } from "../services/technicalsService";
import { apiService } from "../services/apiService";
import { newsService } from "../services/newsService";
import { getRelativeTimeString } from "../lib/utils/timeUtils";
import { parseAiValue } from "../utils/utils";
import type { JournalEntry } from "./types";

export interface AiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  provider?: AiProvider;
}

export interface AiAction {
  action: string;
  value?: string | number | boolean;
  index?: number;
  percent?: number | string;
  atrMultiplier?: number | string;
}

export interface PendingAction {
  id: string;
  actions: AiAction[];
  timestamp: number;
}

const LOCAL_STORAGE_KEY = "cachy_ai_history";
const MAX_MESSAGES = 50;

class AiManager {
  messages = $state<AiMessage[]>([]);
  isStreaming = $state(false);
  error = $state<string | null>(null);
  pendingActions = $state<Map<string, PendingAction>>(new Map());
  lastContext = $state<any>(null); // Expose context for UI indicators

  constructor() {
    if (browser) {
      this.load();
    }
  }

  private load() {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.messages) {
          this.messages = parsed.messages;
        }
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("Failed to load AI history", e);
      }
    }
  }

  private save() {
    if (!browser) return;
    try {
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({
          messages: this.messages,
          isStreaming: false,
          error: null,
        }),
      );
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("Failed to save AI history", e);
      }
    }
  }

  clearHistory() {
    this.messages = [];
    this.error = null;
    this.isStreaming = false;
    this.save();
  }

  async sendMessage(text: string) {
    const settings = settingsState;

    // 1. Add User Message
    const userMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    this.messages = [...this.messages, userMsg].slice(-MAX_MESSAGES);
    this.isStreaming = true;
    this.error = null;
    this.save();

    try {
      // 2. Gather Context (Async)
      // Timeout wrapper for gathering context to prevent hanging
      const contextPromise = this.gatherContext();
      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => resolve(null), 5000),
      );

      const context = (await Promise.race([
        contextPromise,
        timeoutPromise,
      ])) || {
        error: "Context gathering timed out, proceeding with minimal data.",
      };
      this.lastContext = context; // Update exposed context

      // 3. Prepare Messages (History + System + User)
      const identity = `You are a Senior Risk Manager and Quantitative Trading Strategist. Your goal is to protect the user's capital first and optimize profit second.`;

      const baseRoleInstructions = [
        "EXPERT KNOWLEDGE:",
        "- Market Structure: Identify HH/HL (Long) and LH/LL (Short). Look for break of structure (BMS/MSB).",
        "- Liquidity: Focus on Buy-side/Sell-side liquidity, Order Blocks, and Fair Value Gaps (FVG).",
        "- Volatility: Use ATR (Average True Range) to define SL distance and avoid market noise.",
        "- Risk Math: Understand Expectancy, Kelly Criterion, and Drawdown management.",
        "",
        "NEGATIVE CONSTRAINTS (CRITICAL):",
        "- NO INTRODUCTIONS: Do NOT start with 'As a Senior Risk Manager...' or 'Here is my analysis'.",
        "- NO REPETITION: Do NOT repeat the user's question.",
        "- START IMMEDIATELY: Start with 'Hi' or 'Moin' and the first data point.",
        "",
        "STRICT OPERATING RULES:",
        "1. CAPITAL PROTECTION: If a trade setup has a Risk/Reward (R:R) ratio below 1:2, warn the user explicitly.",
        "2. NO CHASING: Do not suggest entries at the top/bottom of a move. Wait for pullbacks to OTE (Optimal Trade Entry - 0.618/0.786 Fibonacci).",
        "3. SMART TARGETS: Take Profit (TP) levels must NEVER be arbitrary round numbers. Place them slightly BEFORE psychological levels or historical liquidity zones.",
        "4. ORDER LOGIC: ",
        "   - TP1: Close 50% to secure profits and set SL to Breakeven.",
        "   - TP2: Technical target (Next major resistance/support).",
        "   - TP3: Moon/Runner (Trend extension).",
        "5. NO DUPLICATES: Each TP level must be unique and follow the price progression.",
        "",
        "ANALYTICAL RIGOR:",
        "- RATIONALE: For every calculation or trade setup shared, provide a specific reason based on the provided context data. Explain WHY you chose certain TP/SL levels.",
        "- DECISIVE DATA: Identify and highlight the exact data point that was decisive for your recommendation (e.g., 'Decisive: BTC 24h Trend (+5%) supporting a Long bias').",
        "- DATA AVAILABILITY: You ALWAYS have the 'REAL_TIME_PRICE' in your context. If it says 'Unknown', only then do you not have it. Do not claim to lack price data if it is present in the context JSON.",
        "- CONTEXTUAL AUDIT: If the context data contains conflicting signals, point them out and explain your weighting.",
        "",
        "ANTI-HALLUCINATION PROTOCOL (MANDATORY):",
        "1. SOURCE CITATION: When making claims about prices, news, or technical indicators, ALWAYS cite the exact field from the context JSON.",
        "   - ❌ BAD: 'BTC is around $47,000'",
        "   - ✅ GOOD: 'BTC is at $47,245 (REAL_TIME_PRICE from context)'",
        "",
        "2. DATA BOUNDARIES: If data is missing or unclear:",
        "   - NEVER guess or estimate from general knowledge",
        "   - EXPLICITLY state: 'I don't have [X] data in my context'",
        "   - Suggest how the user could provide this data",
        "   ",
        "3. VERIFICATION CHECKPOINTS: Before making ANY recommendation:",
        "   - List the 3 key data points you used",
        "   - Verify each exists in the provided context",
        "   - If ANY is missing, abort the recommendation",
        "",
        "4. NUMBER PRECISION: ",
        "   - Use EXACT numbers from context (e.g., '47245.32')",
        "   - NEVER round speculatively",
        "   - If you need to calculate, show the formula",
        "",
        "5. TEMPORAL GROUNDING (use internally, don't verbalize unless relevant):",
        "   - Current time is provided in the context",
        "   - ONLY use timestamps from 'latestNews.publishedAt' or 'currentTime' fields",
        "   - For news: ALWAYS use the 'ago' field directly (already calculated correctly)",
        "   - NEVER reference events from your training cutoff date",
        "   - Don't say 'As of [current date]...' in every response - just know it",
        "",
        "6. UNCERTAINTY MARKERS:",
        "   - If confidence < 90%, prefix with: 'Based on limited data: ...'",
        "   - If speculating (e.g., market psychology), prefix with: 'Speculation: ...'",
        "   - NEVER present guesses as facts",
        "",
        "- MARKET NOISE & VOLATILITY (CRITICAL):",
        "  * **SNAPSHOT DATA**: Treat 'spread' and 'imbalance' as high-frequency noise. These values change every millisecond and have ZERO predictive power in isolation.",
        "  * **IGNORE BY DEFAULT**: Do NOT mention the spread or orderbook imbalance if the status is 'Normal/Liquid' or 'Balanced'.",
        "  * **ANOMALY DETECTION**: Only address these metrics if they show extreme values (e.g., Status: 'Extreme Gap' or 'Extreme Pressure').",
        "  * **HISTORICAL PRIORITY**: Always prioritize Technical Indicators (RSI, EMA) and Market Structure (HH/HL) over local orderbook snapshots.",
        "",
        "TONE & STYLE:",
        "- Professional, objective, and data-driven.",
        "- Be skeptical of 'easy' trades; challenge the user's assumptions if data suggests otherwise.",
        "- HUMOR: Occasionally use dry trading humor and well-known crypto culture references. Don't overdo it.",
        "  * 'Bitcoin only goes right'",
        "  * 'Market Makers hate this trick'",
        "  * 'Tom Lee is always bullish'",
        "  * 'Market Maker hassen Manuka Honig'",
        "  * 'Die Ente wird skaliert'",
        "  * 'Der BTC Preis geht nach rechts'",
        "- INTRODUCTION: Start perfectly short (e.g. 'Hi', 'Moin', 'Check:'). NEVER repeat your job title ('I am a Senior Risk Manager...'). Jump straight to data. Keep further greetings minimal.",
        "- EMOJIS: Use emojis meaningfully to structure the text and highlight key points. Do not overdo it.",
        "  * 🚀 for bullish/upward momentum",
        "  * 📉 for bearish/downward trends",
        "  * 🎯 for price targets",
        "  * ⚠️ for warnings/risks",
        "  * ✅ for confirmations",
        "  * 🔥 for hot opportunities",
        "  * 💎 for strong support",
        "  * 📊 for analysis",
        "  * 🦆 for absurd/market manipulation hints",
        "- FORMATTING RULES (STRICT):",
        "  * **NUMBERS**: ALWAYS round numbers. Max 2 decimal places for percentages (e.g. 1.54%). Max 4 decimal places for prices. Do NOT show raw long floats.",
        "  * **STRUCTURE**: Use Markdown bullet points, standard lists, and bold text for keys.",
        "  * **READABILITY**: Use short paragraphs. Avoid 'wall of text'.",
        "  * **SEPARATORS**: Use '---' to separate major sections if the response is long.",
        "- Use structured bullet points and bold text for key metrics.",
      ].join("\n");

      const systemPrompt = `${identity}\n\n${settings.customSystemPrompt || baseRoleInstructions}

IMPORTANT: Your previous responses might have lacked emojis. Disregard that style. From now on, you MUST use emojis to structure your response.
 
REAL-TIME CONTEXT:
${JSON.stringify(context, null, 2)}

TIME SENSITIVITY:
Current Date/Time: ${new Date().toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
UTC Timestamp: ${new Date().toISOString()}

TEMPORAL RULES (use internally, don't repeat in every response):
- The above timestamps are your ONLY source of truth for "now"
- When calculating time differences (e.g., "how old is this news?"), use these timestamps
- NEVER use dates from your training data (2023, 2024, etc.)
- If the context shows different data than your training, the context is THE ONLY TRUTH
- For news: ALWAYS use the 'ago' field directly (already calculated correctly)
- Your training data is OUTDATED for live market analysis

CORE CAPABILITIES:
- MARKET INTELLIGENCE (CMC): Access to CoinMarketCap data.
- MARKET OVERVIEW: Full access to 24h High/Low, Funding Rates, Volume, and real-time Orderbook depth.
- TECHNICALS: Full access to technical indicators (RSI, EMAs, Pivots) and trend summaries.
- LATEST NEWS: Headlines from CryptoPanic and NewsAPI.org.
  * IMPORTANT: The 'ago' field in news items contains the CORRECT relative time calculated from the actual publication date (publishedAt).
  * ALWAYS use the 'ago' value directly when mentioning news timing. Do NOT recalculate or estimate.
  * Example: If 'ago' says "vor 2 Tagen" or "2 days ago", the article was published 2 days ago, regardless of what the source timestamp might suggest.
- PORTFOLIO DATA: Real-time access to user's stats and positions.
- INTERFACE ACCESS: You see exactly what the user enters in 'tradeSetup'.
- ACTION EXECUTION: You can DIRECTLY set values in the user's trading interface. 

FORMAT: To update values, output a JSON block at the very end:
\`\`\`json
[
  { "action": "setSymbol", "value": "BTCUSDT" },
  { "action": "setEntryPrice", "value": 50000 },
  { "action": "setStopLoss", "value": 49000 },
  { "action": "setTakeProfit", "index": 0, "value": 52000, "percent": 50 },
  { "action": "setTakeProfit", "index": 1, "value": 53000, "percent": 30 },
  { "action": "setTakeProfit", "index": 2, "value": 55000, "percent": 20 }
]
\`\`\`
Supported Actions: setSymbol, setEntryPrice, setStopLoss, setTakeProfit, setRisk, setLeverage, setAtrMultiplier, setUseAtrSl.

BEFORE SENDING YOUR RESPONSE (Chain-of-Thought Verification):
1. Review your answer
2. For each claim, ask yourself: "Is this from the context JSON or from my training?"
3. If from training, either:
   - Remove it, OR
   - Mark it as speculation with low confidence
4. Verify all numbers match the context exactly
5. Check that you cited sources for all key data points`;

      // Construct Payload Messages
      const payloadMessages = [
        { role: "system", content: systemPrompt },
        ...this.messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const provider = settings.aiProvider || "gemini";
      const endpoint = `/api/ai/${provider}`;

      let apiKey = "";
      let model = "";

      if (provider === "openai") {
        apiKey = settings.openaiApiKey;
        model = settings.openaiModel;
      }
      if (provider === "gemini") {
        apiKey = settings.geminiApiKey;
        model = settings.geminiModel;
      }
      if (provider === "anthropic") {
        apiKey = settings.anthropicApiKey;
        model = settings.anthropicModel;
      }

      if (!apiKey) {
        throw new Error(`API Key for ${provider} is missing in Settings.`);
      }

      // 4. Init Placeholder for Assistant Message
      const aiMsgId = crypto.randomUUID();
      const aiMsg: AiMessage = {
        id: aiMsgId,
        role: "assistant",
        content: "", // Start empty for streaming
        timestamp: Date.now(),
        provider,
      };

      this.messages = [...this.messages, aiMsg];
      this.isStreaming = true;

      // 5. Call API with Retry & Stream Handling
      let res: Response | null = null;
      let attempt = 0;
      const MAX_RETRIES = 3;

      while (attempt < MAX_RETRIES) {
        try {
          res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
            },
            body: JSON.stringify({
              messages: payloadMessages,
              model: model,
            }),
          });

          if (res.ok) {
            this.error = null;
            break; // Success!
          }

          if (res.status === 429) {
            attempt++;
            const delay = Math.pow(2, attempt) * 1000;
            if (import.meta.env.DEV) {
              console.warn(
                `Rate limited (429). Retrying in ${delay / 1000}s...`,
              );
            }
            this.error = `Rate limited. Retrying in ${delay / 1000}s...`;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          const err = await res.json();
          throw new Error(
            err.error || `Request failed with status ${res.status}`,
          );
        } catch (e: any) {
          if (attempt === MAX_RETRIES - 1) throw e; // Final failure
          attempt++;
          if (import.meta.env.DEV) {
            console.warn(`API Error: ${e.message}. Retrying...`);
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      if (!res || !res.ok) {
        throw new Error("Failed to connect to AI provider after retries.");
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            try {
              const data = JSON.parse(dataStr);
              let delta = "";

              if (provider === "openai") {
                delta = data.choices?.[0]?.delta?.content || "";
              } else if (provider === "gemini") {
                delta = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
              } else if (provider === "anthropic") {
                if (data.type === "content_block_delta") {
                  delta = data.delta?.text || "";
                }
              }

              if (delta) {
                fullContent += delta;
                // Update specific message in place
                const idx = this.messages.findIndex((m) => m.id === aiMsgId);
                if (idx !== -1) {
                  this.messages[idx].content = fullContent;
                }
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      // --- Action Handling ---
      try {
        const safeContent = typeof fullContent === "string" ? fullContent : "";
        const actions = this.parseActions(safeContent) || [];

        if (Array.isArray(actions) && actions.length > 0) {
          // 1. Hide ALL JSON code blocks that contain trading actions
          const cleanedContent = safeContent
            .replace(/```json\s*[\s\S]*?"action"[\s\S]*?```/g, "")
            .trim();

          const idx = this.messages.findIndex((m) => m.id === aiMsgId);
          if (idx !== -1) {
            this.messages[idx].content = cleanedContent;
          }

          // 2. Execute Actions
          const confirmActions = settings.aiConfirmActions ?? false;

          if (confirmActions) {
            // Create a batch pending action
            const actionId = this.addPendingAction(actions);

            // Add ONE system message for the whole batch
            const sysMsg: AiMessage = {
              id: crypto.randomUUID(),
              role: "system",
              content: `[PENDING:${actionId}]`,
              timestamp: Date.now(),
            };
            this.messages = [...this.messages, sysMsg];
          } else {
            // Execute immediately
            actions.forEach((action) => {
              if (!action) return;
              try {
                this.executeAction(action, false);
              } catch (err) {
                if (import.meta.env.DEV) {
                  console.error("Single action failed", err);
                }
              }
            });
          }
        }
      } catch (actionErr) {
        if (import.meta.env.DEV) {
          console.error("Action parsing error:", actionErr);
        }
      }

      this.isStreaming = false;
      this.save();
    } catch (e: any) {
      this.isStreaming = false;
      this.error = e.message;
    }
  }

  private async gatherContext() {
    const trade = tradeState;
    const market = marketState.data;
    const account = accountState;
    const journal = journalState.entries || [];
    const settings = settingsState;

    // CMC Data
    let cmcContext = null;
    if (settings.enableCmcContext && settings.cmcApiKey) {
      try {
        // Fetch in parallel for speed
        const [globalMetrics, coinMeta] = await Promise.all([
          cmcService.getGlobalMetrics(),
          trade.symbol
            ? cmcService.getCoinMetadata(trade.symbol)
            : Promise.resolve(null),
        ]);

        if (globalMetrics || coinMeta) {
          cmcContext = {
            global: globalMetrics
              ? {
                  btcDominance: globalMetrics.btc_dominance,
                  marketCap: globalMetrics.total_market_cap,
                  volume24h: globalMetrics.total_volume_24h,
                  activeCoins: globalMetrics.active_cryptocurrencies,
                }
              : "Unavailable",
            symbolMetadata: coinMeta
              ? {
                  name: coinMeta.name,
                  slug: coinMeta.slug,
                  tags: coinMeta.tags,
                  dateAdded: coinMeta.date_added,
                }
              : "Unavailable",
          };
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn("Failed to gather CMC context:", e);
        }
      }
    }

    // News Data (New Addition)
    let newsContext = null;
    const hasRss =
      (settings.rssPresets && settings.rssPresets.length > 0) ||
      (settings.customRssFeeds && settings.customRssFeeds.length > 0);

    if (
      settings.enableNewsAnalysis &&
      (settings.cryptoPanicApiKey || settings.newsApiKey || hasRss)
    ) {
      try {
        // Import locale from i18n to get current language
        const { locale } = await import("../locales/i18n");
        const { get } = await import("svelte/store");
        const currentLocale = get(locale) || "en";

        // Determine language for time strings (de or en)
        const lang = currentLocale.startsWith("de") ? "de" : "en";

        // Fetch recent news for active symbol or general crypto if none
        const newsItems = await newsService.fetchNews(trade.symbol || "crypto");

        if (newsItems && newsItems.length > 0) {
          // Limit to top 5 headlines to save tokens
          newsContext = newsItems.slice(0, 5).map((n) => ({
            title: n.title,
            source: n.source,
            publishedAt: n.published_at, // ISO timestamp for reference
            ago: getRelativeTimeString(n.published_at, lang), // Correctly calculated relative time
          }));
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn("Failed to gather News context:", e);
        }
      }
    }

    // Calculate Portfolio Stats
    const totalTrades = journal.length;
    const wins = journal.filter(
      (t: JournalEntry) => (t.totalNetProfit?.toNumber() || 0) > 0,
    ).length;
    const winrate =
      totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) + "%" : "0%";
    const totalPnl = journal
      .reduce(
        (sum: number, t: JournalEntry) =>
          sum + (t.totalNetProfit?.toNumber() || 0),
        0,
      )
      .toFixed(2);

    const usdtAsset = account.assets?.find((a: any) => a.currency === "USDT");
    const accountSize = usdtAsset ? usdtAsset.total.toString() : "Unknown";

    const limit = settings.aiTradeHistoryLimit || 50;
    const symbol = trade.symbol;
    // Ensure consistent lookup (try existing, then uppercase, then lowercase)
    const marketData = symbol
      ? market[symbol] ||
        market[symbol.toUpperCase()] ||
        market[symbol.toLowerCase()]
      : null;

    const recentTrades = Array.isArray(journal)
      ? journal.slice(0, limit).map((t: JournalEntry) => ({
          symbol: t.symbol,
          entry: t.entryDate,
          exit: t.exitDate,
          pnl: t.totalNetProfit?.toNumber() || 0,
          won: (t.totalNetProfit?.toNumber() || 0) > 0,
        }))
      : [];

    // Technicals Data (New Addition)
    let technicalsContext = null;
    if (symbol && settings.showTechnicals) {
      try {
        const timeframe = trade.analysisTimeframe || "1h";
        const limit = indicatorState.historyLimit || 750;
        const klines = await apiService.fetchBitunixKlines(
          symbol,
          timeframe,
          limit,
        );
        if (klines && klines.length > 0) {
          const data = await technicalsService.calculateTechnicals(
            klines,
            indicatorState,
          );
          if (data) {
            technicalsContext = {
              timeframe,
              summary: data.summary,
              confluence: data.confluence
                ? {
                    score: Number(data.confluence.score.toFixed(2)),
                    level: data.confluence.level,
                    contributing: data.confluence.contributing,
                  }
                : "N/A",
              divergences:
                data.divergences && data.divergences.length > 0
                  ? data.divergences.map((d) => ({
                      type: d.type,
                      indicator: d.indicator,
                      side: d.side,
                      priceStart: Number(d.priceStart).toFixed(4),
                      priceEnd: Number(d.priceEnd).toFixed(4),
                    }))
                  : [],
              oscillators: Object.fromEntries(
                Object.entries(data.oscillators).map(([k, v]) => [
                  k,
                  Number(Number(v).toFixed(2)),
                ]),
              ),
              movingAverages: data.movingAverages.map((m) => ({
                name: m.name,
                value: Number(Number(m.value).toFixed(4)),
                action: m.action,
              })),
              pivots: {
                type: indicatorState.pivots.type,
                classic: Object.fromEntries(
                  Object.entries(data.pivots.classic).map(([k, v]) => [
                    k,
                    Number(v).toFixed(4),
                  ]),
                ),
              },
              volatility: data.volatility
                ? {
                    atr: Number(Number(data.volatility.atr).toFixed(4)),
                    bbPercentP: Number(
                      Number(data.volatility.bb.percentP).toFixed(2),
                    ),
                  }
                : "N/A",
            };
          }
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn("Failed to gather Technicals context:", e);
        }
      }
    }

    // Market Details with Imbalance & Spread
    let marketDetails = null;
    if (marketData) {
      let imbalance = "Unknown";
      let spread = "Unknown";
      let spreadStatus = "Unknown";
      let imbalanceStatus = "Balanced";

      if (
        marketData.depth &&
        marketData.depth.bids.length > 0 &&
        marketData.depth.asks.length > 0
      ) {
        const bestBid = new Decimal(marketData.depth.bids[0][0]);
        const bestAsk = new Decimal(marketData.depth.asks[0][0]);
        const spreadVal = bestAsk.minus(bestBid);
        spread = spreadVal.toFixed(5);

        // Calculate spread relative to price
        const spreadPercent = spreadVal.div(bestBid).times(100).toNumber();
        if (spreadPercent < 0.02) spreadStatus = "Ultra Tight (Highly Liquid)";
        else if (spreadPercent < 0.05) spreadStatus = "Normal/Liquid";
        else if (spreadPercent < 0.15)
          spreadStatus = "Wide (Wait for better fills)";
        else spreadStatus = "Extreme Gap (Illiquid/Volatility Spikes)";

        const totalBidVol = marketData.depth.bids
          .slice(0, 5)
          .reduce((sum, b) => sum + Number(b[1]), 0);
        const totalAskVol = marketData.depth.asks
          .slice(0, 5)
          .reduce((sum, a) => sum + Number(a[1]), 0);
        const bidRatio = totalBidVol / (totalBidVol + totalAskVol);
        imbalance = (bidRatio * 100).toFixed(1) + "% Bids";

        if (bidRatio > 0.8) imbalanceStatus = "Extreme Buy Pressure (Snapshot)";
        else if (bidRatio > 0.6) imbalanceStatus = "Bullish Skew (Snapshot)";
        else if (bidRatio < 0.2)
          imbalanceStatus = "Extreme Sell Pressure (Snapshot)";
        else if (bidRatio < 0.4) imbalanceStatus = "Bearish Skew (Snapshot)";
        else imbalanceStatus = "Balanced (No immediate directional edge)";
      }

      marketDetails = {
        currentPrice: marketData.lastPrice
          ? parseFloat(marketData.lastPrice.toFixed(4))
          : "Unknown",
        high24h: marketData.highPrice
          ? parseFloat(marketData.highPrice.toFixed(4))
          : undefined,
        low24h: marketData.lowPrice
          ? parseFloat(marketData.lowPrice.toFixed(4))
          : undefined,
        volume24h: marketData.volume
          ? Math.round(Number(marketData.volume)).toLocaleString()
          : undefined,
        fundingRate: marketData.fundingRate
          ? marketData.fundingRate.times(100).toFixed(4) + "%"
          : "N/A",
        nextFunding: marketData.nextFundingTime
          ? new Date(marketData.nextFundingTime).toISOString()
          : "N/A",
        orderbook: marketData.depth
          ? {
              imbalance,
              imbalanceStatus,
              spread,
              spreadStatus,
              topBids: marketData.depth.bids
                .slice(0, 3)
                .map((b) => parseFloat(Number(b[0]).toFixed(4))),
              topAsks: marketData.depth.asks
                .slice(0, 3)
                .map((a) => parseFloat(Number(a[0]).toFixed(4))),
            }
          : "Unavailable",
      };
    }

    return {
      currentTime: new Date().toISOString(),
      portfolioStats: { totalTrades, winrate, totalPnl, accountSize },
      activeSymbol: symbol,
      REAL_TIME_PRICE: marketData?.lastPrice?.toString() || "Unknown", // RENAMED to be very loud
      priceChange24h: marketData?.priceChangePercent
        ? Number(marketData.priceChangePercent).toFixed(2) + "%"
        : "Unknown",
      marketDetails,
      technicals: technicalsContext,
      openPositions: Array.isArray(account.positions)
        ? account.positions.map((p: any) => ({
            symbol: p.symbol,
            side: p.side,
            size: p.size.toString(),
            entry: p.entryPrice.toString(),
            pnl: p.unrealizedPnl.toString(),
            roi:
              !p.entryPrice.isZero() && !p.size.isZero()
                ? p.unrealizedPnl
                    .div(p.entryPrice.times(p.size).div(p.leverage))
                    .times(100)
                    .toFixed(2) + "%"
                : "N/A",
          }))
        : [],
      recentHistory: recentTrades,
      tradeSetup: {
        entry: trade.entryPrice,
        sl: trade.stopLossPrice,
        tp: trade.targets,
        risk: trade.riskPercentage + "%",
        atrMultiplier: trade.atrMultiplier,
        useAtrSl: trade.useAtrSl,
      },
      marketIntelligence: cmcContext,
      latestNews: newsContext,
    };
  }

  private parseActions(text: string): AiAction[] {
    const actions: AiAction[] = [];
    const regex = /```json\s*(\[\s*\{.*?\}\s*\])\s*```/s;
    const match = text.match(regex);

    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) return parsed as AiAction[];
      } catch (e) {
        /* ignore */
      }
    }

    const singleRegex = /```json\s*(\{.*?\})\s*```/s;
    const singleMatch = text.match(singleRegex);
    if (singleMatch && singleMatch[1]) {
      try {
        const parsed = JSON.parse(singleMatch[1]);
        return [parsed as AiAction];
      } catch (e) {
        /* ignore */
      }
    }

    return actions;
  }

  private executeAction(action: AiAction, confirmNeeded: boolean): boolean {
    // confirmNeeded is now handled at the batch level in processResponse
    if (confirmNeeded) return false;

    try {
      switch (action.action) {
        case "setEntryPrice":
          if (action.value !== undefined) {
            tradeState.entryPrice = parseAiValue(action.value as string);
          }
          break;
        case "setStopLoss":
          if (action.value !== undefined) {
            tradeState.stopLossPrice = parseAiValue(action.value as string);
          }
          break;
        case "setTakeProfit":
          if (typeof action.index === "number") {
            const idx = action.index;
            // Access targets array directly
            const currentTargets = tradeState.targets;
            if (currentTargets[idx]) {
              // Deep reactivity in Svelte 5 allows modifying properties directly
              // However, since it's an array of objects, we ensure reactivity triggers
              // by reassigning or mutating properly. Runes proxies handle deep mutation.
              if (action.value !== undefined) {
                currentTargets[idx].price = parseAiValue(action.value as string);
              }
              if (action.percent !== undefined) {
                currentTargets[idx].percent = parseAiValue(action.percent as string);
              }
            }
          }
          break;
        case "setLeverage":
          if (action.value !== undefined) {
            tradeState.leverage = parseAiValue(action.value as string);
          }
          break;
        case "setRisk":
          if (action.value !== undefined) {
            tradeState.riskPercentage = parseAiValue(action.value as string);
          }
          break;
        case "setSymbol":
          if (action.value !== undefined) {
            tradeState.symbol = String(action.value);
          }
          break;
        case "setAtrMultiplier":
        case "setStopLossATR":
          const mult = action.value || action.atrMultiplier;
          if (mult !== undefined) {
            tradeState.atrMultiplier = parseFloat(String(mult));
            tradeState.useAtrSl = true;
          }
          break;
        case "setUseAtrSl":
          if (typeof action.value === "boolean") {
            tradeState.useAtrSl = action.value;
          }
          break;
      }
      return true;
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("AI Action Execution Failed", e);
      }
      return false;
    }
  }

  /**
   * Describe an action in compact human-readable format
   */
  public describeAction(action: AiAction): string {
    switch (action.action) {
      case "setEntryPrice":
        return `Entry: ${action.value}`;
      case "setStopLoss":
        return `Stop Loss: ${action.value}`;
      case "setTakeProfit":
        return `TP${(action.index ?? 0) + 1}: ${action.value}`;
      case "setLeverage":
        return `Leverage: ${action.value}x`;
      case "setRisk":
        return `Risk: ${action.value}%`;
      case "setSymbol":
        return `Symbol: ${action.value}`;
      case "setAtrMultiplier":
      case "setStopLossATR":
        const mult = action.value || action.atrMultiplier;
        return `ATR SL: ${mult}x`;
      case "setUseAtrSl":
        return action.value ? "ATR SL: ON" : "ATR SL: OFF";
      default:
        return `Action: ${action.action}`;
    }
  }

  /**
   * Add action to pending queue for user confirmation
   */
  private addPendingAction(actions: any[]): string {
    const id = crypto.randomUUID();
    this.pendingActions.set(id, {
      id,
      actions,
      timestamp: Date.now(),
    });
    return id;
  }

  /**
   * Confirm and execute a pending action
   */
  confirmAction(actionId: string) {
    const pending = this.pendingActions.get(actionId);
    if (!pending) return;

    // Execute all actions in batch
    pending.actions.forEach((action) => {
      this.executeAction(action, false);
    });

    // Remove from pending
    this.pendingActions.delete(actionId);

    // Update message to show confirmed status
    this.updateActionMessage(actionId, "confirmed");
    this.save();
  }

  /**
   * Reject a pending action
   */
  rejectAction(actionId: string) {
    const pending = this.pendingActions.get(actionId);
    if (!pending) return;

    // Remove from pending
    this.pendingActions.delete(actionId);

    // Update message to show rejected status
    this.updateActionMessage(actionId, "rejected");
    this.save();
  }

  /**
   * Update action message to show status
   */
  private updateActionMessage(
    actionId: string,
    status: "confirmed" | "rejected",
  ) {
    const idx = this.messages.findIndex((m) =>
      m.content.includes(`[PENDING:${actionId}]`),
    );
    if (idx !== -1) {
      const statusEmoji = status === "confirmed" ? "✅" : "❌";
      const statusText = status === "confirmed" ? "Bestätigt" : "Abgelehnt";

      // Remove [PENDING:id] and add status
      this.messages[idx].content = this.messages[idx].content.replace(
        `[PENDING:${actionId}]`,
        `[${statusEmoji} ${statusText}]`,
      );
    }
  }

  // Compatibility
  subscribe(
    fn: (value: {
      messages: AiMessage[];
      isStreaming: boolean;
      error: string | null;
    }) => void,
  ) {
    fn({
      messages: this.messages,
      isStreaming: this.isStreaming,
      error: this.error,
    });
    return $effect.root(() => {
      $effect(() => {
        fn({
          messages: this.messages,
          isStreaming: this.isStreaming,
          error: this.error,
        });
      });
    });
  }
}

export const aiState = new AiManager();
