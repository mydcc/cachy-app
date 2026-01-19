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

import { get, writable } from "svelte/store";
import { bitunixWs } from "./bitunixWs";
import { apiService } from "./apiService";
import { settingsState } from "../stores/settings.svelte";
import { marketState } from "../stores/market.svelte";
import { normalizeSymbol } from "../utils/symbolUtils";
import { browser } from "$app/environment";

interface MarketWatchRequest {
  symbol: string;
  channels: Set<string>; // "price", "ticker", "kline_1m", "kline_1h", etc.
}

class MarketWatcher {
  private requests = new Map<string, Map<string, number>>(); // symbol -> { channel -> count }
  private pollingInterval: any = null;
  private currentIntervalSeconds: number = 10;

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
    if (settings.apiProvider !== "bitunix") return;

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

    this.pollingInterval = setInterval(() => {
      const settings = settingsState;
      const wsStatus = marketState.connectionStatus;

      // Polling as Fallback or for Binance
      if (settings.apiProvider === "binance" || wsStatus !== "connected") {
        this.requests.forEach((channels, symbol) => {
          if (channels.has("price")) {
            // Fetch price via REST using the correct provider
            if (settings.apiProvider === "binance") {
              apiService.fetchBinancePrice(symbol, "normal").catch(() => { });
            } else {
              apiService.fetchBitunixPrice(symbol, "normal").catch(() => { });
            }
          }
        });
      }
    }, this.currentIntervalSeconds * 1000);
  }

  public getActiveSymbols(): string[] {
    return Array.from(this.requests.keys());
  }
}

export const marketWatcher = new MarketWatcher();
