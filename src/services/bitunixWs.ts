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

import { marketState } from "../stores/market.svelte";
import { accountState } from "../stores/account.svelte";
import { settingsState } from "../stores/settings.svelte";
import { CONSTANTS } from "../lib/constants";
import { normalizeSymbol } from "../utils/symbolUtils";
import { connectionManager } from "./connectionManager";
import { mdaService } from "./mdaService";
import { omsService } from "./omsService";
import { logger } from "./logger";
import CryptoJS from "crypto-js";
import { Decimal } from "decimal.js";
import type { OMSPosition, OMSOrder, OMSOrderStatus } from "./omsTypes";
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

const PING_INTERVAL = 5000;
const WATCHDOG_TIMEOUT = 20000;
const RECONNECT_DELAY = 500;
const CONNECTION_TIMEOUT_MS = 3000;

interface Subscription {
  symbol: string;
  channel: string;
}

function mapToOMSPosition(data: any): OMSPosition {
  const isClose = data.event === "CLOSE";
  const amount = isClose ? new Decimal(0) : new Decimal(data.qty || 0);

  return {
    symbol: data.symbol,
    side: (data.side || "").toLowerCase() as "long" | "short",
    amount: amount,
    entryPrice: new Decimal(data.averagePrice || data.avgOpenPrice || 0),
    unrealizedPnl: new Decimal(data.unrealizedPNL || 0),
    leverage: Number(data.leverage || 0),
    marginMode: (data.marginMode || "cross").toLowerCase() as "cross" | "isolated",
    liquidationPrice: data.liquidationPrice
      ? new Decimal(data.liquidationPrice)
      : undefined,
  };
}

function mapToOMSOrder(data: any): OMSOrder {
  const statusMap: Record<string, OMSOrderStatus> = {
    NEW: "pending",
    PARTIALLY_FILLED: "pending",
    FILLED: "filled",
    CANCELED: "cancelled",
    CANCELLED: "cancelled",
    REJECTED: "rejected",
    EXPIRED: "expired",
  };

  const status = statusMap[data.orderStatus] || "pending";

  return {
    id: String(data.orderId),
    symbol: data.symbol,
    side: (data.side || "").toLowerCase() as "buy" | "sell",
    type: (data.type || "").toLowerCase() as "limit" | "market",
    status: status,
    price: new Decimal(data.price || 0),
    amount: new Decimal(data.qty || data.amount || 0),
    filledAmount: new Decimal(data.dealAmount || 0),
    timestamp: Number(data.ctime || Date.now()),
  };
}

class BitunixWebSocketService {
  public static activeInstance: BitunixWebSocketService | null = null;
  private static instanceCount = 0;
  private instanceId = 0;
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

  private errorCountPublic = 0;
  private lastErrorTimePublic = 0;
  private errorCountPrivate = 0;
  private lastErrorTimePrivate = 0;
  private readonly ERROR_THRESHOLD = 5;
  private readonly ERROR_WINDOW_MS = 10000;

  private awaitingPongPublic = false;
  private missedPongsPublic = 0;
  private awaitingPongPrivate = false;
  private missedPongsPrivate = 0;

  private lastMessageTimePublic = Date.now();
  private lastMessageTimePrivate = Date.now();

  private lastPingTimePublic = 0;
  private lastPingTimePrivate = 0;

  private connectionTimeoutPublic: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeoutPrivate: ReturnType<typeof setTimeout> | null = null;

  private isAuthenticated = false;
  private isDestroyed = false;

  // Circuit Breaker for Validation Errors
  private validationErrorCount = 0;
  private lastValidationErrorTime = 0;
  private readonly MAX_VALIDATION_ERRORS = 5;
  private readonly VALIDATION_ERROR_WINDOW = 10000;

  private readonly MAX_PUBLIC_SUBSCRIPTIONS = 50;

  // Throttling for UI Blocking Updates
  private throttleMap = new Map<string, number>();
  private readonly UPDATE_INTERVAL = 200; // 200ms throttle (5fps)
  private readonly THROTTLE_TTL = 5000;

  private pruneThrottleMap() {
    const now = Date.now();
    for (const [key, timestamp] of this.throttleMap) {
      if (now - timestamp > this.THROTTLE_TTL) {
        this.throttleMap.delete(key);
      }
    }
  }

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
    marketState.updateTelemetry({ activeConnections: 0 });

    // Notify Manager
    connectionManager.onProviderDisconnected("bitunix");

    this.cleanup("public");
    this.cleanup("private");
  };

  constructor() {
    // Singleton Enforcement: Kill any previous instance (zombie)
    if (
      BitunixWebSocketService.activeInstance &&
      BitunixWebSocketService.activeInstance !== this
    ) {
      logger.warn(
        "governance",
        `[BitunixWS] Zombie instance detected! Destroying #${BitunixWebSocketService.activeInstance.instanceId}`,
      );
      BitunixWebSocketService.activeInstance.destroy();
    }
    BitunixWebSocketService.activeInstance = this;

    this.instanceId = ++BitunixWebSocketService.instanceCount;
    logger.log("governance", `[BitunixWS] Instance #${this.instanceId} Created`);
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);

      this.globalMonitorInterval = setInterval(() => {
        if (this.isDestroyed) return;

        const now = Date.now();
        const timeSincePublic = now - this.lastMessageTimePublic;
        const status = marketState.connectionStatus;

        if (now % 10000 < 1000) {
          // [MONITOR] Reduced internal noise.
          // console.log(`[Bitunix Monitor] Status: ${status}, LastMsg: ${now - this.lastMessageTimePublic}ms ago, ActiveProvider: ${settingsState.apiProvider}`);
        }

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          if (status !== "disconnected")
            marketState.connectionStatus = "disconnected";
          return;
        }

        // Maintenance
        this.pruneThrottleMap();

        // Governance: If Bitunix is NOT the active provider, we must NOT touch the global status
        if (settingsState.apiProvider !== "bitunix") {
          this.cleanup("public");
          this.cleanup("private");
          return;
        }

        if (!settingsState.capabilities.marketData) {
          if (status !== "disconnected") {
            marketState.connectionStatus = "disconnected";
            this.cleanup("public");
            this.cleanup("private");
          }
          return;
        }

        if (status === "connected" && timeSincePublic > 5000) {
          marketState.connectionStatus = "reconnecting";
        }

        // Monitor for stale connection, but ONLY if connected.
        // If connecting, the connectionTimeout handles it.
        if (status === "connected" && timeSincePublic > 20000) {
          marketState.connectionStatus = "disconnected";
          this.cleanup("public");
        }

        // We no longer trigger autonomous reconnections here.
        // The ConnectionManager or handleOffline/handleOnline handle lifecycle.
      }, 5000);
    }
  }

  private shouldThrottle(key: string): boolean {
    const now = Date.now();
    // Safety: Prevent map from growing indefinitely if user cycles symbols
    if (this.throttleMap.size > 1000) {
      this.throttleMap.clear();
    }
    const last = this.throttleMap.get(key) || 0;
    if (now - last < this.UPDATE_INTERVAL) {
      return true;
    }
    this.throttleMap.set(key, now);
    return false;
  }

  destroy() {
    logger.log("governance", `[BitunixWS] #${this.instanceId} destroy() called.`);
    this.isDestroyed = true;

    if (BitunixWebSocketService.activeInstance === this) {
      BitunixWebSocketService.activeInstance = null;
    }

    // 1. Clear Global Monitor
    if (this.globalMonitorInterval) {
      clearInterval(this.globalMonitorInterval);
      this.globalMonitorInterval = null;
    }

    // 2. Remove Listeners
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }

    // 3. Strict Cleanup
    this.cleanup("public");
    this.cleanup("private");

    // 4. Force clear any lingering timers manually (Redundancy check)
    if (this.reconnectTimerPublic) { clearTimeout(this.reconnectTimerPublic); this.reconnectTimerPublic = null; }
    if (this.reconnectTimerPrivate) { clearTimeout(this.reconnectTimerPrivate); this.reconnectTimerPrivate = null; }
  }

  connect(force?: boolean) {
    logger.log("governance", `[BitunixWS] #${this.instanceId} connect(force=${force}) - isDestroyed was ${this.isDestroyed}`);
    this.isDestroyed = false;
    this.connectPublic(force);
    this.connectPrivate(force);
  }

  private connectPublic(force = false) {
    if (this.isDestroyed || !settingsState.capabilities.marketData) return;

    if (!force && typeof navigator !== "undefined" && !navigator.onLine) {
      marketState.connectionStatus = "disconnected";
      return;
    }

    // 1. Precise guard against overlapping connection attempts
    if (this.wsPublic) {
      const state = this.wsPublic.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        if (!force) return;
        this.cleanup("public"); // Force close if requested
      }
    }

    // ONLY LOG IF WE ACTUALLY PROCEED
    logger.log("governance", `[BitunixWS] #${this.instanceId} connectPublic(force=${force}) - START CONNECTING`);

    marketState.connectionStatus = "connecting";

    try {
      const ws = new WebSocket(WS_PUBLIC_URL);
      this.wsPublic = ws; // Immediate assignment to prevent race

      if (this.connectionTimeoutPublic)
        clearTimeout(this.connectionTimeoutPublic);
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
        logger.log("governance", `[BitunixWS] Socket event: ONOPEN. Instance: ${this.wsPublic === ws ? 'PRIMARY' : 'STALE'}`);
        if (this.connectionTimeoutPublic)
          clearTimeout(this.connectionTimeoutPublic);

        // Guard: Stale Socket Check
        // If 'this.wsPublic' has changed since we started connecting (e.g. by a forced reconnect),
        // this 'ws' instance is now stale and should be discarded to prevent ghost connections.
        if (this.wsPublic !== ws) {
          logger.warn("general", "[BitunixWS] ONOPEN triggered for stale socket. Closing.");
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
          return;
        }

        if (settingsState.enableNetworkLogs) {
          logger.log("network", "Public connection opened");
        }
        marketState.connectionStatus = "connected";
        marketState.updateTelemetry({ activeConnections: (marketState.telemetry.activeConnections || 0) + 1 });

        // Notify Manager
        connectionManager.onProviderConnected("bitunix");

        this.isReconnectingPublic = false;
        this.lastMessageTimePublic = Date.now();
        this.startHeartbeat(ws, "public");
        this.resetWatchdog("public", ws);
        this.resubscribePublic();
      };

      ws.onmessage = (event) => {
        if (this.wsPublic !== ws) return;
        // logger.log("general", "[BitunixWS] Message received!");
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
          this.handleInternalError("public", e);
        }
      };

      ws.onclose = () => {
        if (this.isDestroyed) return;
        if (this.wsPublic === ws) {
          marketState.updateTelemetry({ activeConnections: Math.max(0, (marketState.telemetry.activeConnections || 0) - 1) });
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            marketState.connectionStatus = "disconnected";
          } else {
            marketState.connectionStatus = "reconnecting";
            this.scheduleReconnect("public");
          }
          this.cleanup("public");
        }
      };

      ws.onerror = (error) => { };
    } catch (e) {
      this.scheduleReconnect("public");
    }
  }

  private connectPrivate(force = false) {
    if (this.isDestroyed) return;

    const settings = settingsState;
    const apiKey = settings.apiKeys?.bitunix?.key;
    const apiSecret = settings.apiKeys?.bitunix?.secret;

    if (!apiKey || !apiSecret || !settingsState.capabilities.marketData) return;

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

      if (this.connectionTimeoutPrivate)
        clearTimeout(this.connectionTimeoutPrivate);
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
        if (this.connectionTimeoutPrivate)
          clearTimeout(this.connectionTimeoutPrivate);

        // Guard: Stale Socket Check
        if (this.wsPrivate !== ws) {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
          return;
        }

        if (settingsState.enableNetworkLogs) {
          logger.log("network", "Private connection opened");
        }
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
          this.handleInternalError("private", e);
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

      ws.onerror = (error) => { };
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
      this.missedPongsPublic = 0;
    } else {
      if (this.pingTimerPrivate) clearInterval(this.pingTimerPrivate);
      this.awaitingPongPrivate = false;
      this.missedPongsPrivate = 0;
    }

    const timer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (type === "public") {
          if (this.awaitingPongPublic) {
            this.missedPongsPublic++;
            if (this.missedPongsPublic >= 3) {
              logger.warn("network", "[WebSocket] Public: Missed too many pongs, reconnecting.");
              this.cleanup(type);
              this.scheduleReconnect(type);
              return;
            }
          }
          this.awaitingPongPublic = true;
        } else {
          if (this.awaitingPongPrivate) {
            this.missedPongsPrivate++;
            if (this.missedPongsPrivate >= 3) {
              logger.warn("network", "[WebSocket] Private: Missed too many pongs, reconnecting.");
              this.cleanup("private");
              this.scheduleReconnect("private");
              return;
            }
          }
          this.awaitingPongPrivate = true;
        }

        const now = Date.now();
        if (type === "public") this.lastPingTimePublic = now;
        else this.lastPingTimePrivate = now;

        const pingPayload = { op: "ping", ping: Math.floor(now / 1000) };
        try {
          ws.send(JSON.stringify(pingPayload));
        } catch (e) {
          logger.warn(
            "network",
            "[WebSocket] Ping send failed, connection may be closed",
            e,
          );
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
      if (this.pingTimerPublic) {
        clearInterval(this.pingTimerPublic);
        this.pingTimerPublic = null;
      }
      if (this.watchdogTimerPublic) {
        clearTimeout(this.watchdogTimerPublic);
        this.watchdogTimerPublic = null;
      }
    } else {
      if (this.pingTimerPrivate) {
        clearInterval(this.pingTimerPrivate);
        this.pingTimerPrivate = null;
      }
      if (this.watchdogTimerPrivate) {
        clearTimeout(this.watchdogTimerPrivate);
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
        try {
          this.wsPublic.close();
        } catch (e) {
          logger.warn("network", "[WebSocket] Error closing public connection", e);
        }
      }
      this.wsPublic = null;
      this.isReconnectingPublic = false;
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
        try {
          this.wsPrivate.close();
        } catch (e) {
          logger.warn("network", "[WebSocket] Error closing private connection", e);
        }
      }
      this.wsPrivate = null;
      this.isReconnectingPrivate = false;
      this.isAuthenticated = false;
    }
  }

  private login(apiKey: string, apiSecret: string) {
    try {
      if (!this.wsPrivate || this.wsPrivate.readyState !== WebSocket.OPEN)
        return;
      if (!CryptoJS || !CryptoJS.SHA256) return;

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
        nonce = Math.random().toString(36).substring(2, 15);
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
        args: [{ apiKey, timestamp, nonce, sign }],
      };
      this.wsPrivate.send(JSON.stringify(payload));
    } catch (error) { }
  }

  private handleMessage(message: BitunixWSMessage, type: "public" | "private") {
    try {
      if (type === "public") {
        this.awaitingPongPublic = false;
        this.missedPongsPublic = 0;
      } else {
        this.awaitingPongPrivate = false;
        this.missedPongsPrivate = 0;
      }

      // --- FAST PATH OPTIMIZATION ---
      // Check high-frequency messages (price, ticker, depth) BEFORE expensive Zod validation
      // Wrapped in try-catch to prevent crashing the entire socket handler
      try {
        if (message && message.ch) {
          const rawSymbol = message.symbol || "";
          const symbol = normalizeSymbol(rawSymbol, "bitunix");
          const data = message.data;

          // Common guard for object data (price, ticker, kline) - Ensure strict object type
          const isObjectData = data && typeof data === "object" && !Array.isArray(data);

          if (message.ch === "price") {
            if (symbol && isObjectData) {
              const d = data as any;
              // Safe access with existence checks
              if (d && (d.lastPrice || d.lp || d.la || d.fr)) {
                const normalized = mdaService.normalizeTicker(message, "bitunix");
                if (!this.shouldThrottle(`${symbol}:price`)) {
                  marketState.updateSymbol(symbol, {
                    lastPrice: normalized.lastPrice,
                    fundingRate: d.fr,
                    nextFundingTime: d.nft ? String(d.nft) : undefined
                  });
                }
              } else if (import.meta.env.DEV && d) {
                console.warn("[BitunixWS] FastPath failed for price. Keys:", Object.keys(d));
              }
            }
            return;
          }

          if (message.ch === "ticker") {
            if (symbol && isObjectData) {
              const d = data as any;
              if (d && (d.volume || d.v || d.lastPrice || d.close)) {
                const normalized = mdaService.normalizeTicker(message, "bitunix");
                if (!this.shouldThrottle(`${symbol}:ticker`)) {
                  marketState.updateSymbol(symbol, {
                    lastPrice: normalized.lastPrice,
                    highPrice: normalized.high,
                    lowPrice: normalized.low,
                    volume: normalized.volume,
                    quoteVolume: normalized.quoteVolume,
                    priceChangePercent: normalized.priceChangePercent
                  });
                }
              } else if (import.meta.env.DEV && d) {
                console.warn("[BitunixWS] FastPath failed for ticker. Keys:", Object.keys(d));
              }
            }
            return;
          }

          if (message.ch === "depth_book5") {
            if (symbol && isObjectData) {
              const d = data as any;
              if (d && Array.isArray(d.b) && Array.isArray(d.a)) {
                if (!this.shouldThrottle(`${symbol}:depth`)) {
                  marketState.updateDepth(symbol, { bids: d.b, asks: d.a });
                }
              } else if (import.meta.env.DEV && d) {
                console.warn("[BitunixWS] FastPath failed for depth. Keys:", Object.keys(d));
              }
            }
            return;
          }

          // Klines
          if (message.ch.startsWith("market_kline_") || message.ch === "mark_kline_1day") {
            if (symbol && isObjectData) {
              const d = data as any;
              if (d && (d.close || d.c || d.open || d.o)) {
                let timeframe = "1h";
                if (message.ch === "mark_kline_1day") timeframe = "1d";
                else {
                  const match = message.ch.match(/market_kline_(.+)/);
                  if (match) {
                    const bitunixTf = match[1];
                    const revMap: Record<string, string> = {
                      "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m",
                      "60min": "1h", "4h": "4h", "1day": "1d", "1week": "1w", "1month": "1M",
                    };
                    timeframe = revMap[bitunixTf] || bitunixTf;
                  }
                }
                const normalizedKlines = mdaService.normalizeKlines([d], "bitunix");
                marketState.updateSymbolKlines(symbol, timeframe, normalizedKlines);
              }
            }
            return;
          }
        }
      } catch (e) {
        // Log but don't crash - let Zod validation handle it or ignore
        if (import.meta.env.DEV) {
          logger.warn("network", "[BitunixWS] FastPath exception (falling back to std validation)", e);
        }
        // Fallthrough to standard validation
      }
      // --- END FAST PATH ---

      // 1. Validate message structure with Zod (Fallback for Order, Position, Login, etc.)
      // We rely on safeParse but we are lenient about extra fields (zod object is not strict by default)
      // If the schema itself is strict, it would fail on new fields.
      // BitunixWSMessageSchema in types/bitunixValidation.ts uses z.object({...}) which allows extra fields.
      const validationResult = BitunixWSMessageSchema.safeParse(message);
      if (!validationResult.success) {
        // Check if it's a critical structure failure vs minor field mismatch
        // If 'event', 'op' or 'ch' are missing/wrong type, it's critical.
        // If just data fields are off, we can ignore single message without counting towards circuit breaker.
        const issues = validationResult.error.issues;
        const criticalFields = ["event", "op", "ch", "code"];
        // Critical if:
        // 1. Root level structure error (path is empty)
        // 2. Critical field error (path[0] is in criticalFields)
        const isCritical = issues.some(i =>
          i.path.length === 0 ||
          (i.path.length > 0 && criticalFields.includes(String(i.path[0])))
        );

        if (isCritical) {
          const now = Date.now();
          if (now - this.lastValidationErrorTime > this.VALIDATION_ERROR_WINDOW) {
            this.validationErrorCount = 0;
          }
          this.validationErrorCount++;
          this.lastValidationErrorTime = now;

          if (this.validationErrorCount > this.MAX_VALIDATION_ERRORS) {
            logger.error(
              "network",
              "[WebSocket] Too many CRITICAL validation errors. Forcing reconnect.",
            );
            this.validationErrorCount = 0;
            this.cleanup(type);
            this.scheduleReconnect(type);
            return;
          }
        }

        logger.warn("network", "[WebSocket] Invalid message structure (ignored)", validationResult.error.issues);
        return;
      }

      const validatedMessage = validationResult.data;

      // 2. Handle special messages
      if (validatedMessage && validatedMessage.event === "login") {
        if (
          validatedMessage.code === 0 ||
          validatedMessage.code === "0" ||
          validatedMessage.msg === "success"
        ) {
          if (settingsState.enableNetworkLogs) {
            logger.log("network", "Login successful");
          }
          this.isAuthenticated = true;
          this.subscribePrivate();
        }
        return;
      }

      if (!validatedMessage) return;
      if (validatedMessage.op === "ping") return;

      if (validatedMessage.op === "pong" || validatedMessage.pong) {
        const now = Date.now();
        const start = type === "public" ? this.lastPingTimePublic : this.lastPingTimePrivate;
        if (start > 0) {
          const latency = now - start;
          // Sanity check: latency should be realistic (< 10s)
          if (latency >= 0 && latency < 10000) {
            marketState.updateTelemetry({ wsLatency: latency });
          }
        }
        return;
      }

      // 3. Validate channel if present
      if (validatedMessage.ch && !isAllowedChannel(validatedMessage.ch)) {
        logger.warn("network", "[WebSocket] Unknown channel", validatedMessage.ch);
        return;
      }

      // 4. Handle price updates
      if (validatedMessage.ch === "price") {
        const rawSymbol = validatedMessage.symbol || "";
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const normalized = mdaService.normalizeTicker(validatedMessage, "bitunix");

        if (!this.shouldThrottle(`${symbol}:price`)) {
          marketState.updateSymbol(symbol, {
            lastPrice: normalized.lastPrice,
            // Funding data if present in validatedMessage.data
            fundingRate: (validatedMessage.data as any).fr,
            nextFundingTime: (validatedMessage.data as any).nft ? String((validatedMessage.data as any).nft) : undefined
          });
        }
      } else if (validatedMessage.ch === "ticker") {
        const rawSymbol = validatedMessage.symbol || "";
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const normalized = mdaService.normalizeTicker(validatedMessage, "bitunix");

        if (!this.shouldThrottle(`${symbol}:ticker`)) {
          marketState.updateSymbol(symbol, {
            lastPrice: normalized.lastPrice,
            highPrice: normalized.high,
            lowPrice: normalized.low,
            volume: normalized.volume,
            quoteVolume: normalized.quoteVolume,
            priceChangePercent: normalized.priceChangePercent
          });
        }
      }
      else if (validatedMessage.ch === "depth_book5") {
        const rawSymbol = validatedMessage.symbol;
        if (!rawSymbol) return;
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = validatedMessage.data;
        if (symbol && data) {
          if (!this.shouldThrottle(`${symbol}:depth`)) {
            marketState.updateDepth(symbol, { bids: data.b, asks: data.a });
          }
        }
      } else if (
        validatedMessage.ch &&
        (validatedMessage.ch.startsWith("market_kline_") ||
          validatedMessage.ch === "mark_kline_1day")
      ) {
        const rawSymbol = validatedMessage.symbol || "";
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = validatedMessage.data;
        if (symbol && data) {
          let timeframe = "1h";
          if (validatedMessage.ch === "mark_kline_1day") timeframe = "1d";
          else {
            const match = validatedMessage.ch.match(/market_kline_(.+)/);
            if (match) {
              const bitunixTf = match[1];
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
          const normalizedKlines = mdaService.normalizeKlines([data], "bitunix");
          marketState.updateSymbolKlines(symbol, timeframe, normalizedKlines);
        }
      }
      else if (validatedMessage.ch === "position") {
        const data = validatedMessage.data;
        if (data) {
          if (Array.isArray(data))
            data.forEach((item: any) => {
              accountState.updatePositionFromWs(item);
              omsService.updatePosition(mapToOMSPosition(item));
            });
          else {
            accountState.updatePositionFromWs(data);
            omsService.updatePosition(mapToOMSPosition(data));
          }
        }
      } else if (validatedMessage.ch === "order") {
        const data = validatedMessage.data;
        if (data) {
          if (Array.isArray(data))
            data.forEach((item: any) => {
              accountState.updateOrderFromWs(item);
              omsService.updateOrder(mapToOMSOrder(item));
            });
          else {
            accountState.updateOrderFromWs(data);
            omsService.updateOrder(mapToOMSOrder(data));
          }
        }
      } else if (validatedMessage.ch === "wallet") {
        const data = validatedMessage.data;
        if (data) {
          if (Array.isArray(data))
            data.forEach((item: any) => accountState.updateBalanceFromWs(item));
          else accountState.updateBalanceFromWs(data);
        }
      }
    } catch (err) {
      logger.error("network", "[WebSocket] Message handling error", err);
      logger.error("network", "[WebSocket] Problematic message", JSON.stringify(message).slice(0, 200));
    }
  }

  subscribe(symbol: string, channel: string) {
    if (!symbol) return;
    const normalizedSymbol = normalizeSymbol(symbol, "bitunix");
    const subKey = `${channel}:${normalizedSymbol}`;
    if (this.publicSubscriptions.has(subKey)) return;

    // Prune oldest if limit reached
    if (this.publicSubscriptions.size >= this.MAX_PUBLIC_SUBSCRIPTIONS) {
      const oldest = this.publicSubscriptions.values().next().value;
      if (oldest) {
        this.publicSubscriptions.delete(oldest);
        const [oldChan, oldSym] = oldest.split(":");
        if (
          oldChan &&
          oldSym &&
          this.wsPublic &&
          this.wsPublic.readyState === WebSocket.OPEN
        ) {
          if (settingsState.enableNetworkLogs) {
            logger.log("network", `[Auto-Prune] Unsubscribing ${oldest}`);
          }
          this.sendUnsubscribe(this.wsPublic, oldSym, oldChan);
        }
      }
    }

    this.publicSubscriptions.add(subKey);
    if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
      if (settingsState.enableNetworkLogs) {
        logger.log("network", `Subscribe: ${channel}:${normalizedSymbol}`);
      }
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
      logger.warn("network", "[WebSocket] Failed to send private subscribe", e);
    }
  }

  private sendSubscribe(ws: WebSocket, symbol: string, channel: string) {
    const payload = { op: "subscribe", args: [{ symbol, ch: channel }] };
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {
      logger.warn("network", `[WebSocket] Failed to send subscribe for ${symbol}:${channel}`, e);
    }
  }

  private sendUnsubscribe(ws: WebSocket, symbol: string, channel: string) {
    const payload = { op: "unsubscribe", args: [{ symbol, ch: channel }] };
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {
      logger.warn("network", `[WebSocket] Failed to send unsubscribe for ${symbol}:${channel}`, e);
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

  private handleInternalError(type: "public" | "private", error: unknown) {
    const now = Date.now();

    if (type === "public") {
      if (now - this.lastErrorTimePublic > this.ERROR_WINDOW_MS) {
        this.errorCountPublic = 0;
      }
      this.errorCountPublic++;
      this.lastErrorTimePublic = now;

      if (this.errorCountPublic >= this.ERROR_THRESHOLD) {
        logger.warn("network", `[WebSocket] Public: Excessive errors (${this.errorCountPublic}), forcing reconnect.`);
        // NOTE: We do not reset the error counter here to ensure that if the new connection
        // fails immediately, we catch it quickly without waiting for another threshold.
        // The counter will only reset if the connection is stable for ERROR_WINDOW_MS.
        this.cleanup("public");
        this.scheduleReconnect("public");
      }
    } else {
      if (now - this.lastErrorTimePrivate > this.ERROR_WINDOW_MS) {
        this.errorCountPrivate = 0;
      }
      this.errorCountPrivate++;
      this.lastErrorTimePrivate = now;

      if (this.errorCountPrivate >= this.ERROR_THRESHOLD) {
        logger.warn("network", `[WebSocket] Private: Excessive errors (${this.errorCountPrivate}), forcing reconnect.`);
        this.cleanup("private");
        this.scheduleReconnect("private");
      }
    }

    logger.warn("network", `[WebSocket] ${type} error handled`, error);
  }
}

export const bitunixWs = new BitunixWebSocketService();
