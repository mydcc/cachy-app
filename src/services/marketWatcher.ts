/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { untrack } from "svelte";
import { bitunixWs } from "./bitunixWs";
import { apiService } from "./apiService";
import { settingsState } from "../stores/settings.svelte";
import { marketState } from "../stores/market.svelte";
import { normalizeSymbol } from "../utils/symbolUtils";
import { browser } from "$app/environment";
import { tradeState } from "../stores/trade.svelte";

interface MarketWatchRequest {
  symbol: string;
  channels: Set<string>; // "price", "ticker", "kline_1m", "kline_1h", etc.
}

class MarketWatcher {
  private requests = new Map<string, Map<string, number>>(); // symbol -> { channel -> count }
  private pollingInterval: any = null;
  private currentIntervalSeconds: number = 10;
  private fetchLocks = new Set<string>(); // "symbol:channel"

  constructor() {
    if (browser) {
      // Watch settings for provider or interval changes
      settingsState.subscribe((settings: any) => {
        const newInterval = settings.marketDataInterval || 10;

        // If interval changed, restart polling
        if (newInterval !== this.currentIntervalSeconds) {
          this.currentIntervalSeconds = newInterval;
          this.startPolling();
        }

        this.syncSubscriptions();
      });

      this.startPolling();
    }
  }

  /**
   * Register interest in a specific data channel for a symbol.
   * @param symbol Raw symbol
   * @param channel Channel name (e.g., "price", "kline_1h")
   */
  register(symbol: string, channel: string) {
    if (!symbol) return;
    const normSymbol = normalizeSymbol(symbol, "bitunix");

    if (!this.requests.has(normSymbol)) {
      this.requests.set(normSymbol, new Map());
    }

    const channels = this.requests.get(normSymbol)!;
    const count = channels.get(channel) || 0;
    channels.set(channel, count + 1);

    // Only sync if this is the first requester for this channel
    if (count === 0) {
      this.syncSubscriptions();

      // Also trigger an immediate REST fetch to avoid "no data" message
      // Use the current provider and high priority for price/ticker
      untrack(() => {
        const provider = settingsState.apiProvider;
        this.pollSymbolChannel(normSymbol, channel, provider);
      });
    }
  }

  /**
   * Unregister interest.
   */
  unregister(symbol: string, channel: string) {
    if (!symbol) return;
    const normSymbol = normalizeSymbol(symbol, "bitunix");
    const channels = this.requests.get(normSymbol);

    if (channels && channels.has(channel)) {
      const count = channels.get(channel)!;
      if (count <= 1) {
        channels.delete(channel);
        if (channels.size === 0) {
          this.requests.delete(normSymbol);
        }
        this.syncSubscriptions();
      } else {
        channels.set(channel, count - 1);
      }
    }
  }

  private syncSubscriptions() {
    if (!browser) return;
    const settings = settingsState;
    // Only Bitunix has a WebSocket implementation currently.
    // If future providers get WS support, add them here.
    if (settings.apiProvider !== "bitunix") {
      // If we switched away from Bitunix, clear all WS subscriptions
      Array.from(bitunixWs.publicSubscriptions).forEach((key) => {
        const [channel, symbol] = key.split(":");
        bitunixWs.unsubscribe(symbol, channel);
      });
      return;
    }

    // 1. Collect all intended subscriptions from requests
    // map of key (channel:symbol) -> { symbol, channel }
    const intended = new Map<string, { symbol: string; channel: string }>();
    this.requests.forEach((channels, symbol) => {
      channels.forEach((_, ch) => {
        let bitunixChannel = ch;
        if (ch === "price") {
          bitunixChannel = "price";
        } else if (ch === "ticker") {
          bitunixChannel = "ticker";
        } else if (ch === "depth_book5") {
          bitunixChannel = "depth_book5";
        } else if (ch.startsWith("kline_")) {
          const timeframe = ch.replace("kline_", "");
          const bitunixInterval = this.mapTimeframeToBitunix(timeframe);
          bitunixChannel = `market_kline_${bitunixInterval}`;
        }
        const key = `${bitunixChannel}:${symbol}`;
        intended.set(key, { symbol, channel: bitunixChannel });
      });
    });

    // 2. Diff and Sync
    // Subscribe to additions
    intended.forEach((sub, key) => {
      if (!bitunixWs.publicSubscriptions.has(key)) {
        bitunixWs.subscribe(sub.symbol, sub.channel);
      }
    });

    // Unsubscribe from removals
    bitunixWs.publicSubscriptions.forEach((key) => {
      if (!intended.has(key)) {
        const [channel, symbol] = key.split(":");
        bitunixWs.unsubscribe(symbol, channel);
      }
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

    // Initial delay to avoid startup congestion
    setTimeout(() => {
      this.pollingInterval = setInterval(() => {
        const paused = this.isPollingPaused();
        if (import.meta.env.DEV) {
          // console.log(`[MarketWatcher] Polling Cycle. Paused: ${paused}, WS Status: ${marketState.connectionStatus}`);
        }
        if (paused) return;
        this.performPollingCycle();
      }, 1000); // Check every second for what needs polling
    }, 2000);
  }

  private isPollingPaused() {
    if (!browser) return true;
    const settings = settingsState;
    if (!settings.capabilities.marketData) return true;
    const wsStatus = marketState.connectionStatus;
    const provider = settings.apiProvider;
    // We only pause polling if SOME WebSocket is successfully connected.
    // This prevents double-load (WS + REST) for any provider.
    return wsStatus === "connected";
  }

  private async performPollingCycle() {
    const settings = settingsState;
    const provider = settings.apiProvider;
    const interval = this.currentIntervalSeconds;

    this.requests.forEach((channels, symbol) => {
      channels.forEach((_, channel) => {
        const lockKey = `${symbol}:${channel}`;
        if (this.fetchLocks.has(lockKey)) return;

        // Check if we need to poll this specific channel for this symbol
        // (Simple time-based check could be added, for now we just poll)
        this.pollSymbolChannel(symbol, channel, provider);
      });
    });
  }

  private async pollSymbolChannel(
    symbol: string,
    channel: string,
    provider: "bitunix" | "bitget",
  ) {
    if (!settingsState.capabilities.marketData) return;
    const lockKey = `${symbol}:${channel}`;
    this.fetchLocks.add(lockKey);

    // Determine priority: high for the main trading symbol, normal for the rest
    const isMainSymbol =
      tradeState.symbol &&
      normalizeSymbol(tradeState.symbol, "bitunix") === symbol;
    const priority = isMainSymbol ? "high" : "normal";

    try {
      if (channel === "price" || channel === "ticker") {
        const data = await apiService.fetchTicker24h(
          symbol,
          provider,
          priority,
        );
        marketState.updateSymbol(symbol, {
          lastPrice: data.lastPrice,
          highPrice: data.highPrice,
          lowPrice: data.lowPrice,
          volume: data.volume,
          priceChangePercent: data.priceChangePercent,
          quoteVolume: data.quoteVolume,
        });
      } else if (channel.startsWith("kline_")) {
        const tf = channel.replace("kline_", "");
        const klines = await (provider === "bitget"
          ? apiService.fetchBitgetKlines(symbol, tf, 50)
          : apiService.fetchBitunixKlines(symbol, tf, 50));

        if (klines && klines.length > 0) {
          marketState.updateSymbolKlines(symbol, tf, klines);
        }
      }
      // Depth not yet polled for Binance (requires specific API we logic)
    } catch (e) {
      // Silently fail in polling
    } finally {
      // Re-allow polling after interval
      setTimeout(() => {
        this.fetchLocks.delete(lockKey);
      }, this.currentIntervalSeconds * 1000);
    }
  }

  public getActiveSymbols(): string[] {
    return Array.from(this.requests.keys());
  }
}

export const marketWatcher = new MarketWatcher();
