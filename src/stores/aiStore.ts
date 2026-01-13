import { writable, get } from "svelte/store";
import { browser } from "$app/environment";
import { settingsStore, type AiProvider } from "./settingsStore";
import { tradeStore } from "./tradeStore";
import { marketStore } from "./marketStore";
import { accountStore } from "./accountStore";
import { journalStore } from "./journalStore";
import type { JournalEntry } from "./types";

export interface AiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  provider?: AiProvider;
}

export interface AiState {
  messages: AiMessage[];
  isStreaming: boolean;
  error: string | null;
}

const LOCAL_STORAGE_KEY = "cachy_ai_history";
const MAX_MESSAGES = 50; // Keep history reasonable

const initialState: AiState = {
  messages: [],
  isStreaming: false,
  error: null,
};

function createAiStore() {
  let initial = initialState;
  if (browser) {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Ensure shape validity
        if (parsed.messages) initial = parsed;
      }
    } catch (e) {
      console.error("Failed to load AI history", e);
    }
  }

  const { subscribe, update, set } = writable<AiState>(initial);

  const save = (state: AiState) => {
    if (!browser) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  };

  return {
    subscribe,

    sendMessage: async (text: string) => {
      const state = get({ subscribe });
      const settings = get(settingsStore);

      // 1. Add User Message
      const userMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      update((s) => {
        const newMsgs = [...s.messages, userMsg].slice(-MAX_MESSAGES);
        const newState = {
          ...s,
          messages: newMsgs,
          isStreaming: true,
          error: null,
        };
        save(newState);
        return newState;
      });

      try {
        // 2. Gather Context
        const context = gatherContext();

        // 3. Prepare Messages (History + System + User)
        const systemPrompt = `You are a helpful trading assistant in the Cachy app.

CURRENT MARKET CONTEXT:
${JSON.stringify(context, null, 2)}

User's goal is trading crypto futures. Be concise, technical, and helpful.
If analyzing a trade, check the PnL and risk.
Format responses with Markdown.`;

        const apiMessages = [
          { role: "system", content: systemPrompt },
          ...state.messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: text },
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

        update((s) => {
          const newMsgs = [...s.messages, aiMsg];
          return { ...s, messages: newMsgs, isStreaming: true };
        });

        // 5. Call API with Stream Handling
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            messages: apiMessages,
            model: model, // Pass the model from settings
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to fetch AI response");
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
                  // Gemini SSE format usually: data: {"candidates": [{"content": {"parts": [{"text": "..."}]}}]}
                  delta = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                } else if (provider === "anthropic") {
                  if (data.type === "content_block_delta") {
                    delta = data.delta?.text || "";
                  }
                }

                if (delta) {
                  fullContent += delta;
                  // Update Store incrementally
                  update((s) => {
                    const msgs = [...s.messages];
                    const last = msgs[msgs.length - 1];
                    if (last.id === aiMsgId) {
                      last.content = fullContent;
                    }
                    return { ...s, messages: msgs };
                  });
                }
              } catch (e) {
                // Ignore parse errors for partial chunks
              }
            }
          }
        }

        update((s) => {
          const newState = { ...s, isStreaming: false };
          save(newState); // Save full conversation at end
          return newState;
        });
      } catch (e: any) {
        update((s) => ({ ...s, isStreaming: false, error: e.message }));
      }
    },

    clearHistory: () => {
      const newState = { ...initialState };
      set(newState);
      save(newState);
    },
  };
}

function gatherContext() {
  const trade = get(tradeStore);
  const market = get(marketStore);
  const account = get(accountStore);
  const journal: JournalEntry[] = get(journalStore);

  // Extract relevant bits
  const symbol = trade.symbol;
  const marketData = symbol ? market[symbol] : null;

  // Get last 5 trades from Journal
  // The journal store is an array of JournalEntry
  const recentTrades = journal.slice(0, 5).map((t) => ({
    symbol: t.symbol,
    entry: t.entryDate,
    exit: t.exitDate,
    pnl: t.totalNetProfit?.toNumber() || 0,
    won: (t.totalNetProfit?.toNumber() || 0) > 0,
  }));

  return {
    activeSymbol: symbol,
    currentPrice: marketData?.lastPrice?.toString() || "Unknown",
    priceChange24h:
      marketData?.priceChangePercent?.toString() + "%" || "Unknown",
    openPositions: account.positions.map((p) => ({
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
    })),
    recentHistory: recentTrades,
    tradeSetup: {
      entry: trade.entryPrice,
      sl: trade.stopLossPrice,
      tp: trade.targets,
      risk: trade.riskPercentage + "%",
    },
  };
}

export const aiStore = createAiStore();
