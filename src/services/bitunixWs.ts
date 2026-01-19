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

import { writable, get } from "svelte/store";
import { marketStore, wsStatusStore } from "../stores/marketStore";
import { accountStore } from "../stores/accountStore";
import { settingsState } from "../stores/settings.svelte";
import { CONSTANTS } from "../lib/constants";
import { normalizeSymbol } from "../utils/symbolUtils";
import CryptoJS from "crypto-js";
import type {
  BitunixWSMessage,
  BitunixPriceData,
  BitunixTickerData,
} from "../types/bitunix";

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

  private pingTimerPublic: any = null;
  private pingTimerPrivate: any = null;

  private watchdogTimerPublic: any = null;
  private watchdogTimerPrivate: any = null;

  private lastWatchdogResetPublic = 0;
  private lastWatchdogResetPrivate = 0;
  private readonly WATCHDOG_THROTTLE_MS = 100;

  public publicSubscriptions: Set<string> = new Set();

  private reconnectTimerPublic: any = null;
  private reconnectTimerPrivate: any = null;

  private isReconnectingPublic = false;
  private isReconnectingPrivate = false;

  private awaitingPongPublic = false;
  private awaitingPongPrivate = false;

  private lastMessageTimePublic = Date.now();
  private lastMessageTimePrivate = Date.now();

  private connectionTimeoutPublic: any = null;
  private connectionTimeoutPrivate: any = null;

  private isAuthenticated = false;
  private isDestroyed = false;

  private handleOnline = () => {
    if (this.isDestroyed) return;
    this.cleanup("public");
    this.cleanup("private");
    wsStatusStore.set("connecting");
    this.connectPublic(true);
    this.connectPrivate();
  };

  private handleOffline = () => {
    wsStatusStore.set("disconnected");
    this.cleanup("public");
    this.cleanup("private");
  };

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);

      setInterval(() => {
        if (this.isDestroyed) return;

        const now = Date.now();
        const timeSincePublic = now - this.lastMessageTimePublic;
        const status = get(wsStatusStore);

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          if (status !== "disconnected") wsStatusStore.set("disconnected");
          return;
        }

        if (status === "connected" && timeSincePublic > 2000) {
          wsStatusStore.set("reconnecting");
        }

        if (status !== "disconnected" && timeSincePublic > 5000) {
          wsStatusStore.set("disconnected");
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
      wsStatusStore.set("disconnected");
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

    wsStatusStore.set("connecting");

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

        wsStatusStore.set("connected");
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
          console.error("Error parsing Public WS message:", e);
        }
      };

      ws.onclose = () => {
        if (this.isDestroyed) return;
        if (this.wsPublic === ws) {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            wsStatusStore.set("disconnected");
          } else {
            wsStatusStore.set("reconnecting");
            this.scheduleReconnect("public");
          }
          this.cleanup("public");
        }
      };

      ws.onerror = (error) => {
        console.error("Bitunix Public WebSocket error:", error);
      };
    } catch (e) {
      console.error("Failed to create Public WS:", e);
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
          console.error("Error parsing Private WS message:", e);
        }
      };

      ws.onclose = () => {
        if (this.isDestroyed) return;
        if (this.wsPrivate === ws) {
          this.isAuthenticated = false;
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            wsStatusStore.set("disconnected");
          } else {
            this.scheduleReconnect("private");
          }
          this.cleanup("private");
        }
      };

      ws.onerror = (error) => {
        console.error("Bitunix Private WebSocket error:", error);
      };
    } catch (e) {
      console.error("Failed to create Private WS:", e);
      this.scheduleReconnect("private");
    }
  }

  private scheduleReconnect(type: "public" | "private") {
    if (this.isDestroyed) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      wsStatusStore.set("disconnected");
      return;
    }

    if (type === "public") {
      if (this.isReconnectingPublic) return;
      this.isReconnectingPublic = true;
      wsStatusStore.set("reconnecting");
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
        try { ws.send(JSON.stringify(pingPayload)); } catch (e) { }
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
          wsStatusStore.set("reconnecting");
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
        try { this.wsPublic.close(); } catch (e) { }
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
        try { this.wsPrivate.close(); } catch (e) { }
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
      console.error("Error during Bitunix login:", error);
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
    const critical = ["la", "o"] as const;
    for (const field of critical) {
      if (!data[field]) return false;
      const val = parseFloat(String(data[field]));
      if (isNaN(val) || val <= 0) return false;
    }
    return true;
  }

  private handleMessage(message: BitunixWSMessage, type: "public" | "private") {
    try {
      if (type === "public") this.awaitingPongPublic = false;
      else this.awaitingPongPrivate = false;

      if (message && message.event === "login") {
        if (message.code === 0 || message.code === "0" || message.msg === "success") {
          this.isAuthenticated = true;
          this.subscribePrivate();
        }
        return;
      }

      if (!message) return;
      if (message.op === "pong" || message.pong || message.op === "ping") return;

      if (message.ch === "price") {
        const rawSymbol = message.symbol;
        if (!rawSymbol) return;
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = message.data as Partial<BitunixPriceData>;
        if (symbol && data && this.validatePriceData(data)) {
          marketStore.updatePrice(symbol, {
            price: data.mp || "0",
            indexPrice: data.ip || "0",
            fundingRate: data.fr || "0",
            nextFundingTime: String(data.nft || 0),
          });
        }
      } else if (message.ch === "ticker") {
        const rawSymbol = message.symbol;
        if (!rawSymbol) return;
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = message.data as Partial<BitunixTickerData>;
        if (symbol && data && this.validateTickerData(data)) {
          marketStore.updateTicker(symbol, {
            lastPrice: data.la || "0",
            high: data.h || "0",
            low: data.l || "0",
            vol: data.b || "0",
            quoteVol: data.q || "0",
            change: data.r || "0",
            open: data.o || "0",
          });
        }
      } else if (message.ch === "depth_book5") {
        const rawSymbol = message.symbol;
        if (!rawSymbol) return;
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = message.data;
        if (symbol && data) marketStore.updateDepth(symbol, { bids: data.b, asks: data.a });
      } else if (message.ch && (message.ch.startsWith("market_kline_") || message.ch === "mark_kline_1day")) {
        const rawSymbol = message.symbol;
        if (!rawSymbol) return;
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = message.data;
        if (symbol && data) {
          let timeframe = "1h";
          if (message.ch === "mark_kline_1day") timeframe = "1d";
          else {
            const match = message.ch.match(/market_kline_(.+)/);
            if (match) {
              const bitunixTf = match[1];
              const revMap: Record<string, string> = { "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m", "60min": "1h", "4h": "4h", "1day": "1d", "1week": "1w", "1month": "1M" };
              timeframe = revMap[bitunixTf] || bitunixTf;
            }
          }
          marketStore.updateKline(symbol, timeframe, { o: data.o, h: data.h, l: data.l, c: data.c, b: data.b || data.v, t: data.t || data.id || data.ts || Date.now() });
        }
      } else if (message.ch === "position") {
        const data = message.data;
        if (data) {
          if (Array.isArray(data)) data.forEach((item: any) => accountStore.updatePositionFromWs(item));
          else accountStore.updatePositionFromWs(data);
        }
      } else if (message.ch === "order") {
        const data = message.data;
        if (data) {
          if (Array.isArray(data)) data.forEach((item: any) => accountStore.updateOrderFromWs(item));
          else accountStore.updateOrderFromWs(data);
        }
      } else if (message.ch === "wallet") {
        const data = message.data;
        if (data) {
          if (Array.isArray(data)) data.forEach((item: any) => accountStore.updateBalanceFromWs(item));
          else accountStore.updateBalanceFromWs(data);
        }
      }
    } catch (err) {
      console.error(`Error handling ${type} message:`, err);
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
    try { this.wsPrivate.send(JSON.stringify(payload)); } catch (e) { }
  }

  private sendSubscribe(ws: WebSocket, symbol: string, channel: string) {
    const payload = { op: "subscribe", args: [{ symbol, ch: channel }] };
    try { ws.send(JSON.stringify(payload)); } catch (e) { }
  }

  private sendUnsubscribe(ws: WebSocket, symbol: string, channel: string) {
    const payload = { op: "unsubscribe", args: [{ symbol, ch: channel }] };
    try { ws.send(JSON.stringify(payload)); } catch (e) { }
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
