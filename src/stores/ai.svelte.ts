/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";

import { settingsState, type AiProvider } from "./settings.svelte";
import { tradeState } from "./trade.svelte";
import { marketState } from "./market.svelte";
import { accountState } from "./account.svelte";
import { journalState } from "./journal.svelte";
import { cmcService } from "../services/cmcService";
import { newsService } from "../services/newsService";
import type { JournalEntry } from "./types";

export interface AiMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    provider?: AiProvider;
}

export interface PendingAction {
    id: string;
    actions: any[];
    timestamp: number;
}

const LOCAL_STORAGE_KEY = "cachy_ai_history";
const MAX_MESSAGES = 50;

class AiManager {
    messages = $state<AiMessage[]>([]);
    isStreaming = $state(false);
    error = $state<string | null>(null);
    pendingActions = $state<Map<string, PendingAction>>(new Map());

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
            console.error("Failed to load AI history", e);
        }
    }

    private save() {
        if (!browser) return;
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ messages: this.messages, isStreaming: false, error: null }));
        } catch (e) {
            console.error("Failed to save AI history", e);
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
            const context = await this.gatherContext();

            // 3. Prepare Messages (History + System + User)
            const systemPrompt = `You are a professional trading assistant in the Cachy app.

CURRENT MARKET CONTEXT (NOTE: 'marketIntelligence' contains LIVE DATA fetched from CoinMarketCap API):
${JSON.stringify(context, null, 2)}

ROLE:
- You are a knowledgeable crypto trading expert.
- Analyze the provided market data, portfolio stats, and user trades extensively.
- Always check Risk/Reward (R:R) ratios.
- You HAVE ACCESS to the user's current interface inputs (Entry, SL, TP) in the 'tradeSetup' context. USE THEM. Do not ask for them if they are visible.
- Be concise but insightful. Use bullet points for clarity.
- Reply in the same language as the user (DETECT LANGUAGE) unless asked otherwise.
- If the user asks for a trade setup, ALWAYS propose specific Entry, SL, and TP levels based on the context.

${settings.customSystemPrompt ? `\nUSER CUSTOM INSTRUCTIONS:\n${settings.customSystemPrompt}` : ""}


CAPABILITY (ACTION EXECUTION):
You can DIRECTLY set values in the user's trading interface. 
Use this when the user asks to "set values", "prepare trade", "set ATR SL", or agrees to a setup.
To do this, output a JSON block at the very end of your response:

\`\`\`json
[
  { "action": "setSymbol", "value": "BTCUSDT" },
  { "action": "setEntryPrice", "value": 50000 },
  { "action": "setStopLoss", "value": 49000 },
  { "action": "setAtrMultiplier", "value": 2.5 }, 
  { "action": "setTakeProfit", "index": 0, "value": 52000, "percent": 50 },
  { "action": "setRisk", "value": 1.0 },
  { "action": "setLeverage", "value": 10 }
]
\`\`\`
Only output the JSON if you intend to execute changes.
Supported Actions: setSymbol, setEntryPrice, setStopLoss, setTakeProfit, setRisk, setLeverage, setAtrMultiplier, setUseAtrSl (true/false).`;

            const apiMessages = [
                { role: "system", content: systemPrompt },
                ...this.messages.map((m) => ({ role: m.role, content: m.content })),
                // The user message is already in this.messages, but if we strictly follow the previous logic we might duplicate if not careful.
                // Wait, I appended to this.messages above. So I should filter out the system prompt logic if I was adding it dynamically, but here I am reconstructing the prompt for the API call.
                // The API call expects history. I already added userMsg to this.messages.
                // But the previous implementation did:
                // APIMessages = System + State.Messages (which INCLUDED User) + User (wait, previous implementation pushed User to state first? Yes.)
                // Actually previous implementation:
                // 1. Update State with User Msg.
                // 2. apiMessages = System + state.messages.map(...) + userMsg (Wait, previous code said: `...state.messages.map...`, then `{ role: "user", content: text }`.
                // Let's look closely at previous code:
                // update(s => messages + userMsg)
                // apiMessages = [system, ...state.messages.map..., { role: "user", content: text }] ?? 
                // If state.messages already has userMsg, then we are duplicating it.
                // Previous code: `const newMsgs = [...s.messages, userMsg].slice(-MAX_MESSAGES);` -> update S.
                // Then `const apiMessages = [system, ...state.messages.map(...), { role: 'user', content: text }]`
                // YES, IT WAS DUPLICATING THE LAST MESSAGE. That might have been a bug or intentional to ensure it's 'fresh'. 
                // I will fix it to NOT duplicate.
            ];

            // Let's reconstruct apiMessages correctly:
            // It should be System + All History (which includes the latest User Msg)
            // However, for the very specific call structure:
            const payloadMessages = [
                { role: "system", content: systemPrompt },
                ...this.messages.map(m => ({ role: m.role, content: m.content }))
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

                    if (res.ok) break; // Success!

                    if (res.status === 429) {
                        attempt++;
                        const delay = Math.pow(2, attempt) * 1000;
                        console.warn(`Rate limited (429). Retrying in ${delay / 1000}s...`);
                        if (attempt === 1) {
                            this.error = "Rate limited. Retrying...";
                        }
                        await new Promise((r) => setTimeout(r, delay));
                        continue;
                    }

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
                                delta = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                            } else if (provider === "anthropic") {
                                if (data.type === "content_block_delta") {
                                    delta = data.delta?.text || "";
                                }
                            }

                            if (delta) {
                                fullContent += delta;
                                // Update specific message in place
                                const idx = this.messages.findIndex(m => m.id === aiMsgId);
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
                    const cleanedContent = safeContent.replace(/```json\s*[\s\S]*?"action"[\s\S]*?```/g, "").trim();

                    const idx = this.messages.findIndex(m => m.id === aiMsgId);
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
                                console.error("Single action failed", err);
                            }
                        });
                    }
                }
            } catch (actionErr) {
                console.error("Action parsing error:", actionErr);
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
                    trade.symbol ? cmcService.getCoinMetadata(trade.symbol) : Promise.resolve(null)
                ]);

                if (globalMetrics || coinMeta) {
                    cmcContext = {
                        global: globalMetrics ? {
                            btcDominance: globalMetrics.btc_dominance,
                            marketCap: globalMetrics.total_market_cap,
                            volume24h: globalMetrics.total_volume_24h,
                            activeCoins: globalMetrics.active_cryptocurrencies
                        } : "Unavailable",
                        symbolMetadata: coinMeta ? {
                            name: coinMeta.name,
                            slug: coinMeta.slug,
                            tags: coinMeta.tags,
                            dateAdded: coinMeta.date_added
                        } : "Unavailable"
                    };
                }
            } catch (e) {
                console.warn("Failed to gather CMC context:", e);
            }
        }

        // News Data (New Addition)
        let newsContext = null;
        if (settings.enableNewsAnalysis && (settings.cryptoPanicApiKey || settings.newsApiKey)) {
            try {
                // Import newsService here (lazy) or assume it's available via module scope if we imported it top-level
                // We imported it as: import { newsService } from "../services/newsService"; (checked via view_file)
                // Use imported newsService

                // Fetch recent news for active symbol or general crypto if none
                const newsItems = await newsService.fetchNews(trade.symbol || "crypto");

                if (newsItems && newsItems.length > 0) {
                    // Limit to top 5 headlines to save tokens
                    newsContext = newsItems.slice(0, 5).map(n => ({
                        title: n.title,
                        source: n.source,
                        ago: n.published_at // or compute relative time
                    }));
                }
            } catch (e) {
                console.warn("Failed to gather News context:", e);
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
            .reduce((sum: number, t: JournalEntry) => sum + (t.totalNetProfit?.toNumber() || 0), 0)
            .toFixed(2);

        const usdtAsset = account.assets?.find((a: any) => a.currency === "USDT");
        const accountSize = usdtAsset ? usdtAsset.total.toString() : "Unknown";

        const limit = settings.aiTradeHistoryLimit || 50;
        const symbol = trade.symbol;
        const marketData = symbol && market[symbol] ? market[symbol] : null;

        const recentTrades = Array.isArray(journal)
            ? journal.slice(0, limit).map((t: JournalEntry) => ({
                symbol: t.symbol,
                entry: t.entryDate,
                exit: t.exitDate,
                pnl: t.totalNetProfit?.toNumber() || 0,
                won: (t.totalNetProfit?.toNumber() || 0) > 0,
            }))
            : [];

        return {
            portfolioStats: { totalTrades, winrate, totalPnl, accountSize },
            activeSymbol: symbol,
            currentPrice: marketData?.lastPrice?.toString() || "Unknown",
            priceChange24h: marketData?.priceChangePercent?.toString() + "%" || "Unknown",
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
            latestNews: newsContext
        };
    }

    private parseActions(text: string): any[] {
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

    private executeAction(action: any, confirmNeeded: boolean): boolean {
        // confirmNeeded is now handled at the batch level in processResponse
        if (confirmNeeded) return false;

        try {
            switch (action.action) {
                case "setEntryPrice":
                    if (action.value) {
                        tradeState.update((s: any) => ({ ...s, entryPrice: parseFloat(action.value) }));
                    }
                    break;
                case "setStopLoss":
                    if (action.value) {
                        tradeState.update((s: any) => ({ ...s, stopLossPrice: parseFloat(action.value) }));
                    }
                    break;
                case "setTakeProfit":
                    if (typeof action.index === "number") {
                        tradeState.update((s: any) => {
                            const newTargets = [...s.targets];
                            if (newTargets[action.index]) {
                                let updatedTarget = { ...newTargets[action.index] };
                                if (action.value) updatedTarget.price = parseFloat(action.value);
                                if (action.percent) updatedTarget.percent = parseFloat(action.percent);
                                newTargets[action.index] = updatedTarget;
                            }
                            return { ...s, targets: newTargets };
                        });
                    }
                    break;
                case "setLeverage":
                    if (action.value) {
                        tradeState.update((s: any) => ({ ...s, leverage: parseFloat(action.value) }));
                    }
                    break;
                case "setRisk":
                    if (action.value) {
                        tradeState.update((s: any) => ({ ...s, riskPercentage: parseFloat(action.value) }));
                    }
                    break;
                case "setSymbol":
                    if (action.value) {
                        tradeState.update((s: any) => ({ ...s, symbol: action.value }));
                    }
                    break;
                case "setAtrMultiplier":
                case "setStopLossATR":
                    const mult = action.value || action.atrMultiplier;
                    if (mult) {
                        tradeState.update((s: any) => ({ ...s, atrMultiplier: parseFloat(mult), useAtrSl: true }));
                    }
                    break;
                case "setUseAtrSl":
                    if (typeof action.value === "boolean") {
                        tradeState.update((s: any) => ({ ...s, useAtrSl: action.value }));
                    }
                    break;
            }
            return true;
        } catch (e) {
            console.error("AI Action Execution Failed", e);
            return false;
        }
    }

    /**
     * Describe an action in compact human-readable format
     */
    public describeAction(action: any): string {
        switch (action.action) {
            case "setEntryPrice":
                return `Entry: ${action.value}`;
            case "setStopLoss":
                return `Stop Loss: ${action.value}`;
            case "setTakeProfit":
                return `TP${action.index + 1}: ${action.value}`;
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
            timestamp: Date.now()
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
        pending.actions.forEach(action => {
            this.executeAction(action, false);
        });

        // Remove from pending
        this.pendingActions.delete(actionId);

        // Update message to show confirmed status
        this.updateActionMessage(actionId, "confirmed");
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
    }

    /**
     * Update action message to show status
     */
    private updateActionMessage(actionId: string, status: "confirmed" | "rejected") {
        const idx = this.messages.findIndex(m => m.content.includes(`[PENDING:${actionId}]`));
        if (idx !== -1) {
            const statusEmoji = status === "confirmed" ? "✅" : "❌";
            const statusText = status === "confirmed" ? "Bestätigt" : "Abgelehnt";

            // Remove [PENDING:id] and add status
            this.messages[idx].content = this.messages[idx].content
                .replace(`[PENDING:${actionId}]`, `[${statusEmoji} ${statusText}]`);
        }
    }

    // Compatibility
    subscribe(fn: (value: { messages: AiMessage[], isStreaming: boolean, error: string | null }) => void) {
        fn({ messages: this.messages, isStreaming: this.isStreaming, error: this.error });
        return $effect.root(() => {
            $effect(() => {
                fn({ messages: this.messages, isStreaming: this.isStreaming, error: this.error });
            });
        });
    }
}

export const aiState = new AiManager();
