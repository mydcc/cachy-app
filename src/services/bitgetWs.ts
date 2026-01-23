/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { marketState } from "../stores/market.svelte";
import { accountState } from "../stores/account.svelte";
import { settingsState } from "../stores/settings.svelte";
import { normalizeSymbol } from "../utils/symbolUtils";
import CryptoJS from "crypto-js";
import type {
  BitgetWSMessage,
} from "../types/bitget";
import {
  BitgetWSMessageSchema,
  BitgetWSTickerSchema,
  isAllowedBitgetChannel,
  validateBitgetSymbol,
} from "../types/bitgetValidation";
import { Decimal } from "decimal.js";

const WS_URL = "wss://ws.bitget.com/mix/v1/stream";

const PING_INTERVAL = 25000; // Bitget requires ping every 30s
const WATCHDOG_TIMEOUT = 35000;
const RECONNECT_DELAY = 1000;
const CONNECTION_TIMEOUT_MS = 5000;

class BitgetWebSocketService {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  public subscriptions: Set<string> = new Set(); // Stores "channel:symbol"

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isReconnecting = false;

  private globalMonitorInterval: ReturnType<typeof setInterval> | null = null;

  private lastMessageTime = Date.now();
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;

  private isAuthenticated = false;
  private isDestroyed = false;

  // Throttling
  private throttleMap = new Map<string, number>();
  private readonly UPDATE_INTERVAL = 200;

  private handleOnline = () => {
    if (this.isDestroyed) return;
    this.cleanup();
    marketState.connectionStatus = "connecting";
    this.connect(true);
  };

  private handleOffline = () => {
    marketState.connectionStatus = "disconnected";
    this.cleanup();
  };

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);

      this.globalMonitorInterval = setInterval(() => {
        if (this.isDestroyed) return;

        const now = Date.now();
        const timeSince = now - this.lastMessageTime;
        const status = marketState.connectionStatus;

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          if (status !== "disconnected")
            marketState.connectionStatus = "disconnected";
          return;
        }

        if (
          settingsState.apiProvider !== "bitget" ||
          !settingsState.capabilities.marketData
        ) {
          if (status !== "disconnected") {
            marketState.connectionStatus = "disconnected";
            this.cleanup();
          }
          return;
        }

        if (status === "connected" && timeSince > 10000) {
          // No message for 10s? Suspicious.
          // marketState.connectionStatus = "reconnecting";
          // Bitget is quiet if no updates, but we ping.
        }

        // Monitor for stale connection, but ONLY if connected.
        // If connecting, the connectionTimeout handles it.
        if (status === "connected" && timeSince > 40000) {
          marketState.connectionStatus = "disconnected";
          this.cleanup();
          this.connect();
        }
      }, 1000);
    }
  }

  private shouldThrottle(key: string): boolean {
    const now = Date.now();
    const last = this.throttleMap.get(key) || 0;
    if (now - last < this.UPDATE_INTERVAL) {
      return true;
    }
    this.throttleMap.set(key, now);
    return false;
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
    this.cleanup();
  }

  connect(force = false) {
    if (this.isDestroyed || !settingsState.capabilities.marketData) return;
    if (settingsState.apiProvider !== "bitget") return;

    if (!force && typeof navigator !== "undefined" && !navigator.onLine) {
      marketState.connectionStatus = "disconnected";
      return;
    }

    if (this.ws) {
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        return;
      }
      this.cleanup();
    }

    marketState.connectionStatus = "connecting";

    try {
      const ws = new WebSocket(WS_URL);
      this.ws = ws;

      if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
      this.connectionTimeout = setTimeout(() => {
        if (this.isDestroyed) return;
        if (ws.readyState !== WebSocket.OPEN) {
          if (this.ws === ws) {
            this.cleanup();
            this.scheduleReconnect();
          } else {
            ws.close();
          }
        }
      }, CONNECTION_TIMEOUT_MS);

      ws.onopen = () => {
        if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
        if (this.ws !== ws) return;

        if (settingsState.enableNetworkLogs && import.meta.env.DEV) {
          console.log("%c[WS-Bitget] Connected", "color: #0fa; font-weight: bold;");
        }
        marketState.connectionStatus = "connected";
        this.isReconnecting = false;
        this.lastMessageTime = Date.now();

        this.startHeartbeat(ws);
        this.resetWatchdog(ws);

        // Attempt login if keys available
        const settings = settingsState;
        if (
          settings.apiKeys?.bitget?.key &&
          settings.apiKeys?.bitget?.secret &&
          settings.apiKeys?.bitget?.passphrase
        ) {
          this.login(
            settings.apiKeys.bitget.key,
            settings.apiKeys.bitget.secret,
            settings.apiKeys.bitget.passphrase
          );
        }

        this.resubscribe();
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        this.lastMessageTime = Date.now();
        this.resetWatchdog(ws);

        if (event.data === "pong") return;

        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          // ignore
        }
      };

      ws.onclose = () => {
        if (this.isDestroyed) return;
        if (this.ws === ws) {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            marketState.connectionStatus = "disconnected";
          } else {
            marketState.connectionStatus = "reconnecting";
            this.scheduleReconnect();
          }
          this.cleanup();
        }
      };

      ws.onerror = (error) => { };

    } catch (e) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed || this.isReconnecting) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      marketState.connectionStatus = "disconnected";
      return;
    }

    this.isReconnecting = true;
    marketState.connectionStatus = "reconnecting";
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.isReconnecting = false;
      if (!this.isDestroyed) this.connect();
    }, RECONNECT_DELAY);
  }

  private startHeartbeat(ws: WebSocket) {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send("ping");
        } catch (e) { }
      }
    }, PING_INTERVAL);
  }

  private resetWatchdog(ws: WebSocket) {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      if (this.ws === ws) {
        marketState.connectionStatus = "reconnecting";
        this.cleanup();
        this.scheduleReconnect();
      }
    }, WATCHDOG_TIMEOUT);
  }

  private cleanup() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch (e) { }
    }
    this.ws = null;
    this.isReconnecting = false;
    this.isAuthenticated = false;
  }

  private login(apiKey: string, apiSecret: string, passphrase: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!CryptoJS || !CryptoJS.SHA256) return;

    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      // Bitget V1 WS Login Sign: base64(hmac(timestamp + 'GET' + '/user/verify', secret))
      const signInput = timestamp + "GET" + "/user/verify";
      const sign = CryptoJS.HmacSHA256(signInput, apiSecret).toString(CryptoJS.enc.Base64);

      const payload = {
        op: "login",
        args: [{
          apiKey,
          passphrase,
          timestamp,
          sign
        }]
      };

      this.ws.send(JSON.stringify(payload));
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[WS-Bitget] Login error:", e);
    }
  }

  private handleMessage(message: BitgetWSMessage) {
    const validated = BitgetWSMessageSchema.safeParse(message);
    if (!validated.success) return;

    const msg = validated.data;

    if (msg.action === "login") { // Assuming action is login for response? Or separate event?
      // Bitget sends event: "login", code: 00000 on success.
      // My schema uses 'action'. Bitget usually sends { event: "login", code: ... }
      // I might need to adjust schema for event messages vs data messages.
    }
    // Check event response
    if ((msg as any).event === "login" && (msg as any).code === "00000") {
      this.isAuthenticated = true;
      if (import.meta.env.DEV) console.log("%c[WS-Bitget] Login success", "color: #0fa;");
      this.subscribePrivate();
      return;
    }

    if (!msg.arg || !msg.data) return;

    const channel = msg.arg.channel;
    const instId = msg.arg.instId; // e.g. BTCUSDT_UMCBL

    // Normalize symbol back to app format (usually same or strip suffix for lookup)
    // But normalizedSymbol in store uses suffix for bitget.
    // Wait, normalizeSymbol(BTCUSDT, bitget) -> BTCUSDT_UMCBL.
    // So instId IS the symbol key we use in marketState.

    // Ticker
    if (channel === "ticker") {
      const data = msg.data[0];
      const tickerVal = BitgetWSTickerSchema.safeParse(data);
      if (tickerVal.success) {
        const t = tickerVal.data;
        // Update market
        const update: any = {};
        if (t.last) update.lastPrice = t.last;
        if (t.high24h) update.highPrice = t.high24h;
        if (t.low24h) update.lowPrice = t.low24h;
        if (t.volume24h || t.baseVolume) update.volume = t.volume24h || t.baseVolume;
        if (t.quoteVolume || t.usdtVolume) update.quoteVolume = t.quoteVolume || t.usdtVolume;
        if (t.open24h) update.open = t.open24h;

        // Calc change if possible
        if (t.last && t.open24h) {
          const l = new Decimal(t.last);
          const o = new Decimal(t.open24h);
          if (!o.isZero()) {
            update.priceChangePercent = l.minus(o).div(o).times(100);
          }
        }

        if (!this.shouldThrottle(`${instId}:ticker`)) {
          marketState.updateTicker(instId, update);
        }
        // Also update price (for fast price)
        if (t.last && !this.shouldThrottle(`${instId}:price`)) {
          marketState.updatePrice(instId, { price: t.last });
        }
      }
    }
    // Kline
    else if (channel.startsWith("candle")) {
      // data is [[ts, o, h, l, c, v, q], ...]
      if (Array.isArray(msg.data)) {
        const klines = msg.data.map((k: any) => {
          // k is [ts, o, h, l, c, v]
          return {
            time: parseInt(k[0]),
            open: new Decimal(k[1]),
            high: new Decimal(k[2]),
            low: new Decimal(k[3]),
            close: new Decimal(k[4]),
            volume: new Decimal(k[5])
          };
        });

        // Map channel to timeframe
        // channel: candle1m, candle1H
        const tfRaw = channel.replace("candle", "");
        const map: Record<string, string> = {
          "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
          "1H": "1h", "4H": "4h", "1D": "1d", "1W": "1w"
        };
        const tf = map[tfRaw] || tfRaw;

        marketState.updateSymbolKlines(instId, tf, klines);
      }
    }
    // Depth
    else if (channel === "books" || channel === "books5" || channel === "books15") {
      const data = msg.data[0];
      if (data && data.bids && data.asks) {
        if (!this.shouldThrottle(`${instId}:depth`)) {
          marketState.updateDepth(instId, { bids: data.bids, asks: data.asks });
        }
      }
    }
    // Private: Orders
    else if (channel === "orders") {
      // Handle order updates
      if (Array.isArray(msg.data)) {
        msg.data.forEach((o: any) => {
          // Map to internal format
          accountState.updateOrderFromWs({
            orderId: o.orderId,
            symbol: o.instId,
            status: o.status,
            filled: o.accFillSize, // executed qty
            price: o.price,
            avgPrice: o.priceAvg,
            // etc
          });
        });
      }
    }
    // Private: Positions
    else if (channel === "positions") {
      if (Array.isArray(msg.data)) {
        msg.data.forEach((p: any) => {
          accountState.updatePositionFromWs({
            symbol: p.instId,
            size: p.total, // or available? total usually
            entryPrice: p.openPriceAvg,
            marginType: p.marginMode,
            leverage: p.leverage,
            unrealizedPnl: p.unrealizedPL
          });
        });
      }
    }
  }

  subscribe(symbol: string, channel: string) {
    if (!symbol) return;
    const normalizedSymbol = normalizeSymbol(symbol, "bitget");
    const subKey = `${channel}:${normalizedSymbol}`;
    if (this.subscriptions.has(subKey)) return;
    this.subscriptions.add(subKey);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscribe(this.ws, normalizedSymbol, channel);
    } else {
      this.connect();
    }
  }

  unsubscribe(symbol: string, channel: string) {
    if (!symbol) return;
    const normalizedSymbol = normalizeSymbol(symbol, "bitget");
    const subKey = `${channel}:${normalizedSymbol}`;
    if (this.subscriptions.has(subKey)) {
      this.subscriptions.delete(subKey);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendUnsubscribe(this.ws, normalizedSymbol, channel);
      }
    }
  }

  private sendSubscribe(ws: WebSocket, symbol: string, channel: string) {
    // Args: instType: 'mc' (Futures Mix), channel, instId
    const payload = {
      op: "subscribe",
      args: [{
        instType: "mc",
        channel: channel,
        instId: symbol
      }]
    };
    try { ws.send(JSON.stringify(payload)); } catch (e) { }
  }

  private sendUnsubscribe(ws: WebSocket, symbol: string, channel: string) {
    const payload = {
      op: "unsubscribe",
      args: [{
        instType: "mc",
        channel: channel,
        instId: symbol
      }]
    };
    try { ws.send(JSON.stringify(payload)); } catch (e) { }
  }

  private resubscribe() {
    this.subscriptions.forEach(key => {
      const [channel, symbol] = key.split(":");
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendSubscribe(this.ws, symbol, channel);
      }
    });
  }

  private subscribePrivate() {
    if (!this.isAuthenticated || !this.ws) return;
    // Subscribe to all private channels usually for 'default' symbol?
    // Bitget private channels (positions, orders) usually require 'instType' but 'instId' can be 'default' for all symbols?
    // Docs: instId: 'default' for all symbols in product type.

    const channels = ["orders", "positions", "account"];
    const args = channels.map(ch => ({
      instType: "mc",
      channel: ch,
      instId: "default"
    }));

    const payload = { op: "subscribe", args };
    try { this.ws.send(JSON.stringify(payload)); } catch (e) { }
  }
}

export const bitgetWs = new BitgetWebSocketService();
