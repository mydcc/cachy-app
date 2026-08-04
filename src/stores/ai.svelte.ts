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
      const langLabel = appLocale === "de" ? "German" : "English";

      const identity = `You are an institutional-grade Trading Analyst specializing in Risk Management and Quantitative Strategy. You operate like a senior desk analyst at a prop firm: precise, skeptical, and always capital-first.

LANGUAGE RULE:
- RESPOND IN THE SAME LANGUAGE AS THE USER'S MESSAGE.
- If the user writes in German, respond in German. If in English, respond in English.
- If the user's intent is unclear (e.g. quick commands like "Market Check"), use the app language: ${langLabel}.
- NEVER mention this rule in your response.

PRICE CLASSIFICATION RULE (CRITICAL — read before every analysis):
The REAL_TIME_PRICE in your context is a REFERENCE POINT ONLY, not a trade signal.
Your job is to CLASSIFY the current price:
  1. LOCATION: Is price at an Order Block, FVG, Pivot, or psychological level?
  2. MOMENTUM: Is it extended (>1 ATR from the last structure) or discounted (OTE 0.618–0.786 Fib)?
  3. DISTANCE: How far is the user's Entry (from tradeSetup) from the live price? Is it realistic?
NEVER: Set EntryPrice = REAL_TIME_PRICE without an explicit user request.
NEVER: Recommend chasing a move that is more than 1 ATR extended from the last clear structure.`;

      // Mode-specific instructions
      const mode = settings.aiAnalysisMode || "risk";
      const modeInstructions: Record<string, string> = {
        risk: "",  // Standard — baseRoleInstructions applies fully
        coach: [
          "ANALYSIS MODE: TRADE COACH",
          "- Your primary goal is to TEACH, not to signal.",
          "- Explain every concept in simple terms, as if talking to an intermediate trader.",
          "- Do NOT output a JSON action block. Do NOT suggest specific entry/SL/TP values.",
          "- Instead, explain the PRINCIPLE behind good entries, stop placement, and targets.",
          "- End every response with a learning takeaway: 'Key Takeaway: ...'",
        ].join("\n"),
        scalper: [
          "ANALYSIS MODE: SCALPER",
          "- Be BRIEF and DIRECT. Maximum 5 bullet points per response.",
          "- No explanations of why. Just: Direction, Level, Invalidation.",
          "- Format: 🟢 Long / 🔴 Short | Entry: X | SL: Y | TP: Z",
          "- If no clear setup exists, say so in ONE sentence.",
          "- Skip the 'Quellen' section. Skip long markdown formatting.",
          "- R:R rules still apply. If the R:R verdict in context is REJECT, say 'No setup — bad R:R' instead of forcing one.",
        ].join("\n"),
        analyst: [
          "ANALYSIS MODE: MARKET ANALYST",
          "- Focus purely on market structure and macro context. No trade setup.",
          "- Do NOT output a JSON action block.",
          "- Do NOT suggest entry, SL, or TP values.",
          "- Describe: Trend, Key Levels, Sentiment, and what to watch for next.",
        ].join("\n"),
      };
      const modeOverride = modeInstructions[mode] ? `\n\n${modeInstructions[mode]}` : "";

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
        "AUDIT-FIRST PROTOCOL (MANDATORY — applies when user shares a trade setup):",
        "When the user provides a setup (entry, SL, TP), you MUST follow this order:",
        "  STEP 1 — AUDIT: Read the 'tradeSetup.rrVerdict' from context. Use 'tradeSetup.calculatedRR' as the pre-verified R:R — do NOT recalculate it yourself.",
        "  STEP 2 — VERDICT: State the R:R clearly and give a verdict: VALID / WARNING / REJECT.",
        "  STEP 3 — ONLY IF ASKED: Suggest an alternative setup ONLY if the user explicitly asks 'What would you do?' or 'Give me a better entry'.",
        "  NEVER auto-generate a JSON action block to 'fix' the user's setup unless they explicitly request it.",
        "",
        "STRICT OPERATING RULES:",
        "1. ALGORITHMIC SETUP GENERATION (MANDATORY):",
        "   If you are proposing a new trade setup (or an alternative), you MUST follow this strict mathematical algorithm:",
        "   - STEP A (Direction): Use technicals.summary (e.g. STRONG_BUY -> Long). If contradictory, ABORT.",
        "   - STEP B (Entry): Use a logical pullback level from context (e.g., Pivot P, EMA).",
        "   - STEP C (Stop Loss): MUST be mathematically calculated using ATR! SL = Entry +/- (1.5 * ATR). NEVER invent SL levels that violate the 1.5x ATR rule.",
        "   - STEP D (Risk): Calculate Risk = Absolute difference between Entry and SL.",
        "   - STEP E (Minimum TP1): To guarantee a Risk-Reward (CRV) of at least 1:2, TP1 MUST be placed at Entry +/- (2 * Risk).",
        "   - STEP F (Resistance Check): Check if a major context level (e.g. Pivot R1/S1) blocks the path to TP1.",
        "     * If YES: The trade is INVALID! You MUST reject the trade and explain that a 1:2 CRV is blocked by resistance. DO NOT output JSON.",
        "     * If NO: The trade is valid.",
        "",
        "2. PROOF OF WORK (MANDATORY RENDER):",
        "   Before you output ANY trade setup JSON (or if you reject a trade in Step F), you MUST render this exact markdown block to prove your math:",
        "   **Mathematischer Audit:**",
        "   - Entry: [Value]",
        "   - SL (1.5x ATR): [Value]",
        "   - Risiko (absolut): [Value]",
        "   - Minimaler TP für 1:2 CRV: [Value]",
        "   - Nächster Chart-Widerstand: [Value]",
        "   - Fazit: [Trade Valide / Trade Abgelehnt]",
        "",
        "3. CAPITAL PROTECTION (AUDITING USER SETUPS):",
        "   - When auditing the user's setup, use the pre-calculated 'tradeSetup.calculatedRR' and 'tradeSetup.rrVerdict' from context.",
        "   - rrVerdict REJECT (R:R < 1:1.5): Reject the setup entirely. Tell the user it's a bad trade mathematically. Do NOT output a JSON action block.",
        "   - rrVerdict WARNING (R:R 1:1.5–1:2): Accept but warn explicitly. Output the JSON if the user wants it, but flag the poor R:R.",
        "   - rrVerdict VALID (R:R ≥ 1:2): Proceed normally.",
        "",
        "4. NO CHASING: Do not suggest entries at the top/bottom of a move. Wait for pullbacks.",
        "5. NO DUPLICATES: Each TP level must be unique and follow the price progression.",
        "",
        "ANALYTICAL RIGOR:",
        "- RATIONALE: For every calculation or trade setup shared, provide a specific reason based on the provided context data. Explain WHY you chose certain TP/SL levels.",
        "- DECISIVE DATA: Identify and highlight the exact data point that was decisive for your recommendation (e.g., 'Decisive: BTC 24h Trend (+5%) supporting a Long bias').",
        "- DATA AVAILABILITY: You ALWAYS have the 'REAL_TIME_PRICE' in your context. If it says 'Unknown', only then do you not have it. Do not claim to lack price data if it is present in the context JSON.",
        "- CONTEXTUAL AUDIT: If the context data contains conflicting signals, point them out and explain your weighting.",
        "",
        "ANTI-HALLUCINATION PROTOCOL (MANDATORY):",
        "1. VERIFICATION OVER CITATION: You MUST verify all prices, news, and technical indicators against the context. However, do NOT include variable names (like '(REAL_TIME_PRICE)') inside your natural sentences.",
        "2. FOOTNOTE CITATION: At the very end of your response, after a horizontal rule '---', add a 'Quellen:' section. List the data keys you relied on inside a <small> tag to keep it subtle. Example: <small>Quellen: REAL_TIME_PRICE, latestNews.ago</small>",
        "",
        "3. DATA BOUNDARIES: If data is missing or unclear:",
        "   - NEVER guess or estimate from general knowledge",
        "   - EXPLICITLY state: 'I don't have [X] data in my context'",
        "   - Suggest how the user could provide this data",
        "   ",
        "4. VERIFICATION CHECKPOINTS: Before making ANY recommendation:",
        "   - Internally verify the 3 key data points you used",
        "   - If ANY is missing, abort the recommendation",
        "",
        "5. NUMBER PRECISION: ",
        "   - Use EXACT numbers from context (e.g., '47245.32') for calculations.",
        "   - In the text, follow the rounding rules defined in TONE & STYLE.",
        "",
        "6. UNCERTAINTY MARKERS:",
        "   - If confidence < 90%, prefix with: 'Basierend auf begrenzten Daten: ...'",
        "   - If speculating (e.g., market psychology), prefix with: 'Spekulation: ...'",
        "   - NEVER present guesses as facts",
        "",
        "8. NO FORCED SETUPS:",
        "   - You are a Risk Manager, not a signal group. You do NOT have to provide a setup if the market is choppy or undefined.",
        "   - STRICT RULE: You must use the EXACT numbers provided in the 'technicals' and 'marketDetails' context blocks. NEVER invent, estimate, or modify these numbers.",
        "   - NEVER invent random price levels just to generate a JSON action block.",
        "",
        "- MARKET NOISE & VOLATILITY (CRITICAL):",
        "  * **SNAPSHOT DATA**: Treat 'spread' and 'imbalance' as high-frequency noise. These values change every millisecond and have ZERO predictive power in isolation.",
        "  * **IGNORE BY DEFAULT**: Do NOT mention the spread or orderbook imbalance if the status is 'Normal/Liquid' or 'Balanced'.",
        "  * **ANOMALY DETECTION**: Only address these metrics if they show extreme values (e.g., Status: 'Extreme Gap' or 'Extreme Pressure').",
        "  * **HISTORICAL PRIORITY**: Always prioritize Technical Indicators (RSI, EMA) and Market Structure (HH/HL) over local orderbook snapshots.",
        "",
        "TONE & STYLE:",
        "- Professional, objective, and data-driven.",
        "- LANGUAGE: Use natural, precise, and concise language. Avoid robotic or template-like phrasing.",
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
        "  * **EXACT STRINGS**: DO NOT round numbers yourself! Output them EXACTLY as they appear in the JSON context. If the JSON says '72.3566', you must write '72.3566', not '72.35'.",
        "  * **NO CURRENCY SUFFIXES FOR INDICATORS**: Do not append 'USDT' or 'USD' to technical indicators like ATR, RSI, or Pivot Points. Just use the raw number as provided in the context.",
        "  * **STRUCTURE**: Use Markdown bullet points, standard lists, and bold text for keys.",
        "  * **READABILITY**: Use short paragraphs. Avoid 'wall of text'.",
        "  * **SEPARATORS**: Use '---' to separate major sections if the response is long.",
        "- Use structured bullet points and bold text for key metrics.",
      ].join("\n");

      const systemPrompt = `${identity}\n\n${settings.customSystemPrompt || baseRoleInstructions}${modeOverride}

IMPORTANT (CRITICAL FOR JSON ACTIONS):
When generating the JSON block for actions (e.g., setEntryPrice, setTakeProfit), you MUST use STANDARD ENGLISH NUMBER FORMAT.
- Decimal separator: DOT (.)
- Thousands separator: NONE
- Example: 1200.50 (NOT 1.200,50 or 1,200.50)
- Failure to do this will cause the app to misinterpret values (e.g. 1.200 becomes 1.2).
 
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
  * Use the 'ago' value directly in your text to describe when news happened. Do NOT recalculate or estimate.
- PORTFOLIO DATA: Real-time access to user's stats and positions.
- INTERFACE ACCESS: You see exactly what the user enters in 'tradeSetup'.
- ACTION EXECUTION: You can DIRECTLY set values in the user's trading interface. 

FORMAT: To update values, output a JSON block at the very end:
\`\`\`json
[
  { "action": "setTradeType", "value": "short" },
  { "action": "setSymbol", "value": "BTCUSDT" },
  { "action": "setEntryPrice", "value": 50000 },
  { "action": "setStopLoss", "value": 49000 },
  { "action": "addTakeProfit", "value": 52000, "percent": 50 },
  { "action": "setTakeProfit", "index": 0, "value": 52000, "percent": 50 },
  { "action": "removeTakeProfit", "index": 1 },
  { "action": "setAutoPrice", "value": false },
  { "action": "setNotes", "value": "Short due to bearish divergence" }
]
\`\`\`
Supported Actions: setSymbol, setEntryPrice, setStopLoss, setTakeProfit, addTakeProfit, removeTakeProfit, setTradeType, setRisk, setLeverage, setAtrMultiplier, setAtrMode, setAtrTimeframe, setAnalysisTimeframe, setAutoPrice, setAccountSize, setUseAtrSl, resetSetup, setNotes, setTags.

BEFORE SENDING YOUR RESPONSE (Chain-of-Thought Verification):
1. Review your answer
2. For each claim, ask yourself: "Is this from the context JSON or from my training?"
3. If from training, either:
   - Remove it, OR
   - Mark it as speculation with low confidence
4. Verify all numbers match the context exactly
5. Check that you cited sources for all key data points
6. FATAL ERROR CHECK: Did I invent a Pivot point, ATR, or price level? If the number does not exist in the REAL-TIME CONTEXT JSON verbatim, DO NOT USE IT.`;

      // Construct Payload Messages
      const payloadMessages = [
        { role: "system", content: systemPrompt },
        ...this.messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const provider = settings.aiProvider || "gemini";
      const endpoint = `/api/ai/${provider}`;

      let apiKey = "";
      let model = "";
      let baseUrl = "";

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
      if (provider === "openrouter") {
        apiKey = settings.openrouterApiKey;
        model = settings.openrouterModel;
      }
      if (provider === "ollama") {
        // Local (or self-hosted) instance — no API key required.
        model = settings.ollamaModel;
        baseUrl = settings.ollamaBaseUrl;
      }

      if (!apiKey && provider !== "ollama") {
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

      while (attempt < MAX_RETRIES) {
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
              ...(provider === "ollama" ? { baseUrl } : {}),
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
      let isFirstChunk = true;

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

              if (provider === "openai" || provider === "openrouter" || provider === "ollama") {
                delta = data.choices?.[0]?.delta?.content || "";
              } else if (provider === "gemini") {
                delta = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
              } else if (provider === "anthropic") {
                if (data.type === "content_block_delta") {
                  delta = data.delta?.text || "";
                }
              }

              if (delta) {
                // Guard against Gemma/Gemini first-chunk system-prompt leak:
                // If the very first delta is suspiciously long (>600 chars), it likely
                // contains the system prompt echoed back. Skip rendering until next chunk.
                if (isFirstChunk && provider === "gemini" && delta.length > 600) {
                  isFirstChunk = false;
                  fullContent += delta;
                  continue; // Don't render this chunk to the user
                }
                isFirstChunk = false;
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
        const actions = this.parseActions(safeContent) || [];

        if (Array.isArray(actions) && actions.length > 0) {
          // 1. Code-level R:R guard: block execution if the suggested setup is mathematically poor
          const entryAction = actions.find((a) => a.action === "setEntryPrice");
          const slAction = actions.find((a) => a.action === "setStopLoss");
          const tp1Action = actions.find((a) => (a.action === "setTakeProfit" && (a.index ?? -1) === 0) || a.action === "addTakeProfit");

          if (entryAction?.value != null && slAction?.value != null && tp1Action?.value != null) {
            try {
              const entryD = new Decimal(entryAction.value as string | number);
              const slD = new Decimal(slAction.value as string | number);
              const tp1D = new Decimal(tp1Action.value as string | number);
              const risk = entryD.minus(slD).abs();
              const reward = tp1D.minus(entryD).abs();
              if (!risk.isZero() && reward.div(risk).lt(1.5)) {
                // R:R too low — block the action block, leave the text analysis intact
                logger.warn("ai", "Blocked AI action: R:R below 1:1.5", {
                  rr: reward.div(risk).toFixed(2),
                });
                // Strip only the JSON block, keep the text
                const cleanedContent = safeContent
                  .replace(/```json[\s\S]*?```/g, "")
                  .trim();
                const idx = this.messages.findIndex((m) => m.id === aiMsgId);
                if (idx !== -1) {
                  this.messages[idx].content = cleanedContent;
                }
                // Do not execute — fall through to save()
                this.isStreaming = false;
                this.save();
                return;
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
    } catch (e) {
      this.isStreaming = false;
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  private async gatherContext(): Promise<AiContext> {
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
      (t: JournalEntry) => new Decimal(new Decimal(t.totalNetProfit || 0)).toNumber() > 0,
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
        const pnlNum = new Decimal(new Decimal(t.totalNetProfit || 0)).toNumber();
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
          const klines = await apiService.fetchBitunixKlines(symbol, timeframe, limit);
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
            const trendKlines = await apiService.fetchBitunixKlines(symbol, trendTimeframe, 200);
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
        : [],
      recentHistory: recentTrades,
      tradeSetup: {
        tradeType: trade.tradeType,
        entry: trade.entryPrice,
        sl: trade.stopLossPrice,
        tp: trade.targets,
        risk: trade.riskPercentage + "%",
        atrMultiplier: trade.atrMultiplier,
        useAtrSl: trade.useAtrSl,
        ...this.calculateRR(trade),
      },
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
