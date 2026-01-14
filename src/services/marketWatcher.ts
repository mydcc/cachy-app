import { get, writable } from "svelte/store";
import { bitunixWs } from "./bitunixWs";
import { apiService } from "./apiService";
import { settingsStore } from "../stores/settingsStore";
import { wsStatusStore } from "../stores/marketStore";
import { normalizeSymbol } from "../utils/symbolUtils";
import { browser } from "$app/environment";

interface MarketWatchRequest {
    symbol: string;
    channels: Set<string>; // "price", "ticker", "kline_1m", "kline_1h", etc.
}

class MarketWatcher {
    private requests = new Map<string, Set<string>>(); // symbol -> channels
    private pollingInterval: any = null;
    private readonly DEFAULT_POLLING_MS = 10000;

    constructor() {
        if (browser) {
            this.startPolling();
            // Watch settings for provider changes
            settingsStore.subscribe(() => {
                this.syncSubscriptions();
            });
        }
    }

    /**
     * Register interest in a specific data channel for a symbol.
     * @param symbol Raw symbol
     * @param channel Channel name (e.g., "price", "kline_1h")
     */
    register(symbol: string, channel: string) {
        if (!symbol) return;
        const normSymbol = normalizeSymbol(symbol, "bitunix"); // Use bitunix as default normalization base

        if (!this.requests.has(normSymbol)) {
            this.requests.set(normSymbol, new Set());
        }

        const channels = this.requests.get(normSymbol)!;
        if (!channels.has(channel)) {
            channels.add(channel);
            this.syncSubscriptions();
        }
    }

    /**
     * Unregister interest.
     */
    unregister(symbol: string, channel: string) {
        const normSymbol = normalizeSymbol(symbol, "bitunix");
        const channels = this.requests.get(normSymbol);
        if (channels) {
            channels.delete(channel);
            if (channels.size === 0) {
                this.requests.delete(normSymbol);
            }
            this.syncSubscriptions();
        }
    }

    private syncSubscriptions() {
        if (!browser) return;
        const settings = get(settingsStore);
        if (settings.apiProvider !== "bitunix") return;

        // Bitunix WebSocket Sync
        // 1. Collect all intended subscriptions
        const currentSubs = new Set<string>(); // "SYMBOL:channel"
        this.requests.forEach((channels, symbol) => {
            channels.forEach(ch => {
                currentSubs.add(`${symbol}:${ch}`);
            });
        });

        // Note: bitunixWs currently handles deduplication internally, 
        // but MarketWatcher provides a cleaner high-level registry.

        this.requests.forEach((channels, symbol) => {
            channels.forEach(ch => {
                if (ch === "price") {
                    bitunixWs.subscribe(symbol, "price");
                } else if (ch.startsWith("kline_")) {
                    const timeframe = ch.replace("kline_", "");
                    const bitunixInterval = this.mapTimeframeToBitunix(timeframe);
                    bitunixWs.subscribe(symbol, `market_kline_${bitunixInterval}`);
                }
            });
        });
    }

    private mapTimeframeToBitunix(tf: string): string {
        const map: Record<string, string> = {
            "1m": "1min",
            "5m": "5min",
            "15m": "15min",
            "30m": "30min",
            "1h": "60min",
            "4h": "4h",
            "1d": "1day",
            "1w": "1week",
            "1M": "1month",
        };
        return map[tf] || tf;
    }

    private startPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);

        this.pollingInterval = setInterval(() => {
            const settings = get(settingsStore);
            const wsStatus = get(wsStatusStore);

            // Polling as Fallback or for Binance
            if (settings.apiProvider === "binance" || wsStatus !== "connected") {
                this.requests.forEach((channels, symbol) => {
                    if (channels.has("price")) {
                        // Fetch price via REST
                        apiService.fetchBitunixPrice(symbol, "normal").catch(() => { });
                    }
                    // Note: ATR and Technicals are currently handled directly in their components
                    // but could be moved here for better consolidation.
                });
            }
        }, this.DEFAULT_POLLING_MS);
    }

    public getActiveSymbols(): string[] {
        return Array.from(this.requests.keys());
    }
}

export const marketWatcher = new MarketWatcher();
