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
import { get } from "svelte/store";
import { _ } from "../locales/i18n";

import { settingsState, type AiProvider } from "./settings.svelte";
import { buildSystemPromptParts } from "../lib/ai/prompts/promptBuilder";
import { executeTradeActionsTool } from "../lib/ai/prompts/actionSchema";
import { tradeState } from "./trade.svelte";
import { marketState } from "./market.svelte";
import { accountState } from "./account.svelte";
import { journalState } from "./journal.svelte";
import { cmcService } from "../services/cmcService";
import { indicatorState } from "./indicator.svelte";
import { technicalsService } from "../services/technicalsService";
import { activeExchange } from "../services/exchange";
import { newsService } from "../services/newsService";
import { getRelativeTimeString } from "../lib/utils/timeUtils";
import { parseAiValue } from "../utils/utils";
import { logger } from "../services/logger";
import { appFetch } from "../lib/appAuth";
import type { JournalEntry } from "./types";
import type { Position } from "./account.svelte";
import { app } from "../services/app";
import { TechnicalsPresenter } from "../utils/technicalsPresenter";

// Shape returned by gatherContext(), passed to the AI provider and exposed
// to the UI via lastContext for the context-gathered indicators.
export interface AiContext {
  // Absent when gatherContext() times out — see the fallback in sendMessage().
  currentTime?: string;
  portfolioStats?: { totalTrades: number; winrate: string; totalPnl: string; accountSize: string };
  activeSymbol?: string | null;
  REAL_TIME_PRICE?: string;
  priceChange24h?: string;
  marketDetails?: Record<string, unknown> | null;
  technicals?: Record<string, unknown> | null;
  openPositions?: Array<Record<string, unknown>>;
  recentHistory?: Array<Record<string, unknown>>;
  tradeSetup?: Record<string, unknown>;
  marketIntelligence?: { global: Record<string, unknown> | string; symbolMetadata: Record<string, unknown> | string } | null;
  latestNews?: Array<Record<string, unknown>> | null;
  error?: string;
}

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
  tags?: string[];
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
  lastContext = $state<AiContext | null>(null); // Expose context for UI indicators
  contextSummary = $state<{
    durationMs: number;
    newsCount: number;
    hasTechnicals: boolean;
    hasCmc: boolean;
    timedOut: boolean;
  } | null>(null);
  private _toolCallBuffer: string = "";

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
    this._toolCallBuffer = "";

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
      // 2b. Measure context gathering duration
      const contextStart = Date.now();
      const contextPromise = this.gatherContext();
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 5000),
      );

      const context: AiContext = (await Promise.race([
        contextPromise,
        timeoutPromise,
      ])) || {
        error: "Context gathering timed out, proceeding with minimal data.",
      };
      this.lastContext = context; // Update exposed context

      // Record real measured facts — no fake states
      const timedOut = !!(context as AiContext).error?.includes("timed out");
      this.contextSummary = {
        durationMs: Date.now() - contextStart,
        newsCount: context.latestNews?.length ?? 0,
        hasTechnicals: !!(context as AiContext).technicals,
        hasCmc: !!(context as AiContext).marketIntelligence?.global && (context as AiContext).marketIntelligence?.global !== "Unavailable",
        timedOut,
      };

      // 3. Prepare Messages (History + System + User)
      // Determine language for AI response: follow the user's app locale
      const appLocale = (typeof localStorage !== "undefined"
        ? localStorage.getItem("locale")
        : null) ?? "en";

      const promptParts = buildSystemPromptParts({
        mode: settings.aiAnalysisMode || "risk",
        customSystemPrompt: settings.customSystemPrompt,
        context,
        appLocale,
      });

      const provider = settings.aiProvider || "gemini";
      const systemPrompt = provider === "anthropic"
        ? JSON.stringify(promptParts)
        : `${promptParts.staticInstruction}\n\n${promptParts.dynamicContext}`;


      // Construct Payload Messages
      const payloadMessages = [
        { role: "system", content: systemPrompt },
        ...this.messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const endpoint = `/api/ai/${provider}`;

      let apiKey = "";
      let model = "";
      let baseUrl = "";

      if (provider === "openai") {
        apiKey = settings.openaiApiKey;
        model = settings.openaiModel;
        baseUrl = settings.openaiBaseUrl;
      }
      if (provider === "gemini") {
        apiKey = settings.geminiApiKey;
        model = settings.geminiModel;
        baseUrl = settings.geminiBaseUrl;
      }
      if (provider === "anthropic") {
        apiKey = settings.anthropicApiKey;
        model = settings.anthropicModel;
        baseUrl = settings.anthropicBaseUrl;
      }
      if (provider === "openrouter") {
        apiKey = settings.openrouterApiKey;
        model = settings.openrouterModel;
        baseUrl = settings.openrouterBaseUrl;
      }
      if (provider === "ollama") {
        // Local (or self-hosted) instance — no API key required.
        model = settings.ollamaModel;
        baseUrl = settings.ollamaBaseUrl;
      }

      if (!apiKey && provider !== "ollama" && !baseUrl?.trim()) {
        throw new Error(`API Key for ${provider} is missing in Settings.`);
      }
      if (!model) {
        throw new Error(`No model selected for ${provider}. Please choose one in Settings.`);
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

      if (provider === "ollama") {
        const targetUrl = (baseUrl?.trim() || "http://localhost:11434").replace(/\/$/, "");
        try {
          const directRes = await fetch(`${targetUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: payloadMessages,
              tools: [executeTradeActionsTool],
              stream: true,
            }),
          });
          if (directRes.ok) {
            res = directRes;
            this.error = null;
          } else {
            const err = await directRes.json().catch(() => ({}));
            throw new Error(err.error?.message || err.error || `Ollama request failed with status ${directRes.status}`);
          }
        } catch (err) {
          // Direct browser fetch failed — fail closed! ADR-0011 forbids falling back to server proxy in local mode.
          this.isStreaming = false;
          const msg = err instanceof Error ? err.message : String(err);
          this.error = `Ollama connection failed: ${msg}. Please ensure Ollama is running locally at ${targetUrl} and CORS is configured (OLLAMA_ORIGINS="*").`;
          return;
        }
      }

      while (!res && attempt < MAX_RETRIES) {
        try {
          res = await appFetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
            },
            body: JSON.stringify({
              messages: payloadMessages,
              model: model,
              ...(baseUrl?.trim() ? { baseUrl: baseUrl.trim() } : {}),
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
        } catch (e) {
          if (attempt === MAX_RETRIES - 1) throw e; // Final failure
          attempt++;
          if (import.meta.env.DEV) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn(`API Error: ${message}. Retrying...`);
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
              let toolCallData = null;

              if (provider === "openai" || provider === "openrouter" || provider === "ollama") {
                delta = data.choices?.[0]?.delta?.content || "";
                if (data.choices?.[0]?.delta?.tool_calls) {
                  toolCallData = data.choices[0].delta.tool_calls[0]?.function?.arguments;
                }
              } else if (provider === "gemini") {
                delta = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (data.candidates?.[0]?.content?.parts?.[0]?.functionCall) {
                  const fc = data.candidates[0].content.parts[0].functionCall;
                  if (fc.args && fc.args.actions) {
                      toolCallData = JSON.stringify(fc.args);
                  }
                }
              } else if (provider === "anthropic") {
                if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
                  delta = data.delta?.text || "";
                } else if (data.type === "content_block_delta" && data.delta?.type === "input_json_delta") {
                  toolCallData = data.delta?.partial_json;
                }
              }

              if (toolCallData) {
                  // Buffer tool call chunks
                  if (!this._toolCallBuffer) this._toolCallBuffer = "";
                  this._toolCallBuffer += toolCallData;
              }

              if (delta) {
                fullContent += delta;
                const idx = this.messages.findIndex((m) => m.id === aiMsgId);
                if (idx !== -1) {
                  this.messages[idx].content = fullContent;
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // --- Action Handling ---
      try {
        const safeContent = typeof fullContent === "string" ? fullContent : "";
        let actions = this.parseActions(safeContent) || [];

        // Check if we captured a structured tool call instead
        if (this._toolCallBuffer) {
           try {
             const parsedTool = JSON.parse(this._toolCallBuffer);
             if (parsedTool.actions && Array.isArray(parsedTool.actions)) {
                 actions = parsedTool.actions;
             }
           } catch {
             // Fallback to regex if tool call parsing fails
           }
           this._toolCallBuffer = "";
        }

        if (Array.isArray(actions) && actions.length > 0) {
          // 1. Code-level R:R guard: block execution if the suggested setup is mathematically poor
          const entryAction = actions.find((a) => a.action === "setEntryPrice");
          const slAction = actions.find((a) => a.action === "setStopLoss");
          const tp1Action = actions.find((a) => (a.action === "setTakeProfit" && (a.index ?? -1) === 0) || a.action === "addTakeProfit");

          let forceConfirm = false;

          if (entryAction?.value != null && slAction?.value != null && tp1Action?.value != null) {
            try {
              const entryD = new Decimal(entryAction.value as string | number);
              const slD = new Decimal(slAction.value as string | number);
              const tp1D = new Decimal(tp1Action.value as string | number);
              const risk = entryD.minus(slD).abs();
              const reward = tp1D.minus(entryD).abs();
              if (!risk.isZero() && reward.div(risk).lt(1.5)) {
                // Low R:R detected — log warning for audit and FORCE user confirmation
                logger.warn("ai", "Low R:R setup generated - forcing confirmation", {
                  rr: reward.div(risk).toFixed(2),
                });
                forceConfirm = true;
              }
            } catch {
              // Parsing failed — allow through (conservative approach)
            }
          }

          // 2. Hide ALL JSON code blocks that contain trading actions
          const cleanedContent = safeContent
            .replace(/```json\s*[\s\S]*?"action"[\s\S]*?```/g, "")
            .trim();

          const idx = this.messages.findIndex((m) => m.id === aiMsgId);
          if (idx !== -1) {
            this.messages[idx].content = cleanedContent;
          }

          // 3. Execute Actions
          const confirmActions = (settings.aiConfirmActions ?? false) || forceConfirm;

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
    } catch (e) {
      this.isStreaming = false;
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  private async gatherContext(): Promise<AiContext> {
    const trade = tradeState;
    const market = marketState.data;
    const account = accountState;
    // Real trades only: the assistant should not reason about the user's
    // performance from simulated fills.
    const journal = journalState.analysisEntries || [];
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
      (t: JournalEntry) => new Decimal(t.totalNetProfit || 0).gt(0),
    ).length;
    const winrate =
      totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) + "%" : "0%";
    const totalPnl = journal
      .reduce(
        (sum: Decimal, t: JournalEntry) =>
          sum.plus(new Decimal(t.totalNetProfit || 0)),
        new Decimal(0),
      )
      .toFixed(2);

    const usdtAsset = account.assets?.find((a) => a.currency === "USDT");
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
      ? journal.slice(0, limit).map((t: JournalEntry) => {
        const pnlNum = new Decimal(t.totalNetProfit || 0).toNumber();
        return {
          symbol: t.symbol,
          entry: t.entryDate,
          exit: t.exitDate,
          pnl: pnlNum,
          won: pnlNum > 0,
        };
      })
      : [];

    // Technicals Data (New Addition)
    let technicalsContext: Record<string, unknown> | null = null;
    if (symbol && settings.showTechnicals) {
      try {
        const timeframe = trade.analysisTimeframe || "1h";
        let data = marketData?.technicals?.[timeframe];

        if (!data) {
          const limit = indicatorState.historyLimit || 750;
          const klines = await activeExchange().marketData.fetchKlines(symbol, timeframe, limit);
          if (klines && klines.length > 0) {
            data = await technicalsService.calculateTechnicals(klines, indicatorState);
          }
        }

        if (data) {
          const precision = indicatorState.precision ?? 4;
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
                  priceStart: TechnicalsPresenter.formatVal(d.priceStart, precision),
                  priceEnd: TechnicalsPresenter.formatVal(d.priceEnd, precision),
                }))
                : [],
            oscillators: Object.fromEntries(
              data.oscillators.map((v) => [
                v.name,
                TechnicalsPresenter.formatVal(v.value, 2),
              ]),
            ),
            movingAverages: data.movingAverages.map((m) => ({
              name: m.name,
              value: TechnicalsPresenter.formatVal(m.value, precision),
              action: m.action,
            })),
            pivots: data.pivots?.classic ? {
              type: indicatorState.pivots.type,
              classic: Object.fromEntries(
                Object.entries(data.pivots.classic).map(([k, v]) => [
                  k,
                  TechnicalsPresenter.formatVal(Number(v), precision),
                ]),
              ),
            } : undefined,
            volatility: data.volatility
              ? {
                atr: TechnicalsPresenter.formatVal(data.volatility.atr, precision),
                bbPercentP: (data.volatility.bb && typeof data.volatility.bb.percentP !== 'undefined')
                  ? TechnicalsPresenter.formatVal(data.volatility.bb.percentP, 2)
                  : "0",
              }
              : "N/A",
          };
        }

        // --- Multi-Timeframe Trend Context (New) ---
        // Fetch higher timeframe (e.g. 4h) for trend bias
        const trendTimeframe = "4h";
        if (technicalsContext && timeframe !== trendTimeframe) {
          let trendData = marketData?.technicals?.[trendTimeframe];
          if (!trendData) {
            const trendKlines = await activeExchange().marketData.fetchKlines(symbol, trendTimeframe, 200);
            if (trendKlines && trendKlines.length > 0) {
              trendData = await technicalsService.calculateTechnicals(trendKlines, indicatorState);
            }
          }
          if (trendData) {
            // Merge into technicalsContext or add as separate field
            // We'll add it as 'trendBias'
            technicalsContext.higherTimeframe = {
              timeframe: trendTimeframe,
              summary: trendData.summary, // e.g. "STRONG_BUY"
              ema200Action: trendData.movingAverages.find(m => m.name === "EMA 200")?.action || "Unknown",
              rsi: TechnicalsPresenter.formatVal(trendData.oscillators.find(o => o.name === "RSI")?.value, 2)
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
        const spreadPercent = spreadVal.div(bestBid).times(100);
        if (spreadPercent.lt(0.02)) spreadStatus = "Ultra Tight (Highly Liquid)";
        else if (spreadPercent.lt(0.05)) spreadStatus = "Normal/Liquid";
        else if (spreadPercent.lt(0.15))
          spreadStatus = "Wide (Wait for better fills)";
        else spreadStatus = "Extreme Gap (Illiquid/Volatility Spikes)";

        const totalBidVol = marketData.depth.bids
          .slice(0, 5)
          .reduce((sum: Decimal, b: [string, string]) => sum.plus(new Decimal(b[1] || 0)), new Decimal(0));

        const totalAskVol = marketData.depth.asks
          .slice(0, 5)
          .reduce((sum: Decimal, a: [string, string]) => sum.plus(new Decimal(a[1] || 0)), new Decimal(0));

        const totalVol = totalBidVol.plus(totalAskVol);
        const bidRatio = totalVol.isZero() ? new Decimal(0.5) : totalBidVol.div(totalVol);

        imbalance = (bidRatio.times(100).toNumber()).toFixed(1) + "% Bids";

        if (bidRatio.gt(0.8)) imbalanceStatus = "Extreme Buy Pressure (Snapshot)";
        else if (bidRatio.gt(0.6)) imbalanceStatus = "Bullish Skew (Snapshot)";
        else if (bidRatio.lt(0.2))
          imbalanceStatus = "Extreme Sell Pressure (Snapshot)";
        else if (bidRatio.lt(0.4)) imbalanceStatus = "Bearish Skew (Snapshot)";
        else imbalanceStatus = "Balanced (No immediate directional edge)";
      }

      marketDetails = {
        currentPrice: marketData.lastPrice
          ? marketData.lastPrice.toString()
          : "Unknown",
        high24h: marketData.highPrice
          ? marketData.highPrice.toString()
          : undefined,
        low24h: marketData.lowPrice
          ? marketData.lowPrice.toString()
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
              .map((b: [string, string]) => Number(b[0])),
            topAsks: marketData.depth.asks
              .slice(0, 3)
              .map((a: [string, string]) => Number(a[0])),
          }
          : null,
      };
    }

    const shareTradeContext = settings.aiShareTradeContext ?? false;

    return {
      currentTime: new Date().toISOString(),
      portfolioStats: shareTradeContext
        ? { totalTrades, winrate, totalPnl, accountSize }
        : undefined,
      activeSymbol: symbol,
      REAL_TIME_PRICE: marketData?.lastPrice?.toString() || "Unknown", // RENAMED to be very loud
      priceChange24h: marketData?.priceChangePercent
        ? Number(marketData.priceChangePercent).toFixed(2) + "%"
        : "Unknown",
      marketDetails,
      technicals: technicalsContext,
      openPositions: shareTradeContext
        ? (Array.isArray(account.positions)
          ? account.positions.map((p: Position) => ({
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
          : [])
        : undefined,
      recentHistory: shareTradeContext ? recentTrades : undefined,
      tradeSetup: shareTradeContext
        ? {
          tradeType: trade.tradeType,
          entry: trade.entryPrice,
          sl: trade.stopLossPrice,
          tp: trade.targets,
          risk: trade.riskPercentage + "%",
          atrMultiplier: trade.atrMultiplier,
          useAtrSl: trade.useAtrSl,
          ...this.calculateRR(trade),
        }
        : undefined,
      marketIntelligence: cmcContext,
      latestNews: newsContext,
    };
  }

  /**
   * Pre-calculate Risk/Reward so the AI doesn't have to (and hallucinate).
   * Returns calculatedRR (string like "1:2.5") and rrVerdict (VALID / WARNING / REJECT).
   */
  private calculateRR(trade: typeof tradeState): {
    calculatedRR: string;
    rrVerdict: "VALID" | "WARNING" | "REJECT" | "N/A";
  } {
    try {
      const entry = trade.entryPrice ? new Decimal(trade.entryPrice) : null;
      const sl = trade.stopLossPrice ? new Decimal(trade.stopLossPrice) : null;
      const tps = trade.targets?.filter((t) => t.price != null && t.price !== "");

      if (!entry || !sl || !tps || tps.length === 0) {
        return { calculatedRR: "N/A", rrVerdict: "N/A" };
      }

      const risk = entry.minus(sl).abs();
      if (risk.isZero()) return { calculatedRR: "N/A", rrVerdict: "N/A" };

      // Use the first TP (TP1) as the reference reward
      const tp1 = new Decimal(tps[0].price as string | number);
      const reward = tp1.minus(entry).abs();

      const rrRatio = reward.div(risk);
      const rrFormatted = `1:${rrRatio.toFixed(2)}`;

      let verdict: "VALID" | "WARNING" | "REJECT";
      if (rrRatio.gte(2)) {
        verdict = "VALID";
      } else if (rrRatio.gte(1.5)) {
        verdict = "WARNING";
      } else {
        verdict = "REJECT";
      }

      return { calculatedRR: rrFormatted, rrVerdict: verdict };
    } catch {
      return { calculatedRR: "N/A", rrVerdict: "N/A" };
    }
  }

  private parseActions(text: string): AiAction[] {
    const actions: AiAction[] = [];
    const regex = /```json\s*(\[\s*\{.*?\}\s*\])\s*```/s;
    const match = text.match(regex);

    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) return parsed as AiAction[];
      } catch {
        /* ignore */
      }
    }

    const singleRegex = /```json\s*(\{.*?\})\s*```/s;
    const singleMatch = text.match(singleRegex);
    if (singleMatch && singleMatch[1]) {
      try {
        const parsed = JSON.parse(singleMatch[1]);
        return [parsed as AiAction];
      } catch {
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
            tradeState.entryPrice = String(parseAiValue(action.value as string));
          }
          break;
        case "setStopLoss":
          if (action.value !== undefined) {
            tradeState.stopLossPrice = String(parseAiValue(action.value as string));
          }
          break;
        case "setTakeProfit":
          if (typeof action.index === "number") {
            const idx = action.index;
            // Access targets array directly
            const currentTargets = tradeState.targets;
            // Robust bounds check
            if (
              idx >= 0 &&
              idx < currentTargets.length &&
              currentTargets[idx]
            ) {
              // Deep reactivity in Svelte 5 allows modifying properties directly
              // However, since it's an array of objects, we ensure reactivity triggers
              // by reassigning or mutating properly. Runes proxies handle deep mutation.
              if (action.value !== undefined) {
                currentTargets[idx].price = String(parseAiValue(action.value as string));
              }
              if (action.percent !== undefined) {
                currentTargets[idx].percent = String(parseAiValue(action.percent as string));
              }
            } else {
              logger.warn("ai", "Invalid TP index", { index: idx, total: currentTargets.length });
            }
          }
          break;
        case "setLeverage":
          if (action.value !== undefined) {
            tradeState.leverage = String(parseAiValue(action.value as string));
          }
          break;
        case "setRisk":
          if (action.value !== undefined) {
            tradeState.riskPercentage = String(parseAiValue(action.value as string));
          }
          break;
        case "setSymbol":
          if (action.value !== undefined) {
            tradeState.symbol = String(action.value);
          }
          break;
        case "setAtrMultiplier":
        case "setStopLossATR": {
          const mult = action.value || action.atrMultiplier;
          if (mult !== undefined) {
            // parseAiValue returns Decimal, convert to string for tradeState
            tradeState.atrMultiplier = parseAiValue(mult as string).toString();
            tradeState.useAtrSl = true;
          }
          break;
        }
        case "setUseAtrSl":
          if (typeof action.value === "boolean") {
            tradeState.useAtrSl = action.value;
          }
          break;
        case "setTradeType":
          if (action.value === "long" || action.value === "short") {
            tradeState.tradeType = action.value;
          }
          break;
        case "addTakeProfit": {
          app.addTakeProfitRow();
          const newIdx = tradeState.targets.length - 1;
          if (newIdx >= 0 && action.value !== undefined) {
            tradeState.targets[newIdx].price = String(parseAiValue(action.value as string));
            if (action.percent !== undefined) {
              tradeState.targets[newIdx].percent = String(parseAiValue(action.percent as string));
            }
          }
          break;
        }
        case "removeTakeProfit":
          if (typeof action.index === "number" && tradeState.targets.length > 1) {
            app.removeTakeProfitRow(action.index);
          }
          break;
        case "setAtrMode":
          if (action.value === "auto" || action.value === "manual") {
            tradeState.atrMode = action.value;
          }
          break;
        case "setAtrTimeframe":
          if (typeof action.value === "string") {
            tradeState.atrTimeframe = action.value;
          }
          break;
        case "setAnalysisTimeframe":
          if (typeof action.value === "string") {
            tradeState.analysisTimeframe = action.value;
          }
          break;
        case "setAutoPrice":
          if (typeof action.value === "boolean" && settingsState.aiAllowSettingsChanges) {
            settingsState.autoUpdatePriceInput = action.value;
          }
          break;
        case "setAccountSize":
          if (action.value !== undefined) {
            tradeState.accountSize = String(parseAiValue(action.value as string));
          }
          break;
        case "resetSetup":
          tradeState.resetInputs(true, true);
          break;
        case "setNotes":
          if (typeof action.value === "string") {
            tradeState.tradeNotes = action.value.substring(0, 500);
          }
          break;
        case "setTags":
          if (Array.isArray(action.tags)) {
            tradeState.tags = action.tags.map(String).slice(0, 10);
          } else if (Array.isArray(action.value)) {
            tradeState.tags = action.value.map(String).slice(0, 10);
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
        return `Einstieg: ${action.value}`;
      case "setStopLoss":
        return `Stopp-Loss: ${action.value}`;
      case "setTakeProfit":
        return `TP${(action.index ?? 0) + 1}: ${action.value}`;
      case "setLeverage":
        return `Hebel: ${action.value}x`;
      case "setRisk":
        return `Risiko: ${action.value}%`;
      case "setSymbol":
        return `Symbol: ${action.value}`;
      case "setAtrMultiplier":
      case "setStopLossATR": {
        const mult = action.value || action.atrMultiplier;
        return `ATR SL: ${mult}x`;
      }
      case "setUseAtrSl":
        return action.value ? "ATR SL: AN" : "ATR SL: AUS";
      case "setTradeType":
        return `Richtung: ${String(action.value).toUpperCase()}`;
      case "addTakeProfit":
        return `TP Hinzufügen: ${action.value} (${action.percent ?? 0}%)`;
      case "removeTakeProfit":
        return `TP Entfernen: Index ${(action.index ?? 0) + 1}`;
      case "setAtrMode":
        return `ATR Modus: ${action.value}`;
      case "setAtrTimeframe":
        return `ATR Timeframe: ${action.value}`;
      case "setAnalysisTimeframe":
        return `Analyse Timeframe: ${action.value}`;
      case "setAutoPrice":
        return action.value ? "Live-Preis: AN" : "Live-Preis: AUS";
      case "setAccountSize":
        return `Kontogröße: ${action.value}`;
      case "resetSetup":
        return "Setup zurücksetzen";
      case "setNotes":
        return "Trade-Notizen aktualisiert";
      case "setTags":
        return "Tags aktualisiert";
      default:
        return `Aktion: ${action.action}`;
    }
  }

  /**
   * Add action to pending queue for user confirmation
   */
  private addPendingAction(actions: AiAction[]): string {
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
      const t = get(_);
      const statusText = status === "confirmed" ? t("settings.ai.status.confirmed") : t("settings.ai.status.rejected");

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
