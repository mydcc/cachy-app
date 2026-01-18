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
import { settingsStore } from "../stores/settingsStore";
import { CONSTANTS } from "../lib/constants";
import { normalizeSymbol } from "../utils/symbolUtils";
import { WSStateMachine, WsState, WsEvent } from "./wsStateMachine";
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

const PING_INTERVAL = 20000; // 20 seconds (standard interval)
const WATCHDOG_TIMEOUT = 60000; // 60 seconds
const RECONNECT_DELAY = 3000; // 3 seconds
const MAX_RETRIES = 5;

interface Subscription {
  symbol: string;
  channel: string;
}

class BitunixWebSocketService {
  private wsPublic: WebSocket | null = null;
  private wsPrivate: WebSocket | null = null;

  // State Machines
  private fsmPublic = new WSStateMachine();
  private fsmPrivate = new WSStateMachine();

  private pingTimerPublic: any = null;
  private pingTimerPrivate: any = null;

  private watchdogTimerPublic: any = null;
  private watchdogTimerPrivate: any = null;

  private lastActivityPublic = 0;
  private lastActivityPrivate = 0;

  public publicSubscriptions: Set<string> = new Set();

  private reconnectTimerPublic: any = null;
  private reconnectTimerPrivate: any = null;

  private publicRetryCount = 0;
  private privateRetryCount = 0;

  private awaitingPongPublic = false;
  private awaitingPongPrivate = false;

  private connectionTimeoutPublic: any = null;
  private connectionTimeoutPrivate: any = null;
  private readonly CONNECTION_TIMEOUT_MS = 10000; // 10 seconds

  private isDestroyed = false;

  private handleOnline = () => {
    if (this.isDestroyed) return;
    this.connect();
  };

  private handleOffline = () => {
    wsStatusStore.set("disconnected");
    this.fsmPublic.transition(WsEvent.STOP);
    this.fsmPrivate.transition(WsEvent.STOP);
    this.cleanup("public");
    this.cleanup("private");
  };

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }

    // Sync Public FSM state to UI Store
    this.fsmPublic.stateStore.subscribe((state) => {
      switch (state) {
        case WsState.CONNECTED:
        case WsState.AUTHENTICATED:
          wsStatusStore.set("connected");
          break;
        case WsState.CONNECTING:
        case WsState.AUTHENTICATING:
          wsStatusStore.set("connecting");
          break;
        case WsState.RECONNECTING:
          wsStatusStore.set("reconnecting");
          this.scheduleReconnect("public");
          break;
        case WsState.DISCONNECTED:
        case WsState.ERROR:
          wsStatusStore.set("disconnected");
          break;
      }
    });

    // Handle Private FSM Reconnection logic via callback or subscription
    this.fsmPrivate.stateStore.subscribe((state) => {
      if (state === WsState.RECONNECTING) {
        this.scheduleReconnect("private");
      }
    });
  }

  destroy() {
    this.isDestroyed = true;
    wsStatusStore.set("disconnected");
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }
    this.fsmPublic.transition(WsEvent.STOP);
    this.fsmPrivate.transition(WsEvent.STOP);
    this.cleanup("public");
    this.cleanup("private");
  }

  connect() {
    this.connectPublic();
    this.connectPrivate();
  }

  private connectPublic() {
    if (this.isDestroyed) return;

    // Check if we can start connecting
    const currentState = this.fsmPublic.currentState;
    if (currentState === WsState.CONNECTED || currentState === WsState.CONNECTING) return;

    this.fsmPublic.transition(WsEvent.START);

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_PUBLIC_URL);
      this.wsPublic = ws;

      if (this.connectionTimeoutPublic) clearTimeout(this.connectionTimeoutPublic);
      this.connectionTimeoutPublic = setTimeout(() => {
        if (this.isDestroyed) return;
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn("Bitunix Public WS Timeout");
          if (this.wsPublic === ws) {
            this.cleanup("public");
            this.fsmPublic.transition(WsEvent.ERROR); // Trigger Reconnect
          } else {
            ws.close();
          }
        }
      }, this.CONNECTION_TIMEOUT_MS);

    } catch (e) {
      console.error("Failed to create Public WS:", e);
      this.fsmPublic.transition(WsEvent.ERROR);
      return;
    }

    ws.onopen = () => {
      if (this.connectionTimeoutPublic) clearTimeout(this.connectionTimeoutPublic);
      if (this.wsPublic !== ws) return;

      this.fsmPublic.transition(WsEvent.OPEN);
      this.publicRetryCount = 0;

      this.startHeartbeat(ws, "public");
      this.startWatchdog("public", ws);
      this.resubscribePublic();
    };

    ws.onmessage = (event) => {
      if (this.wsPublic !== ws) return;
      try {
        this.lastActivityPublic = Date.now();
        const message = JSON.parse(event.data);
        this.handleMessage(message, "public");
      } catch (e) {
        console.error("Error parsing Public WS message:", e);
      }
    };

    ws.onclose = () => {
      if (this.isDestroyed) return;
      if (this.wsPublic === ws) {
        this.cleanup("public");
        this.fsmPublic.transition(WsEvent.CLOSE);
      }
    };

    ws.onerror = (error) => {
      console.error("Bitunix Public WebSocket error:", error);
      // Let onclose handle the state transition mostly, but error can trigger it too
    };
  }

  private connectPrivate() {
    if (this.isDestroyed) return;

    const settings = get(settingsStore);
    const apiKey = settings.apiKeys?.bitunix?.key;
    const apiSecret = settings.apiKeys?.bitunix?.secret;

    if (!apiKey || !apiSecret) return;

    const currentState = this.fsmPrivate.currentState;
    if (currentState === WsState.CONNECTED || currentState === WsState.AUTHENTICATED || currentState === WsState.AUTHENTICATING || currentState === WsState.CONNECTING) return;

    this.fsmPrivate.transition(WsEvent.START);

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_PRIVATE_URL);
      this.wsPrivate = ws;

      if (this.connectionTimeoutPrivate) clearTimeout(this.connectionTimeoutPrivate);
      this.connectionTimeoutPrivate = setTimeout(() => {
        if (this.isDestroyed) return;
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn("Bitunix Private WS Timeout");
          if (this.wsPrivate === ws) {
            this.cleanup("private");
            this.fsmPrivate.transition(WsEvent.ERROR);
          } else {
            ws.close();
          }
        }
      }, this.CONNECTION_TIMEOUT_MS);
    } catch (e) {
      console.error("Failed to create Private WS:", e);
      this.fsmPrivate.transition(WsEvent.ERROR);
      return;
    }

    ws.onopen = () => {
      if (this.connectionTimeoutPrivate) clearTimeout(this.connectionTimeoutPrivate);
      if (this.wsPrivate !== ws) return;

      this.fsmPrivate.transition(WsEvent.OPEN);
      this.privateRetryCount = 0;
      this.startHeartbeat(ws, "private");
      this.startWatchdog("private", ws);

      this.fsmPrivate.transition(WsEvent.LOGIN_REQ);
      this.login(apiKey, apiSecret);
    };

    ws.onmessage = (event) => {
      if (this.wsPrivate !== ws) return;
      try {
        this.lastActivityPrivate = Date.now();
        const message = JSON.parse(event.data);
        this.handleMessage(message, "private");
      } catch (e) {
        console.error("Error parsing Private WS message:", e);
      }
    };

    ws.onclose = () => {
      if (this.isDestroyed) return;
      if (this.wsPrivate === ws) {
        this.cleanup("private");
        this.fsmPrivate.transition(WsEvent.CLOSE);
      }
    };

    ws.onerror = (error) => {
      console.error("Bitunix Private WebSocket error:", error);
    };
  }

  private scheduleReconnect(type: "public" | "private") {
    if (this.isDestroyed) return;

    if (type === "public") {
      // Logic handled by FSM subscription mostly, creates loop if we call it blindly.
      // We checks if timer already running.
      if (this.reconnectTimerPublic) return;

      const delay = Math.min(
        RECONNECT_DELAY * Math.pow(1.5, this.publicRetryCount),
        30000
      );
      this.publicRetryCount++;

      console.log(`Scheduling Public Reconnect in ${delay}ms... (Attempt ${this.publicRetryCount})`);
      this.reconnectTimerPublic = setTimeout(() => {
        this.reconnectTimerPublic = null;
        this.fsmPublic.transition(WsEvent.RETRY); // Transition state back to CONNECTING
        this.connectPublic();
      }, delay);

    } else {
      if (this.reconnectTimerPrivate) return;

      const delay = Math.min(
        RECONNECT_DELAY * Math.pow(1.5, this.privateRetryCount),
        30000
      );
      this.privateRetryCount++;

      console.log(`Scheduling Private Reconnect in ${delay}ms... (Attempt ${this.privateRetryCount})`);
      this.reconnectTimerPrivate = setTimeout(() => {
        this.reconnectTimerPrivate = null;
        this.fsmPrivate.transition(WsEvent.RETRY);
        this.connectPrivate();
      }, delay);
    }
  }

  private startHeartbeat(ws: WebSocket, type: "public" | "private") {
    // Clear existing ping timer if any (though usually handled by cleanup)
    if (type === "public") {
      if (this.pingTimerPublic) clearInterval(this.pingTimerPublic);
      this.awaitingPongPublic = false;
    } else {
      if (this.pingTimerPrivate) clearInterval(this.pingTimerPrivate);
      this.awaitingPongPrivate = false;
    }

    const timer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Check if previous ping was answered
        if (type === "public" && this.awaitingPongPublic) {
          console.warn("Bitunix Public WS: Pong timeout. Reconnecting...");
          ws.close(); // Force reconnect
          return;
        }
        if (type === "private" && this.awaitingPongPrivate) {
          console.warn("Bitunix Private WS: Pong timeout. Reconnecting...");
          ws.close();
          return;
        }

        if (type === "public") this.awaitingPongPublic = true;
        else this.awaitingPongPrivate = true;

        const pingPayload = {
          op: "ping",
          ping: Math.floor(Date.now() / 1000),
        };
        ws.send(JSON.stringify(pingPayload));
      }
    }, PING_INTERVAL);

    if (type === "public") this.pingTimerPublic = timer;
    else this.pingTimerPrivate = timer;
  }

  private startWatchdog(type: "public" | "private", ws: WebSocket) {
    // Clear existing watchdog timer
    if (type === "public") {
      if (this.watchdogTimerPublic) clearInterval(this.watchdogTimerPublic);
      this.lastActivityPublic = Date.now();
    } else {
      if (this.watchdogTimerPrivate) clearInterval(this.watchdogTimerPrivate);
      this.lastActivityPrivate = Date.now();
    }

    const intervalId = setInterval(() => {
      // Ensure we are operating on the current socket
      if (type === "public") {
        if (ws !== this.wsPublic) {
          clearInterval(intervalId);
          return;
        }
        if (Date.now() - this.lastActivityPublic > WATCHDOG_TIMEOUT) {
          console.warn("Bitunix Public WS Watchdog Timeout. Terminating.");
          if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
            this.wsPublic.close();
          }
        }
      } else {
        if (ws !== this.wsPrivate) {
          clearInterval(intervalId);
          return;
        }
        if (Date.now() - this.lastActivityPrivate > WATCHDOG_TIMEOUT) {
          console.warn("Bitunix Private WS Watchdog Timeout. Terminating.");
          if (this.wsPrivate && this.wsPrivate.readyState === WebSocket.OPEN) {
            this.wsPrivate.close();
          }
        }
      }
    }, 5000); // Check every 5 seconds

    if (type === "public") this.watchdogTimerPublic = intervalId;
    else this.watchdogTimerPrivate = intervalId;
  }

  private stopHeartbeat(type: "public" | "private") {
    if (type === "public") {
      if (this.pingTimerPublic) {
        clearInterval(this.pingTimerPublic);
        this.pingTimerPublic = null;
      }
      if (this.watchdogTimerPublic) {
        clearInterval(this.watchdogTimerPublic);
        this.watchdogTimerPublic = null;
      }
    } else {
      if (this.pingTimerPrivate) {
        clearInterval(this.pingTimerPrivate);
        this.pingTimerPrivate = null;
      }
      if (this.watchdogTimerPrivate) {
        clearInterval(this.watchdogTimerPrivate);
        this.watchdogTimerPrivate = null;
      }
    }
  }

  private cleanup(type: "public" | "private") {
    this.stopHeartbeat(type);
    if (type === "public") {
      if (this.connectionTimeoutPublic) {
        clearTimeout(this.connectionTimeoutPublic);
        this.connectionTimeoutPublic = null;
      }
      if (this.reconnectTimerPublic) {
        clearTimeout(this.reconnectTimerPublic);
        this.reconnectTimerPublic = null;
      }
      if (this.wsPublic) {
        this.wsPublic.onopen = null;
        this.wsPublic.onmessage = null;
        this.wsPublic.onerror = null;
        this.wsPublic.onclose = null;
        if (
          this.wsPublic.readyState === WebSocket.OPEN ||
          this.wsPublic.readyState === WebSocket.CONNECTING
        ) {
          this.wsPublic.close();
        }
      }
      this.wsPublic = null;
    } else {
      if (this.connectionTimeoutPrivate) {
        clearTimeout(this.connectionTimeoutPrivate);
        this.connectionTimeoutPrivate = null;
      }
      if (this.reconnectTimerPrivate) {
        clearTimeout(this.reconnectTimerPrivate);
        this.reconnectTimerPrivate = null;
      }
      if (this.wsPrivate) {
        this.wsPrivate.onopen = null;
        this.wsPrivate.onmessage = null;
        this.wsPrivate.onerror = null;
        this.wsPrivate.onclose = null;
        if (
          this.wsPrivate.readyState === WebSocket.OPEN ||
          this.wsPrivate.readyState === WebSocket.CONNECTING
        ) {
          this.wsPrivate.close();
        }
      }
      this.wsPrivate = null;
    }
  }

  private login(apiKey: string, apiSecret: string) {
    try {
      if (!this.wsPrivate || this.wsPrivate.readyState !== WebSocket.OPEN)
        return;

      if (!CryptoJS || !CryptoJS.SHA256) {
        console.error("CryptoJS is not available for Bitunix login signature.");
        return;
      }

      // Generate secure nonce using crypto.getRandomValues if available
      let nonce: string;
      if (
        typeof window !== "undefined" &&
        window.crypto &&
        window.crypto.getRandomValues
      ) {
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        nonce = Array.from(array, (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      } else {
        // Fallback for non-browser environments or very old browsers (unlikely given Svelte 4)
        nonce =
          Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15);
      }

      const timestamp = Math.floor(Date.now() / 1000);

      const first = CryptoJS.SHA256(nonce + timestamp + apiKey).toString(
        CryptoJS.enc.Hex,
      );
      const sign = CryptoJS.SHA256(first + apiSecret).toString(
        CryptoJS.enc.Hex,
      );

      const payload = {
        op: "login",
        args: [
          {
            apiKey,
            timestamp,
            nonce,
            sign,
          },
        ],
      };

      this.wsPrivate.send(JSON.stringify(payload));
    } catch (error) {
      console.error("Error during Bitunix login construction/sending:", error);
    }
  }

  // Helper: Validate price-related data to prevent crashes from malformed WS messages
  private validatePriceData(data: Partial<BitunixPriceData>): boolean {
    if (!data) return false;
    // Price fields should be numeric strings or numbers > 0
    // 'mp' = market price, 'ip' = index price, 'fr' = funding rate, 'nft' = next funding time
    const fields = ["mp", "ip", "fr", "nft"] as const;
    for (const field of fields) {
      // It's okay if some are missing (partial update), but if present, must be valid
      if (data[field] !== undefined && data[field] !== null) {
        const val = parseFloat(String(data[field]));
        if (isNaN(val)) return false;
      }
    }
    return true;
  }

  private validateTickerData(data: Partial<BitunixTickerData>): boolean {
    if (!data) return false;
    // At least lastPrice and open should be valid
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
      // Watchdog reset is handled in onmessage handler to catch ALL events

      // Treat ANY message as proof of life, negating the need for a specific Pong if data is flowing
      if (type === "public") this.awaitingPongPublic = false;
      else this.awaitingPongPrivate = false;

      if (message && message.event === "login") {
        if (
          message.code === 0 ||
          message.code === "0" ||
          message.msg === "success"
        ) {
          this.fsmPrivate.transition(WsEvent.LOGIN_OK);
          this.subscribePrivate();
        } else {
          console.error("Bitunix Login Failed:", message);
        }
        return;
      }

      if (!message) return;

      // Check for Pong BEFORE checking for Ping, because Bitunix sends op:'ping' in the Pong response!
      if (message.op === "pong" || message.pong) {
        // Already handled by general activity check above, but explicit is fine
        return;
      }

      if (message.op === "ping") return;

      // Handle Data Push
      // Public Channels
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
        } else if (symbol && data) {
          console.warn("[BitunixWS] Invalid price data received:", {
            symbol,
            data,
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
        } else if (symbol && data) {
          console.warn("[BitunixWS] Invalid ticker data received:", {
            symbol,
            data,
          });
        }
      } else if (message.ch === "depth_book5") {
        const rawSymbol = message.symbol;
        if (!rawSymbol) return;
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = message.data;
        if (symbol && data) {
          marketStore.updateDepth(symbol, {
            bids: data.b,
            asks: data.a,
          });
        }
      } else if (
        message.ch &&
        (message.ch.startsWith("market_kline_") ||
          message.ch === "mark_kline_1day")
      ) {
        // Handle both generic kline channels and the specific mark_kline_1day
        const rawSymbol = message.symbol;
        if (!rawSymbol) return;

        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = message.data;
        if (symbol && data) {
          // Extract timeframe from channel name: e.g. "market_kline_60min" -> "1h"
          let timeframe = "1h"; // fallback
          if (message.ch === "mark_kline_1day") {
            timeframe = "1d";
          } else {
            const match = message.ch.match(/market_kline_(.+)/);
            if (match) {
              const bitunixTf = match[1];
              // Map back from Bitunix format to internal format
              const revMap: Record<string, string> = {
                "1min": "1m",
                "5min": "5m",
                "15min": "15m",
                "30min": "30m",
                "60min": "1h",
                "4h": "4h",
                "1day": "1d",
                "1week": "1w",
                "1month": "1M",
              };
              timeframe = revMap[bitunixTf] || bitunixTf;
            }
          }

          marketStore.updateKline(symbol, timeframe, {
            o: data.o,
            h: data.h,
            l: data.l,
            c: data.c,
            b: data.b || data.v,
            t: data.t || data.id || data.ts || Date.now(),
          });
        }
      }

      // Private Channels
      else if (message.ch === "position") {
        const data = message.data;
        if (data) {
          // Robustness Fix: Use Batch Updates to prevent UI freeze on snapshots
          if (Array.isArray(data)) {
            accountStore.updatePositionsBatch(data);
          } else {
            accountStore.updatePositionsBatch([data]);
          }
        }
      } else if (message.ch === "order") {
        const data = message.data;
        if (data) {
          if (Array.isArray(data)) {
            accountStore.updateOrdersBatch(data);
          } else {
            accountStore.updateOrdersBatch([data]);
          }
        }
      } else if (message.ch === "wallet") {
        const data = message.data;
        if (data) {
          if (Array.isArray(data)) {
            accountStore.updateBalanceBatch(data);
          } else {
            accountStore.updateBalanceBatch([data]);
          }
        }
      }
    } catch (err) {
      console.error(
        `Error handling ${type} message:`,
        err,
        "Message:",
        message,
      );
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
    if (this.fsmPrivate.currentState !== WsState.AUTHENTICATED || !this.wsPrivate) return;

    const channels = ["position", "order", "wallet"];
    const args = channels.map((ch) => ({ ch }));

    const payload = {
      op: "subscribe",
      args: args,
    };
    this.wsPrivate.send(JSON.stringify(payload));
  }

  private sendSubscribe(ws: WebSocket, symbol: string, channel: string) {
    const payload = {
      op: "subscribe",
      args: [{ symbol, ch: channel }],
    };
    ws.send(JSON.stringify(payload));
  }

  private sendUnsubscribe(ws: WebSocket, symbol: string, channel: string) {
    const payload = {
      op: "unsubscribe",
      args: [{ symbol, ch: channel }],
    };
    ws.send(JSON.stringify(payload));
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
