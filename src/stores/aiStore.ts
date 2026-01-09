import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { settingsStore, type AiProvider } from './settingsStore';
import { tradeStore } from './tradeStore';
import { marketStore } from './marketStore';
import { accountStore } from './accountStore';
import { journalStore } from './journalStore';

export interface AiMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    provider?: AiProvider;
}

export interface AiState {
    messages: AiMessage[];
    isStreaming: boolean;
    error: string | null;
}

const LOCAL_STORAGE_KEY = 'cachy_ai_history';
const MAX_MESSAGES = 50; // Keep history reasonable

const initialState: AiState = {
    messages: [],
    isStreaming: false,
    error: null
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
            console.error('Failed to load AI history', e);
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
                role: 'user',
                content: text,
                timestamp: Date.now()
            };

            update(s => {
                const newMsgs = [...s.messages, userMsg].slice(-MAX_MESSAGES);
                const newState = { ...s, messages: newMsgs, isStreaming: true, error: null };
                save(newState);
                return newState;
            });

            try {
                // 2. Gather Context
                const context = gatherContext();

                // 3. Prepare Messages (History + System + User)
                // We don't send the full context in every message, but as a System Prompt
                const systemPrompt = `You are a helpful trading assistant in the Cachy app.

CURRENT MARKET CONTEXT:
${JSON.stringify(context, null, 2)}

User's goal is trading crypto futures. Be concise, technical, and helpful.
If analyzing a trade, check the PnL and risk.
Format responses with Markdown.`;

                const apiMessages = [
                    { role: 'system', content: systemPrompt },
                    ...state.messages.map(m => ({ role: m.role, content: m.content })), // History
                    { role: 'user', content: text } // Current
                ];

                const provider = settings.aiProvider || 'gemini';
                const endpoint = `/api/ai/${provider}`;

                let apiKey = '';
                if (provider === 'openai') apiKey = settings.openaiApiKey;
                if (provider === 'gemini') apiKey = settings.geminiApiKey;
                if (provider === 'anthropic') apiKey = settings.anthropicApiKey;

                if (!apiKey) {
                    throw new Error(`API Key for ${provider} is missing in Settings.`);
                }

                // 4. Call API
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey
                    },
                    body: JSON.stringify({
                        messages: apiMessages,
                        // Model can be customizable later
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Failed to fetch AI response');
                }

                const data = await res.json();
                const aiText = data.choices?.[0]?.message?.content || 'No response';

                // 5. Add Assistant Message
                const aiMsg: AiMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: aiText,
                    timestamp: Date.now(),
                    provider
                };

                update(s => {
                    const newMsgs = [...s.messages, aiMsg].slice(-MAX_MESSAGES);
                    const newState = { ...s, messages: newMsgs, isStreaming: false };
                    save(newState);
                    return newState;
                });

            } catch (e: any) {
                update(s => ({ ...s, isStreaming: false, error: e.message }));
            }
        },

        clearHistory: () => {
            const newState = { ...initialState };
            set(newState);
            save(newState);
        }
    };
}

function gatherContext() {
    const trade = get(tradeStore);
    const market = get(marketStore);
    const account = get(accountStore);
    // const journal = get(journalStore); // Too large to send fully

    // Extract relevant bits
    const symbol = trade.symbol;
    const marketData = symbol ? market[symbol] : null;

    return {
        activeSymbol: symbol,
        currentPrice: marketData?.lastPrice?.toString() || 'Unknown',
        priceChange24h: marketData?.priceChangePercent?.toString() + '%' || 'Unknown',
        openPositions: account.positions.map(p => ({
            symbol: p.symbol,
            side: p.side,
            size: p.size.toString(), // Correct property name 'size' (from Decimal)
            entry: p.entryPrice.toString(), // Correct property name 'entryPrice'
            pnl: p.unrealizedPnl.toString(), // Correct property name 'unrealizedPnl'
            // ROI is not directly in Position interface, calculate it?
            roi: !p.entryPrice.isZero() && !p.size.isZero() ? p.unrealizedPnl.div(p.entryPrice.times(p.size).div(p.leverage)).times(100).toFixed(2) + '%' : 'N/A'
        })),
        tradeSetup: {
            entry: trade.entryPrice,
            sl: trade.stopLossPrice,
            tp: trade.targets,
            risk: trade.riskPercentage + '%'
        }
    };
}

export const aiStore = createAiStore();
