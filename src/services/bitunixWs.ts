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

import { marketState, type MarketData } from "../stores/market.svelte";
import { accountState } from "../stores/account.svelte";
import { settingsState } from "../stores/settings.svelte";
import { CONSTANTS } from "../lib/constants";
import { normalizeSymbol } from "../utils/symbolUtils";
import { Decimal } from "decimal.js";
import CryptoJS from "crypto-js";
import type {
  BitunixWSMessage,
  BitunixPriceData,
  BitunixTickerData,
} from "../types/bitunix";
import {
  BitunixWSMessageSchema,
  BitunixPriceDataSchema,
  BitunixTickerDataSchema,
  isAllowedChannel,
  validateSymbol,
} from "../types/bitunixValidation";

const WS_PUBLIC_URL =
  CONSTANTS.BITUNIX_WS_PUBLIC_URL || "wss://fapi.bitunix.com/public/";
const WS_PRIVATE_URL =
  CONSTANTS.BITUNIX_WS_PRIVATE_URL || "wss://fapi.bitunix.com/private/";

const PING_INTERVAL = 1500;
const WATCHDOG_TIMEOUT = 3000;
const RECONNECT_DELAY = 500;
const CONNECTION_TIMEOUT_MS = 3000;

interface Subscription {
  symbol: string;
  channel: string;
}

class BitunixWebSocketService {
  private wsPublic: WebSocket | null = null;
  private wsPrivate: WebSocket | null = null;

  private pingTimerPublic: ReturnType<typeof setInterval> | null = null;
  private pingTimerPrivate: ReturnType<typeof setInterval> | null = null;

  private watchdogTimerPublic: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimerPrivate: ReturnType<typeof setTimeout> | null = null;

  private lastWatchdogResetPublic = 0;
  private lastWatchdogResetPrivate = 0;
  private readonly WATCHDOG_THROTTLE_MS = 100;

  public publicSubscriptions: Set<string> = new Set();

  private reconnectTimerPublic: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimerPrivate: ReturnType<typeof setTimeout> | null = null;

  private isReconnectingPublic = false;
  private isReconnectingPrivate = false;

  private globalMonitorInterval: ReturnType<typeof setInterval> | null = null;

  private awaitingPongPublic = false;
  private awaitingPongPrivate = false;

  private lastMessageTimePublic = Date.now();
  private lastMessageTimePrivate = Date.now();

  private connectionTimeoutPublic: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeoutPrivate: ReturnType<typeof setTimeout> | null = null;

  private isAuthenticated = false;
  private isDestroyed = false;

  private handleOnline = () => {
    if (this.isDestroyed) return;
    this.cleanup("public");
    this.cleanup("private");
    marketState.connectionStatus = "connecting";
    this.connectPublic(true);
    this.connectPrivate();
  };

  private handleOffline = () => {
    marketState.connectionStatus = "disconnected";
    this.cleanup("public");
    this.cleanup("private");
  };

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);

      this.globalMonitorInterval = setInterval(() => {
        if (this.isDestroyed) return;

        const now = Date.now();
        const timeSincePublic = now - this.lastMessageTimePublic;
        const status = marketState.connectionStatus;

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          if (status !== "disconnected") marketState.connectionStatus = "disconnected";
          return;
        }

        // Only monitor if we are actually supposed to be using bitunix
        if (settingsState.apiProvider !== "bitunix") return;

        if (status === "connected" && timeSincePublic > 2000) {
          marketState.connectionStatus = "reconnecting";
        }

        if (status !== "disconnected" && timeSincePublic > 5000) {
          marketState.connectionStatus = "disconnected";
          this.cleanup("public");
        }

        if (status === "disconnected" && timeSincePublic > 7000) {
          this.handleOnline();
        }
      }, 1000);
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.globalMonitorInterval) {
      clearInterval(this.globalMonitorInterval);
      this.globalMonitorInterval = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }
    this.cleanup("public");
    this.cleanup("private");
  }

  connect() {
    this.connectPublic();
    this.connectPrivate();
  }

  private connectPublic(force = false) {
    if (this.isDestroyed) return;

    if (!force && typeof navigator !== "undefined" && !navigator.onLine) {
      marketState.connectionStatus = "disconnected";
      return;
    }

    if (this.wsPublic) {
      if (
        this.wsPublic.readyState === WebSocket.OPEN ||
        this.wsPublic.readyState === WebSocket.CONNECTING
      ) {
        // If it's connecting for too long, cleanup and force a new one
        const now = Date.now();
        if (this.wsPublic.readyState === WebSocket.CONNECTING && now - this.lastMessageTimePublic > 5000) {
          this.cleanup("public");
        } else {
          return;
        }
      }
      this.cleanup("public");
    }

    marketState.connectionStatus = "connecting";

    try {
      const ws = new WebSocket(WS_PUBLIC_URL);
      this.wsPublic = ws;

      if (this.connectionTimeoutPublic) clearTimeout(this.connectionTimeoutPublic);
      this.connectionTimeoutPublic = setTimeout(() => {
        if (this.isDestroyed) return;
        if (ws.readyState !== WebSocket.OPEN) {
          if (this.wsPublic === ws) {
            this.cleanup("public");
            this.scheduleReconnect("public");
          } else {
            ws.close();
          }
        }
      }, CONNECTION_TIMEOUT_MS);

      ws.onopen = () => {
        if (this.connectionTimeoutPublic) clearTimeout(this.connectionTimeoutPublic);
        if (this.wsPublic !== ws) return;

        marketState.connectionStatus = "connected";
        this.isReconnectingPublic = false;
        this.lastMessageTimePublic = Date.now();
        this.startHeartbeat(ws, "public");
        this.resetWatchdog("public", ws);
        this.resubscribePublic();
      };

      ws.onmessage = (event) => {
        if (this.wsPublic !== ws) return;
        const now = Date.now();
        this.lastMessageTimePublic = now;
        if (now - this.lastWatchdogResetPublic > this.WATCHDOG_THROTTLE_MS) {
          this.resetWatchdog("public", ws);
          this.lastWatchdogResetPublic = now;
        }

        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message, "public");
        } catch (e) {
        }
      };

      ws.onclose = () => {
        if (this.isDestroyed) return;
        if (this.wsPublic === ws) {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            marketState.connectionStatus = "disconnected";
          } else {
            marketState.connectionStatus = "reconnecting";
            this.scheduleReconnect("public");
          }
          this.cleanup("public");
        }
      };

      ws.onerror = (error) => {
      };
    } catch (e) {
      this.scheduleReconnect("public");
    }
  }

  private connectPrivate() {
    if (this.isDestroyed) return;

    const settings = settingsState;
    const apiKey = settings.apiKeys?.bitunix?.key;
    const apiSecret = settings.apiKeys?.bitunix?.secret;

    if (!apiKey || !apiSecret) return;

    if (this.wsPrivate) {
      if (
        this.wsPrivate.readyState === WebSocket.OPEN ||
        this.wsPrivate.readyState === WebSocket.CONNECTING
      ) {
        return;
      }
      this.cleanup("private");
    }

    try {
      const ws = new WebSocket(WS_PRIVATE_URL);
      this.wsPrivate = ws;

      if (this.connectionTimeoutPrivate) clearTimeout(this.connectionTimeoutPrivate);
      this.connectionTimeoutPrivate = setTimeout(() => {
        if (this.isDestroyed) return;
        if (ws.readyState !== WebSocket.OPEN) {
          if (this.wsPrivate === ws) {
            this.cleanup("private");
            this.scheduleReconnect("private");
          } else {
            ws.close();
          }
        }
      }, CONNECTION_TIMEOUT_MS);

      ws.onopen = () => {
        if (this.connectionTimeoutPrivate) clearTimeout(this.connectionTimeoutPrivate);
        if (this.wsPrivate !== ws) return;

        this.isReconnectingPrivate = false;
        this.lastMessageTimePrivate = Date.now();
        this.startHeartbeat(ws, "private");
        this.resetWatchdog("private", ws);
        this.login(apiKey, apiSecret);
      };

      ws.onmessage = (event) => {
        if (this.wsPrivate !== ws) return;
        const now = Date.now();
        this.lastMessageTimePrivate = now;
        if (now - this.lastWatchdogResetPrivate > this.WATCHDOG_THROTTLE_MS) {
          this.resetWatchdog("private", ws);
          this.lastWatchdogResetPrivate = now;
        }

        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message, "private");
        } catch (e) {
        }
      };

      ws.onclose = () => {
        if (this.isDestroyed) return;
        if (this.wsPrivate === ws) {
          this.isAuthenticated = false;
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            marketState.connectionStatus = "disconnected";
          } else {
            this.scheduleReconnect("private");
          }
          this.cleanup("private");
        }
      };

      ws.onerror = (error) => {
      };
    } catch (e) {
      this.scheduleReconnect("private");
    }
  }

  private scheduleReconnect(type: "public" | "private") {
    if (this.isDestroyed) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      marketState.connectionStatus = "disconnected";
      return;
    }

    if (type === "public") {
      if (this.isReconnectingPublic) return;
      this.isReconnectingPublic = true;
      marketState.connectionStatus = "reconnecting";
      if (this.reconnectTimerPublic) clearTimeout(this.reconnectTimerPublic);
      this.reconnectTimerPublic = setTimeout(() => {
        this.isReconnectingPublic = false;
        if (!this.isDestroyed) this.connectPublic();
      }, RECONNECT_DELAY);
    } else {
      if (this.isReconnectingPrivate) return;
      this.isReconnectingPrivate = true;
      if (this.reconnectTimerPrivate) clearTimeout(this.reconnectTimerPrivate);
      this.reconnectTimerPrivate = setTimeout(() => {
        this.isReconnectingPrivate = false;
        if (!this.isDestroyed) this.connectPrivate();
      }, RECONNECT_DELAY);
    }
  }

  private startHeartbeat(ws: WebSocket, type: "public" | "private") {
    if (type === "public") {
      if (this.pingTimerPublic) clearInterval(this.pingTimerPublic);
      this.awaitingPongPublic = false;
    } else {
      if (this.pingTimerPrivate) clearInterval(this.pingTimerPrivate);
      this.awaitingPongPrivate = false;
    }

    const timer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (type === "public" && this.awaitingPongPublic) {
          this.cleanup(type);
          this.scheduleReconnect(type);
          return;
        }
        if (type === "private" && this.awaitingPongPrivate) {
          this.cleanup("private");
          this.scheduleReconnect("private");
          return;
        }

        if (type === "public") this.awaitingPongPublic = true;
        else this.awaitingPongPrivate = true;

        const pingPayload = { op: "ping", ping: Math.floor(Date.now() / 1000) };
        try {
          ws.send(JSON.stringify(pingPayload));
        } catch (e) {
          // console.warn('[WebSocket] Ping send failed, connection may be closed:', e);
        }
      }
    }, PING_INTERVAL);

    if (type === "public") this.pingTimerPublic = timer;
    else this.pingTimerPrivate = timer;
  }

  private resetWatchdog(type: "public" | "private", ws: WebSocket) {
    if (type === "public") {
      if (this.watchdogTimerPublic) clearTimeout(this.watchdogTimerPublic);
      if (ws !== this.wsPublic) return;

      this.watchdogTimerPublic = setTimeout(() => {
        if (this.wsPublic === ws) {
          marketState.connectionStatus = "reconnecting";
          this.cleanup("public");
          this.scheduleReconnect("public");
        }
      }, WATCHDOG_TIMEOUT);
    } else {
      if (this.watchdogTimerPrivate) clearTimeout(this.watchdogTimerPrivate);
      if (ws !== this.wsPrivate) return;

      this.watchdogTimerPrivate = setTimeout(() => {
        if (this.wsPrivate === ws) {
          this.cleanup("private");
          this.scheduleReconnect("private");
        }
      }, WATCHDOG_TIMEOUT);
    }
  }

  private stopHeartbeat(type: "public" | "private") {
    if (type === "public") {
      if (this.pingTimerPublic) { clearInterval(this.pingTimerPublic); this.pingTimerPublic = null; }
      if (this.watchdogTimerPublic) { clearTimeout(this.watchdogTimerPublic); this.watchdogTimerPublic = null; }
    } else {
      if (this.pingTimerPrivate) { clearInterval(this.pingTimerPrivate); this.pingTimerPrivate = null; }
      if (this.watchdogTimerPrivate) { clearTimeout(this.watchdogTimerPrivate); this.watchdogTimerPrivate = null; }
    }
  }

  private cleanup(type: "public" | "private") {
    this.stopHeartbeat(type);
    if (type === "public") {
      if (this.connectionTimeoutPublic) { clearTimeout(this.connectionTimeoutPublic); this.connectionTimeoutPublic = null; }
      if (this.reconnectTimerPublic) { clearTimeout(this.reconnectTimerPublic); this.reconnectTimerPublic = null; }
      if (this.wsPublic) {
        this.wsPublic.onopen = null;
        this.wsPublic.onmessage = null;
        this.wsPublic.onerror = null;
        this.wsPublic.onclose = null;
        try {
          this.wsPublic.close();
        } catch (e) {
          // console.warn('[WebSocket] Error closing public connection:', e);
        }
      }
      this.wsPublic = null;
      this.isReconnectingPublic = false;
    } else {
      if (this.connectionTimeoutPrivate) { clearTimeout(this.connectionTimeoutPrivate); this.connectionTimeoutPrivate = null; }
      if (this.reconnectTimerPrivate) { clearTimeout(this.reconnectTimerPrivate); this.reconnectTimerPrivate = null; }
      if (this.wsPrivate) {
        this.wsPrivate.onopen = null;
        this.wsPrivate.onmessage = null;
        this.wsPrivate.onerror = null;
        this.wsPrivate.onclose = null;
        try {
          this.wsPrivate.close();
        } catch (e) {
          // console.warn('[WebSocket] Error closing private connection:', e);
        }
      }
      this.wsPrivate = null;
      this.isReconnectingPrivate = false;
      this.isAuthenticated = false;
    }
  }

  private login(apiKey: string, apiSecret: string) {
    try {
      if (!this.wsPrivate || this.wsPrivate.readyState !== WebSocket.OPEN) return;
      if (!CryptoJS || !CryptoJS.SHA256) return;

      let nonce: string;
      if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        nonce = Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
      } else {
        nonce = Math.random().toString(36).substring(2, 15);
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const first = CryptoJS.SHA256(nonce + timestamp + apiKey).toString(CryptoJS.enc.Hex);
      const sign = CryptoJS.SHA256(first + apiSecret).toString(CryptoJS.enc.Hex);

      const payload = { op: "login", args: [{ apiKey, timestamp, nonce, sign }] };
      this.wsPrivate.send(JSON.stringify(payload));
    } catch (error) {
    }
  }

  private validatePriceData(data: Partial<BitunixPriceData>): boolean {
    if (!data) return false;
    const fields = ["mp", "ip", "fr", "nft"] as const;
    for (const field of fields) {
      if (data[field] !== undefined && data[field] !== null) {
        if (isNaN(parseFloat(String(data[field])))) return false;
      }
    }
    return true;
  }

  private validateTickerData(data: Partial<BitunixTickerData>): boolean {
    if (!data) return false;
    // Allow partial updates (deltas). We just need at least one valid numeric field.
    const fields = ["la", "o", "h", "l", "b", "q", "r"] as const;
    let hasValidField = false;

    for (const field of fields) {
      if (data[field] !== undefined && data[field] !== null) {
        const val = parseFloat(String(data[field]));
        if (!isNaN(val)) {
          hasValidField = true;
        }
      }
    }
    return hasValidField;
  }

  private handleMessage(message: BitunixWSMessage, type: "public" | "private") {
    try {
      if (type === "public") this.awaitingPongPublic = false;
      else this.awaitingPongPrivate = false;

      // 1. Validate message structure with Zod
      const validationResult = BitunixWSMessageSchema.safeParse(message);
      if (!validationResult.success) {
        // console.warn('[WebSocket] Invalid message structure:', validationResult.error.issues);
        return;
      }

      const validatedMessage = validationResult.data;

      // 2. Handle special messages
      if (validatedMessage && validatedMessage.event === "login") {
        if (validatedMessage.code === 0 || validatedMessage.code === "0" || validatedMessage.msg === "success") {
          this.isAuthenticated = true;
          this.subscribePrivate();
        }
        return;
      }

      if (!validatedMessage) return;
      if (validatedMessage.op === "pong" || validatedMessage.pong || validatedMessage.op === "ping") return;

      // 3. Validate channel if present
      if (validatedMessage.ch && !isAllowedChannel(validatedMessage.ch)) {
        // console.warn('[WebSocket] Unknown channel:', validatedMessage.ch);
        return;
      }

      // 4. Handle price updates
      if (validatedMessage.ch === "price") {
        const rawSymbol = validatedMessage.symbol;

        // Validate symbol
        if (!validateSymbol(rawSymbol)) {
          // console.warn('[WebSocket] Invalid symbol in price update:', rawSymbol);
          return;
        }

        const symbol = normalizeSymbol(rawSymbol, "bitunix");

        // Validate price data with Zod
        const priceValidation = BitunixPriceDataSchema.safeParse(validatedMessage.data);
        if (!priceValidation.success) {
          // console.warn('[WebSocket] Invalid price data:', priceValidation.error.issues);
          return;
        }

        const data = priceValidation.data;

        // Build update object
        const update: Partial<MarketData> = {};
        if (data.mp !== undefined) update.lastPrice = new Decimal(data.mp);
        if (data.ip !== undefined) update.indexPrice = new Decimal(data.ip);
        if (data.fr !== undefined) update.fundingRate = new Decimal(data.fr);
        if (data.nft !== undefined) update.nextFundingTime = Number(data.nft);

        if (Object.keys(update).length > 0) {
          marketState.updateSymbol(symbol, update);
        }
      } else if (validatedMessage.ch === "ticker") {
        const rawSymbol = validatedMessage.symbol;

        if (!validateSymbol(rawSymbol)) {
          // console.warn('[WebSocket] Invalid symbol in ticker update:', rawSymbol);
          return;
        }

        const symbol = normalizeSymbol(rawSymbol, "bitunix");

        // Validate ticker data with Zod
        const tickerValidation = BitunixTickerDataSchema.safeParse(validatedMessage.data);
        if (!tickerValidation.success) {
          // console.warn('[WebSocket] Invalid ticker data:', tickerValidation.error.issues);
          return;
        }

        const data = tickerValidation.data;

        // Build update object
        const update: Partial<MarketData> = {};
        if (data.la !== undefined) update.lastPrice = new Decimal(data.la);
        if (data.h !== undefined) update.highPrice = new Decimal(data.h);
        if (data.l !== undefined) update.lowPrice = new Decimal(data.l);
        if (data.b !== undefined) update.volume = new Decimal(data.b);
        if (data.q !== undefined) update.quoteVolume = new Decimal(data.q);
        // Bitunix 'r' is price change percent (e.g. 0.05 for 5%)? Or raw change?
        // Usually documentation says rate. Let's assume rate.
        if (data.r !== undefined) update.priceChangePercent = new Decimal(data.r).times(100);

        if (Object.keys(update).length > 0) {
          marketState.updateSymbol(symbol, update);
        }
      } else if (validatedMessage.ch === "depth_book5") {
        const rawSymbol = validatedMessage.symbol;
        if (!rawSymbol) return;
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = validatedMessage.data;
        if (symbol && data) {
            marketState.updateSymbol(symbol, {
                depth: { bids: data.b, asks: data.a }
            });
        }
      } else if (validatedMessage.ch && (validatedMessage.ch.startsWith("market_kline_") || validatedMessage.ch === "mark_kline_1day")) {
        const rawSymbol = validatedMessage.symbol;
        if (!rawSymbol) return;
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = validatedMessage.data;
        if (symbol && data) {
          let timeframe = "1h";
          if (validatedMessage.ch === "mark_kline_1day") timeframe = "1d";
          else {
            const match = validatedMessage.ch.match(/market_kline_(.+)/);
            if (match) {
              const bitunixTf = match[1];
              const revMap: Record<string, string> = { "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m", "60min": "1h", "4h": "4h", "1day": "1d", "1week": "1w", "1month": "1M" };
              timeframe = revMap[bitunixTf] || bitunixTf;
            }
          }

          marketState.updateSymbolKlines(symbol, timeframe, [{
             open: new Decimal(data.o),
             high: new Decimal(data.h),
             low: new Decimal(data.l),
             close: new Decimal(data.c),
             volume: new Decimal(data.b || data.v || 0),
             time: data.t || data.id || data.ts || Date.now()
          }]);
        }
      } else if (validatedMessage.ch === "position") {
        const data = validatedMessage.data;
        if (data) {
          if (Array.isArray(data)) data.forEach((item: any) => accountState.updatePositionFromWs(item));
          else accountState.updatePositionFromWs(data);
        }
      } else if (validatedMessage.ch === "order") {
        const data = validatedMessage.data;
        if (data) {
          if (Array.isArray(data)) data.forEach((item: any) => accountState.updateOrderFromWs(item));
          else accountState.updateOrderFromWs(data);
        }
      } else if (validatedMessage.ch === "wallet") {
        const data = validatedMessage.data;
        if (data) {
          if (Array.isArray(data)) data.forEach((item: any) => accountState.updateBalanceFromWs(item));
          else accountState.updateBalanceFromWs(data);
        }
      }
    } catch (err) {
      // console.error('[WebSocket] Message handling error:', err);
      // console.error('[WebSocket] Problematic message:', JSON.stringify(message).slice(0, 200));
    }
  }

  subscribe(symbol: string, channel: string) {
    if (!symbol) return;
    const normalizedSymbol = normalizeSymbol(symbol, "bitunix");
    const subKey = `${channel}:${normalizedSymbol}`;
    if (this.publicSubscriptions.has(subKey)) return;
    this.publicSubscriptions.add(subKey);
    if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
      this.sendSubscribe(this.wsPublic, normalizedSymbol, channel);
    } else {
      this.connectPublic();
    }
  }

  unsubscribe(symbol: string, channel: string) {
    if (!symbol) return;
    const normalizedSymbol = normalizeSymbol(symbol, "bitunix");
    const subKey = `${channel}:${normalizedSymbol}`;
    if (this.publicSubscriptions.has(subKey)) {
      this.publicSubscriptions.delete(subKey);
      if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
        this.sendUnsubscribe(this.wsPublic, normalizedSymbol, channel);
      }
    }
  }

  private subscribePrivate() {
    if (!this.isAuthenticated || !this.wsPrivate) return;
    const channels = ["position", "order", "wallet"];
    const args = channels.map((ch) => ({ ch }));
    const payload = { op: "subscribe", args: args };
    try {
      this.wsPrivate.send(JSON.stringify(payload));
    } catch (e) {
      // console.warn('[WebSocket] Failed to send private subscribe:', e);
    }
  }

  private sendSubscribe(ws: WebSocket, symbol: string, channel: string) {
    const payload = { op: "subscribe", args: [{ symbol, ch: channel }] };
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {
      // console.warn(`[WebSocket] Failed to send subscribe for ${symbol}:${channel}:`, e);
    }
  }

  private sendUnsubscribe(ws: WebSocket, symbol: string, channel: string) {
    const payload = { op: "unsubscribe", args: [{ symbol, ch: channel }] };
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {
      // console.warn(`[WebSocket] Failed to send unsubscribe for ${symbol}:${channel}:`, e);
    }
  }

  private resubscribePublic() {
    this.publicSubscriptions.forEach((subKey) => {
      const [channel, symbol] = subKey.split(":");
      if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
        this.sendSubscribe(this.wsPublic, symbol, channel);
      }
    });
  }
}

export const bitunixWs = new BitunixWebSocketService();
