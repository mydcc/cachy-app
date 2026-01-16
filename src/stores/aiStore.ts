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
        const systemPrompt = `You are a professional trading assistant in the Cachy app.

CURRENT MARKET CONTEXT:
${JSON.stringify(context, null, 2)}

ROLE:
- You are a knowledgeable crypto trading expert.
- Analyze the provided market data and user trades extensively.
- Always check Risk/Reward (R:R) ratios when discussing setups.
- Be concise but insightful. Use bullet points for clarity.
- If the user asks for a trade setup, ALWAYS propose specific Entry, SL, and TP levels based on the context.

CAPABILITY (ACTION EXECUTION):
You can DIRECTLY set values in the user's trading interface. 
Use this when the user asks to "set values", "prepare trade", or agrees to a setup.
To do this, output a JSON block at the very end of your response:

\`\`\`json
[
  { "action": "setSymbol", "value": "BTCUSDT" },
  { "action": "setEntryPrice", "value": 50000 },
  { "action": "setStopLoss", "value": 49000 },
  { "action": "setTakeProfit", "index": 0, "value": 52000 },
  { "action": "setRisk", "value": 1.0 },
  { "action": "setLeverage", "value": 10 }
]
\`\`\`
Only output the JSON if you intend to execute changes.`;

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
                messages: apiMessages,
                model: model, // Pass the model from settings
              }),
            });

            if (res.ok) break; // Success!

            if (res.status === 429) {
              // Rate Limited - Exponential Backoff
              attempt++;
              const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
              console.warn(`Rate limited (429). Retrying in ${delay / 1000}s...`);
              // Inform user (optional, via store error temporarily?)
              if (attempt === 1) {
                update(s => ({ ...s, error: `Rate limited. Retrying...` }));
              }
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }

            // Other error - throw to catch block
            const err = await res.json();
            throw new Error(err.error || `Request failed with status ${res.status}`);

          } catch (e: any) {
            if (attempt === MAX_RETRIES - 1) throw e; // Final failure
            attempt++;
            console.warn(`API Error: ${e.message}. Retrying...`);
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

        // --- Action Handling ---
        const actions = parseActions(fullContent);
        if (actions.length > 0) {
          // Check settings for confirmation
          const confirmActions = settings.aiConfirmActions ?? true;
          let blockedCount = 0;

          actions.forEach(action => {
            const success = executeAction(action, confirmActions);
            if (!success) blockedCount++;
          });

          if (blockedCount > 0) {
            const sysMsg: AiMessage = {
              id: crypto.randomUUID(),
              role: "system",
              content: "⚠️ **Aktionen blockiert:** Bitte deaktiviere 'Ask before Actions' in den AI-Einstellungen, um automatische Änderungen zuzulassen.",
              timestamp: Date.now()
            };
            // Add warning after the assistant message
            update(s => ({ ...s, messages: [...s.messages, sysMsg] }));
          }
        }
        // -----------------------

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
  const trade = get(tradeStore) || {};
  const market = get(marketStore) || {};
  const account = get(accountStore) || { positions: [] };
  const journal = get(journalStore) || [];

  // Extract relevant bits
  const symbol = trade.symbol;
  const marketData = symbol && market[symbol] ? market[symbol] : null;

  // Get last 5 trades from Journal
  const recentTrades = Array.isArray(journal)
    ? journal.slice(0, 5).map((t) => ({
      symbol: t.symbol,
      entry: t.entryDate,
      exit: t.exitDate,
      pnl: t.totalNetProfit?.toNumber() || 0,
      won: (t.totalNetProfit?.toNumber() || 0) > 0,
    }))
    : [];

  return {
    activeSymbol: symbol,
    currentPrice: marketData?.lastPrice?.toString() || "Unknown",
    priceChange24h:
      marketData?.priceChangePercent?.toString() + "%" || "Unknown",
    openPositions: Array.isArray(account.positions)
      ? account.positions.map((p) => ({
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
    },
  };
}

function parseActions(text: string): any[] {
  const actions: any[] = [];
  const regex = /```json\s*(\[\s*\{.*?\}\s*\])\s*```/s;
  const match = text.match(regex);

  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) { /* ignore */ }
  }

  const singleRegex = /```json\s*(\{.*?\})\s*```/s;
  const singleMatch = text.match(singleRegex);
  if (singleMatch && singleMatch[1]) {
    try {
      const parsed = JSON.parse(singleMatch[1]);
      return [parsed];
    } catch (e) { /* ignore */ }
  }

  return actions;
}

function executeAction(action: any, confirmNeeded: boolean): boolean {
  if (confirmNeeded) return false;

  try {
    switch (action.action) {
      case "setEntryPrice":
        if (action.value) {
          tradeStore.update((s) => ({ ...s, entryPrice: parseFloat(action.value) }));
        }
        break;
      case "setStopLoss":
        if (action.value) {
          tradeStore.update((s) => ({ ...s, stopLossPrice: parseFloat(action.value) }));
        }
        break;
      case "setTakeProfit":
        if (action.value && typeof action.index === 'number') {
          tradeStore.update((s) => {
            const newTargets = [...s.targets];
            if (newTargets[action.index]) {
              newTargets[action.index] = { ...newTargets[action.index], price: parseFloat(action.value) };
            }
            return { ...s, targets: newTargets };
          });
        }
        break;
      case "setLeverage":
        if (action.value) {
          tradeStore.update((s) => ({ ...s, leverage: parseFloat(action.value) }));
        }
        break;
      case "setRisk":
        if (action.value) {
          tradeStore.update((s) => ({ ...s, riskPercentage: parseFloat(action.value) }));
        }
        break;
      case "setSymbol":
        if (action.value) {
          tradeStore.update(s => ({ ...s, symbol: action.value }));
        }
        break;
    }
    return true;
  } catch (e) {
    console.error("AI Action Execution Failed", e);
    return false;
  }
}

export const aiStore = createAiStore();
