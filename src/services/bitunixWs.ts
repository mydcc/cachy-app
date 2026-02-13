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
import { getIntervalMs, parseTimestamp } from "../utils/utils";
import { connectionManager } from "./connectionManager";
import { mdaService } from "./mdaService";
import { omsService } from "./omsService";
import { logger } from "./logger";
import { mapToOMSPosition, mapToOMSOrder } from "./mappers";
import { safeJsonParse } from "../utils/safeJson";
import CryptoJS from "crypto-js";
import { Decimal } from "decimal.js";
import type { OMSOrder, OMSOrderStatus } from "./omsTypes";
import type {
  BitunixWSMessage,
  BitunixPriceData,
  BitunixTickerData,
} from "../types/bitunix";
import {
  BitunixWSMessageSchema,
  BitunixPriceDataSchema,
  BitunixTickerDataSchema,
  StrictPriceDataSchema,
  StrictTickerDataSchema,
  StrictDepthDataSchema,
  BitunixOrderSchema,
  BitunixPositionSchema,
  isAllowedChannel,
  validateSymbol,
} from "../types/bitunixValidation";

export interface TradeData {
  p: string; // price
  v: string; // volume
  s: string; // side
  t: number; // timestamp
}

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

class BitunixWebSocketService {
  // Trade Listeners
  private tradeListeners = new Map<string, Set<(trade: TradeData) => void>>();
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

  // [HYBRID CHANGE] 
  // We separate 'active' subscriptions (state) from 'pending' (intent).
  // The 'pendingSubscriptions' acts as a buffer that survives re-connects.
  // Updated to Map for reference counting.
  public pendingSubscriptions: Map<string, number> = new Map();

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
  private readonly MAX_VALIDATION_ERRORS = 50; // [HYBRID FIX] Increased from 5 to 50 to prevent cascading reconnects on minor API drifts
  private readonly VALIDATION_ERROR_WINDOW = 60000; // [HYBRID FIX] Increased window to 1m
  private lastNumericWarning = 0; // Throttle for numeric precision warnings

  private readonly MAX_PUBLIC_SUBSCRIPTIONS = 50;

  // Backoff State
  private backoffDelay = 1000;
  private readonly MAX_BACKOFF_DELAY = 30000;

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
    this.initMonitors();
  }

  private initMonitors() {
    if (typeof window !== "undefined") {
      // Ensure we don't duplicate listeners if called multiple times (e.g. revive from destroy)
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);

      if (this.globalMonitorInterval) clearInterval(this.globalMonitorInterval);

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

        // [HYBRID FIX] Increased tolerance to 15s (3x Ping Interval) to prevent false positives
        if (status === "connected" && timeSincePublic > 15000) {
          marketState.connectionStatus = "reconnecting";
        }

        // Monitor for stale connection, but ONLY if connected.
        // If connecting, the connectionTimeout handles it.
        // Increased to 25s to allow for the 15s reconnection warning window
        if (status === "connected" && timeSincePublic > 25000) {
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
    const shouldBlock = now - last < this.UPDATE_INTERVAL;
    
    if (shouldBlock) {
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
    // Revive monitors if reviving from destroyed state
    if (this.isDestroyed || !this.globalMonitorInterval) {
        this.initMonitors();
    }
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

        // [HYBRID FIX] Reset Backoff on successful connection
        this.backoffDelay = 1000;
        this.isReconnectingPublic = false;

        this.lastMessageTimePublic = Date.now();
        this.startHeartbeat(ws, "public");
        this.resetWatchdog("public", ws);

        // [HYBRID] Flush Buffer on Connect
        this.flushPendingSubscriptions();
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
          const message = safeJsonParse(event.data);

          if (import.meta.env.DEV) {
             const raw = typeof event.data === 'string' ? event.data : '';
             // Check if we have potential large integers unquoted (>= 15 digits)
             if (raw && /:\s*-?\d{15,}/.test(raw)) {
                  const unsafe = JSON.parse(raw);
                  if (JSON.stringify(message) === JSON.stringify(unsafe)) {
                      console.warn("[BitunixWS] WARNING: Large integer detected but safeJsonParse did not alter the result. Potential regex failure?", raw);
                  }
             }
          }

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
            this.cleanup("public");
          } else {
            marketState.connectionStatus = "reconnecting";
            this.cleanup("public");
            this.scheduleReconnect("public");
          }
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
      // [HYBRID FIX] Wrap socket creation to catch immediate browser blocks
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
          const message = safeJsonParse(event.data);

          if (import.meta.env.DEV) {
             const raw = typeof event.data === 'string' ? event.data : '';
             // Check if we have potential large integers unquoted (>= 15 digits)
             if (raw && /:\s*-?\d{15,}/.test(raw)) {
                  const unsafe = JSON.parse(raw);
                  if (JSON.stringify(message) === JSON.stringify(unsafe)) {
                      console.warn("[BitunixWS] WARNING: Large integer detected but safeJsonParse did not alter the result. Potential regex failure?", raw);
                  }
             }
          }

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
            this.cleanup("private");
          } else {
            this.cleanup("private");
            this.scheduleReconnect("private");
          }
        }
      };

      ws.onerror = (error) => {
          // [HYBRID FIX] Quietly handle connection errors
          // logger.warn("network", "[BitunixWS] Private connection error", error);
      };
    } catch (e) {
      // Catch synchronous errors (e.g. invalid URL or browser blocking)
      if (settingsState.enableNetworkLogs) {
          logger.warn("network", "[BitunixWS] Failed to initiate private connection", e);
      }
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

      // [HYBRID FIX] Exponential Backoff
      const delay = this.backoffDelay;
      this.backoffDelay = Math.min(this.backoffDelay * 1.5, this.MAX_BACKOFF_DELAY);

      logger.log("network", `[BitunixWS] Scheduling reconnect in ${delay}ms (Backoff: ${this.backoffDelay})`);

      if (this.reconnectTimerPublic) clearTimeout(this.reconnectTimerPublic);
      this.reconnectTimerPublic = setTimeout(() => {
        this.isReconnectingPublic = false;
        if (!this.isDestroyed) this.connectPublic();
      }, delay);
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
        nonce = crypto.randomUUID().replace(/-/g, "");
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
    } catch (error) {
    }
  }

  private handleMessage(message: BitunixWSMessage, type: "public" | "private") {
    try {
      const rawDataStr = JSON.stringify(message);
      const dataSize = rawDataStr.length;
      const messageType = message.event || message.op || message.ch || message.topic || 'unknown';
      
      if (type === "public") {
        this.awaitingPongPublic = false;
        this.missedPongsPublic = 0;
      } else {
        this.awaitingPongPrivate = false;
        this.missedPongsPrivate = 0;
      }

      // [HYBRID FIX] Normalize channel (Bitunix sometimes sends 'topic' instead of 'ch')
      const channel = message.ch || message.topic;

      // --- FAST PATH OPTIMIZATION ---
      // [MAINTENANCE WARNING]
      // This block manually parses/casts data to avoid Zod overhead for high-frequency events (Price/Ticker/Depth).
      // If the API schema changes, this block MUST be updated manually.
      // Any error here is caught silently (in Prod) and falls back to the standard Zod validation path below.

      // Check high-frequency messages (price, ticker, depth) BEFORE expensive Zod validation
      // Wrapped in try-catch to prevent crashing the entire socket handler
      try {
        if (message && channel) {
          const rawSymbol = message.symbol || "";
          const symbol = normalizeSymbol(rawSymbol, "bitunix");
          const data = message.data;

          // Common guard for object data (price, ticker, kline) - Ensure strict object type
          const isObjectData = data && typeof data === "object" && !Array.isArray(data);

          if (isObjectData) {
            switch (channel) {
              case "price":
                // HARDENING: Use Strict Zod Validation instead of loose casting
                const priceRes = StrictPriceDataSchema.safeParse(data);
                if (symbol && priceRes.success) {
                  try {
                    // HARDENING: Direct property access + Warning on Numeric Types
                    const safeString = (val: any, fieldName: string) => {
                        if (typeof val === 'number') {
                            const now = Date.now();
                            if (now - this.lastNumericWarning > 60000) {
                                logger.warn("network", `[BitunixWS] PRECISION RISK: Received numeric ${fieldName} for ${symbol}. Value: ${val}. Precision loss possible.`);
                                this.lastNumericWarning = now;
                            }
                            return String(val);
                        }
                        return val;
                    };

                    const ip = safeString(data.ip, 'indexPrice');
                    const fr = safeString(data.fr, 'fundingRate');
                    const nft = data.nft ? String(data.nft) : undefined;

                    // Check precision loss on lastPrice if present (though we don't use it currently)
                    if (typeof data.lastPrice === 'number' || typeof data.lp === 'number') {
                         safeString(data.lastPrice || data.lp, 'lastPrice');
                    }

                    if (!this.shouldThrottle(`${symbol}:price`)) {
                        marketState.updateSymbol(symbol, {
                          indexPrice: ip ? new Decimal(ip) : undefined,
                          fundingRate: fr ? new Decimal(fr) : undefined,
                          nextFundingTime: nft ? Number(nft) : undefined
                        });
                    }
                    return;
                  } catch (fastPathError) {
                    logger.warn("network", "[BitunixWS] FastPath error (price)", fastPathError);
                  }
                }
                break;

              case "ticker":
                const tickerRes = StrictTickerDataSchema.safeParse(data);
                if (symbol && tickerRes.success) {
                  try {
                    const safeString = (val: any, fieldName: string) => {
                        if (typeof val === 'number') {
                            const now = Date.now();
                            if (now - this.lastNumericWarning > 60000) {
                                logger.warn("network", `[BitunixWS] PRECISION RISK: Received numeric ${fieldName} for ${symbol}. Casting to string.`);
                                this.lastNumericWarning = now;
                            }
                            return String(val);
                        }
                        return val;
                    };

                    // OPTIMIZATION: Mutate safe fields in place if they are numbers (unlikely from API but possible)
                    // Avoiding full object allocation/clone for high frequency ticker
                    if (typeof data.lastPrice === 'number') data.lastPrice = safeString(data.lastPrice, 'lastPrice');
                    if (typeof data.high === 'number') data.high = safeString(data.high, 'high');
                    if (typeof data.low === 'number') data.low = safeString(data.low, 'low');
                    if (typeof data.volume === 'number') data.volume = safeString(data.volume, 'volume');
                    if (typeof data.quoteVolume === 'number') data.quoteVolume = safeString(data.quoteVolume, 'quoteVolume');
                    if (typeof data.v === 'number') data.v = safeString(data.v, 'v');
                    if (typeof data.close === 'number') data.close = safeString(data.close, 'close');

                    // Re-use message object since we mutated data in-place (safe because 'message' is transient from parse)
                    const normalized = mdaService.normalizeTicker(message, "bitunix");

                    if (normalized && !this.shouldThrottle(`${symbol}:ticker`)) {
                      marketState.updateSymbol(symbol, {
                        lastPrice: normalized.lastPrice,
                        highPrice: normalized.high,
                        lowPrice: normalized.low,
                        volume: normalized.volume,
                        quoteVolume: normalized.quoteVolume,
                        priceChangePercent: normalized.priceChangePercent
                      });
                    }
                    return;
                  } catch (fastPathError) {
                    logger.warn("network", "[BitunixWS] FastPath error (ticker)", fastPathError);
                  }
                }
                break;

              case "depth_book5":
                const depthRes = StrictDepthDataSchema.safeParse(data);
                if (symbol && depthRes.success) {
                  try {
                    const sData = depthRes.data;
                    // Zod transform has already ensured all nested numbers are strings
                    // However, we need to map to simple tuple arrays [string, string][] as expected by marketState
                    const bids = sData.b as [string, string][];
                    const asks = sData.a as [string, string][];

                    if (!this.shouldThrottle(`${symbol}:depth`)) {
                      marketState.updateDepth(symbol, { bids, asks });
                    }
                    return;
                  } catch (fastPathError) {
                    logger.warn("network", "[BitunixWS] FastPath error (depth)", fastPathError);
                  }
                }
                break;

              default:
                // Klines (dynamic channel names)
                if (channel.startsWith("market_kline_") || channel === "mark_kline_1day") {
                    try {
                        const d = data as any;
                        if (d && (d.close || d.c || d.open || d.o)) {
                          let timeframe = "1h";
                          if (channel === "mark_kline_1day") timeframe = "1d";
                          else {
                            const match = channel.match(/market_kline_(.+)/);
                            if (match) {
                              const bitunixTf = match[1];
                              const revMap: Record<string, string> = {
                                "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m",
                                "60min": "1h", "4h": "4h", "1day": "1d", "1week": "1w", "1month": "1M",
                              };
                              timeframe = revMap[bitunixTf] || bitunixTf;
                            }
                          }

                          if (timeframe === '15m' || timeframe === '30m') {
                              if (import.meta.env.DEV) {
                                  logger.log("network", `[BitunixWS] Received ${channel} -> mapped to ${timeframe}. Data:`, d);
                              }
                          }

                          let candleStart = 0;
                          const rawTs = message.ts || Date.now();
                          const ts = parseTimestamp(rawTs);

                          if (timeframe === "1M") {
                            const d = new Date(ts);
                            candleStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
                          } else {
                            const intervalMs = getIntervalMs(timeframe);
                            candleStart = Math.floor(ts / intervalMs) * intervalMs;
                          }

                          const klineData = { ...d, ts: candleStart };
                          const normalizedKlines = mdaService.normalizeKlines([klineData], "bitunix");
                          marketState.updateSymbolKlines(symbol, timeframe, normalizedKlines, "ws");

                          // [SYNTHETIC] Dynamic Support
                          // Iterate active synthetic subscriptions to see if any depend on this update
                          // @ts-ignore
                          if (this.syntheticSubs) {
                              // @ts-ignore
                              for (const [key, count] of this.syntheticSubs.entries()) {
                                  // key format: "SYMBOL:TF"
                                  const parts = key.split(":");
                                  if (parts.length !== 2) continue;
                                  
                                  const subSymbol = parts[0];
                                  const subTf = parts[1];
                                  
                                  // Optimization: Only check if symbol matches first
                                  if (subSymbol !== symbol) continue; // Note: symbol is already normalized in local context?
                                  // Wait, `symbol` arg in handleMessage comes from `normalizedSymbol` or raw?
                                  // `const symbol = message.data.symbol` is raw.
                                  // The key uses `normalizedSymbol`.
                                  // We must normalize `symbol` here to compare?
                                  // In handleMessage: `const symbol = message.data. symbol;` which is e.g. "BTCUSDT".
                                  // `normalizeKlines` uses "bitunix".
                                  // My sub keys use `normalizeSymbol(symbol, "bitunix")`.
                                  // So I should compare against normalized.
                                  // `const normalizedMessageSymbol = normalizeSymbol(symbol, "bitunix");`
                                  // But `marketState.updateSymbolKlines` uses `symbol` (raw?).
                                  // Let's check typical usage. `subscribe` normalizes.
                                  // `handleMessage` (line ~900): `const symbol = message.data.symbol;`
                                  // This is likely raw "BTCUSDT" or "BTC-USDT".
                                  // bitunixWs uses `normalizeSymbol` in subscribe.
                                  // If handleMessage receives "BTCUSDT", and subscribe put "BTCUSDT" in key...
                                  // Actually `normalizeSymbol` removes hyphens mostly.

                                  // Let's assume strict match on symbol specific to WS message.
                                  // Wait, if `syntheticSubs` has normalized, and `message` has raw...
                                  // I should normalize message symbol before compare.
                                  const msgSymbolNorm = normalizeSymbol(symbol, "bitunix");
                                  if (subSymbol !== msgSymbolNorm) continue;

                                  // Check timeframe dependency
                                  const resolved = this.resolveTimeframe(subTf);
                                  if (resolved.isSynthetic && resolved.base === timeframe) {
                                      // Trigger Aggregation
                                      const symbolData = marketState.data[symbol];
                                      const mk = symbolData?.klines ? symbolData.klines[timeframe] : undefined;
                                      
                                      if (mk && mk.length > 0) {
                                          const msBucket = resolved.intervalMs;
                                          const bucketStart = Math.floor(candleStart / msBucket) * msBucket;
                                          
                                          const bucketCandles: any[] = [];
                                          for (let i = mk.length - 1; i >= 0; i--) {
                                              if (mk[i].time < bucketStart) break;
                                              if (mk[i].time >= bucketStart) {
                                                  bucketCandles.unshift(mk[i]);
                                              }
                                          }

                                          if (bucketCandles.length > 0) {
                                              const first = bucketCandles[0];
                                              const last = bucketCandles[bucketCandles.length - 1];
                                              let high = new Decimal(first.high);
                                              let low = new Decimal(first.low);
                                              let vol = new Decimal(0);
                                              
                                              for (const c of bucketCandles) {
                                                  const h = new Decimal(c.high);
                                                  const l = new Decimal(c.low);
                                                  if (h.gt(high)) high = h;
                                                  if (l.lt(low)) low = l;
                                                  vol = vol.plus(c.volume);
                                              }
                                              
                                              const synthKline = {
                                                  time: bucketStart,
                                                  open: first.open,
                                                  high: high,
                                                  low: low,
                                                  close: last.close,
                                                  volume: vol
                                              };
                                              
                                              marketState.updateSymbolKlines(symbol, subTf, [synthKline as any], "ws");
                                          }
                                      }
                                  }
                              }
                          }

                        }
                        return;
                    } catch (fastPathError) {
                        if (import.meta.env.DEV) console.warn("[BitunixWS] FastPath error (kline):", fastPathError);
                    }
                }
                break;
            }
          }
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          logger.warn("network", "[BitunixWS] FastPath exception (falling back to std validation)", e);
        }
      }
      // --- END FAST PATH ---

      // 1. Validate message structure with Zod (Fallback for Order, Position, Login, etc.)
      // We rely on safeParse but we are lenient about extra fields (zod object is not strict by default)
      // If the schema itself is strict, it would fail on new fields.
      // BitunixWSMessageSchema in types/bitunixValidation.ts uses z.object({...}) which allows extra fields.
      const validationResult = BitunixWSMessageSchema.safeParse(message);
      if (!validationResult.success) {
        const validationIssues = validationResult.error.issues;
        
        // Check if it's a critical structure failure vs minor field mismatch
        // If 'event', 'op' or 'ch' are missing/wrong type, it's critical.
        // If just data fields are off, we can ignore single message without counting towards circuit breaker.
        const criticalFields = ["event", "op", "ch", "topic", "code"];
        // Critical if:
        // 1. Root level structure error (path is empty)
        // 2. Critical field error (path[0] is in criticalFields)
        const isCritical = validationIssues.some(i =>
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
      const validatedChannel = validatedMessage.ch || validatedMessage.topic;
      
      if (validatedChannel && !isAllowedChannel(validatedChannel)) {
        logger.warn("network", "[WebSocket] Unknown channel", validatedChannel);
        return;
      }

      // 4. Handle price updates
      if (validatedChannel === "price") {
        const rawSymbol = validatedMessage.symbol || "";
        const symbol = normalizeSymbol(rawSymbol, "bitunix");

        // Strict Type Safety via Zod
        const priceData = BitunixPriceDataSchema.safeParse(validatedMessage.data);

        if (priceData.success && !this.shouldThrottle(`${symbol}:price`)) {
          const d = priceData.data;
          marketState.updateSymbol(symbol, {
            // lastPrice: normalized.lastPrice, // [HYBRID FIX] Disabled
            indexPrice: d.ip ? String(d.ip) : undefined,
            fundingRate: d.fr ? String(d.fr) : undefined,
            nextFundingTime: d.nft ? String(d.nft) : undefined
          });
        }
      } else if (validatedChannel === "ticker") {
        const rawSymbol = validatedMessage.symbol || "";
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const normalized = mdaService.normalizeTicker(validatedMessage, "bitunix");

        if (normalized && !this.shouldThrottle(`${symbol}:ticker`)) {
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
      else if (validatedChannel === "depth_book5") {
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
        validatedChannel &&
        (validatedChannel.startsWith("market_kline_") ||
          validatedChannel === "mark_kline_1day")
      ) {
        const rawSymbol = validatedMessage.symbol || "";
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = validatedMessage.data;
        if (symbol && data) {
          let timeframe = "1h";
          if (validatedChannel === "mark_kline_1day") timeframe = "1d";
          else {
            const match = validatedChannel.match(/market_kline_(.+)/);
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
          // [HYBRID FIX] Inject detached 'ts' from root message into data object
          // Correctly calculate candle start time (floor to interval)
          let candleStart = 0;
          if (timeframe === "1M") {
            const date = new Date(validatedMessage.ts || Date.now());
            date.setUTCDate(1);
            date.setUTCHours(0, 0, 0, 0);
            candleStart = date.getTime();
          } else {
            const intervalMs = getIntervalMs(timeframe);
            candleStart = Math.floor((validatedMessage.ts || Date.now()) / intervalMs) * intervalMs;
          }

          const klineData = { ...data, ts: candleStart };
          const normalizedKlines = mdaService.normalizeKlines([klineData], "bitunix");
          marketState.updateSymbolKlines(symbol, timeframe, normalizedKlines, "ws");
        }
      }

      else if (validatedChannel === "trade") {
        const rawSymbol = validatedMessage.symbol || "";
        const symbol = normalizeSymbol(rawSymbol, "bitunix");
        const data = validatedMessage.data;
        // Fast Path: Check if valid trade data
        if (data && (Array.isArray(data) ? isTradeData(data[0]) : isTradeData(data))) {
             const items = Array.isArray(data) ? data : [data];
             // Dispatch to listeners
             const listeners = this.tradeListeners.get(symbol);
             
             // DEBUG LOG
             if (import.meta.env.DEV) {
                 // console.log(`[BitunixWS] Received ${items.length} trades for ${symbol}. Listeners: ${listeners ? listeners.size : 0}`);
             }

             if (listeners) {
                 items.forEach(item => {
                     listeners.forEach(cb => { try { cb(item); } catch (e) { if (import.meta.env.DEV) console.warn("[BitunixWS] Trade listener error:", e); } });
                 });
             }
        } else {
             // FALLBACK: Log invalid trade data structure
             if (import.meta.env.DEV) {
                 console.warn('[BitunixWS] Received trade message but isTradeData failed:', data);
             }
        }
      }
      else if (validatedChannel === "position") {
        const data = validatedMessage.data;
        if (data) {
          const items = Array.isArray(data) ? data : [data];
          items.forEach((item: any) => {
            const val = BitunixPositionSchema.safeParse(item);
            if (!val.success) {
              logger.warn("network", "[BitunixWS] Position schema validation failed", val.error);
              // We proceed with best effort for positions as IDs are less critical than Orders
            }
            accountState.updatePositionFromWs(item);
            omsService.updatePosition(mapToOMSPosition(item));
          });
        }
      } else if (validatedChannel === "order") {
        const data = validatedMessage.data;
        if (data) {
          const sanitize = (item: any) => {
             if (typeof item.orderId === 'number') {
                 // Precision loss only happens > 15 digits, but we enforce string for consistency
                 // safeJsonParse handles >15 digits, so this catches smaller IDs or edge cases
                 if (item.orderId > 9007199254740991) {
                     logger.warn("network", `[BitunixWS] CRITICAL: numeric orderId detected > MAX_SAFE_INTEGER: ${item.orderId}`);
                 }
                 item.orderId = String(item.orderId);
             }
             return item;
          };

          if (Array.isArray(data))
            data.forEach((item: any) => {
              const safeItem = sanitize(item);
              accountState.updateOrderFromWs(safeItem);
              omsService.updateOrder(mapToOMSOrder(safeItem));
            });
          else {
            const safeItem = sanitize(data);
            accountState.updateOrderFromWs(safeItem);
            omsService.updateOrder(mapToOMSOrder(safeItem));
          }
        }
      } else if (validatedChannel === "wallet") {
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

    // [SYNTHETIC] Dynamic Support
    const resolved = this.resolveTimeframe(channel.replace("kline_", ""));
    let targetChannel = channel;
    
    if (channel.startsWith("kline_") && resolved.isSynthetic) {
        targetChannel = `kline_${resolved.base}`;
        const synthKey = `${normalizedSymbol}:${channel.replace("kline_", "")}`;
        
        // @ts-ignore
        if (!this.syntheticSubs) this.syntheticSubs = new Map<string, number>();
        // @ts-ignore
        const count = this.syntheticSubs.get(synthKey) || 0;
        // @ts-ignore
        this.syntheticSubs.set(synthKey, count + 1);
        
        if (import.meta.env.DEV) {
            logger.log("network", `[BitunixWS] Synthetic Subscribe ${channel.replace("kline_", "")} -> ${resolved.base} for ${normalizedSymbol}. Ref: ${count + 1}`);
        }
    }

    // [FIX] Map internal channel format to Bitunix specific format
    const bitunixChannel = this.getBitunixChannel(targetChannel);
    
    if (import.meta.env.DEV && channel.includes("20m")) {
         logger.log("network", `[BitunixWS] Subscribe Debug. Original: ${channel}, Target: ${targetChannel}, Mapped: ${bitunixChannel}`);
    }

    if (!bitunixChannel) {
        if (channel.startsWith("kline_")) {
             logger.warn("network", `[BitunixWS] Unsupported timeframe/channel: ${channel}. Target: ${targetChannel}. Subscription ignored.`);
        }
        return;
    }

    const subKey = `${targetChannel}:${normalizedSymbol}`; // Use TARGET channel (5m)

    // Reference Counting Logic
    const currentCount = this.pendingSubscriptions.get(subKey) || 0;
    this.pendingSubscriptions.set(subKey, currentCount + 1);

    // Only subscribe if this is the first requester
    if (currentCount === 0) {
      if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
        if (settingsState.enableNetworkLogs) {
          logger.log("network", `Subscribe: ${bitunixChannel}:${normalizedSymbol}`);
        }
        this.sendSubscribe(this.wsPublic, normalizedSymbol, bitunixChannel);
        // Force flush of synthetic initial fetch if needed? No, marketWatcher handles fetch.
      } else if (!this.wsPublic || this.wsPublic.readyState === WebSocket.CLOSED) {
        this.connectPublic();
      }
    }
  }

  unsubscribe(symbol: string, channel: string) {
    const normalizedSymbol = normalizeSymbol(symbol, "bitunix");
    const subKey = `${channel}:${normalizedSymbol}`;

    // [FIX] Map internal channel format to Bitunix specific format
    const bitunixChannel = this.getBitunixChannel(channel);
    if (!bitunixChannel) return;

    // Reference Counting Logic
    const currentCount = this.pendingSubscriptions.get(subKey) || 0;

    if (currentCount > 0) {
      const newCount = currentCount - 1;
      if (newCount === 0) {
        this.pendingSubscriptions.delete(subKey);

        if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
          this.sendUnsubscribe(this.wsPublic, normalizedSymbol, bitunixChannel);
        }
      } else {
        this.pendingSubscriptions.set(subKey, newCount);
      }
    }
  }

  // Forcefully remove subscription regardless of ref count (Emergency/Cleanup)
  forceUnsubscribe(symbol: string, channel: string) {
    const normalizedSymbol = normalizeSymbol(symbol, "bitunix");
    const subKey = `${channel}:${normalizedSymbol}`;

    const bitunixChannel = this.getBitunixChannel(channel);
    if (!bitunixChannel) return;

    this.pendingSubscriptions.delete(subKey);
    if (this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
        this.sendUnsubscribe(this.wsPublic, normalizedSymbol, bitunixChannel);
    }
  }

  // [SYNTHETIC] Helper to resolve best base timeframe
  private resolveTimeframe(tf: string): { base: string, isSynthetic: boolean, intervalMs: number } {
      const natives = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"];
      if (natives.includes(tf)) {
          return { base: tf, isSynthetic: false, intervalMs: getIntervalMs(tf) };
      }
      
      const targetMs = getIntervalMs(tf);
      if (targetMs === 0) return { base: tf, isSynthetic: false, intervalMs: 0 }; // Unknown

      // Find largest divisor
      const sorted = natives
          .map(n => ({ tf: n, ms: getIntervalMs(n) }))
          .sort((a, b) => b.ms - a.ms);

      for (const n of sorted) {
          if (n.ms > 0 && targetMs >= n.ms && targetMs % n.ms === 0) {
              return { base: n.tf, isSynthetic: true, intervalMs: targetMs };
          }
      }
      
      // Fallback
      return { base: tf, isSynthetic: false, intervalMs: targetMs };
  }

  // [FIX] Helper to map internal channels to Bitunix wire format
  private getBitunixChannel(internalChannel: string): string | null {
      // Pass through standard channels
      if (["ticker", "trade", "depth_book5", "price"].includes(internalChannel)) {
          return internalChannel;
      }

      // Map Klines
      if (internalChannel.startsWith("kline_")) {
          const tf = internalChannel.replace("kline_", "");
          const map: Record<string, string> = {
              "1m": "market_kline_1min",
              "5m": "market_kline_5min",
              "15m": "market_kline_15min",
              "30m": "market_kline_30min",
              "1h": "market_kline_60min",
              "4h": "market_kline_4h",
              "1d": "market_kline_1day",
              "1w": "market_kline_1week",
              "1M": "market_kline_1month"
          };
          return map[tf] || null;
      }

      return null;
  }


  // [HYBRID] New Flush Method
  private flushPendingSubscriptions() {
    if (!this.wsPublic || this.wsPublic.readyState !== WebSocket.OPEN) return;

    // Iterate over Map keys
    const subs = Array.from(this.pendingSubscriptions.keys());
    if (subs.length === 0) return;

    logger.log("network", `[BitunixWS] Flushing ${subs.length} buffered subscriptions`);

    subs.forEach(key => {
      const [channel, symbol] = key.split(":");
      const bitunixChannel = this.getBitunixChannel(channel);
      if (bitunixChannel) {
          this.sendSubscribe(this.wsPublic!, symbol, bitunixChannel);
      }
    });
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
    this.pendingSubscriptions.forEach((count, subKey) => {
      const [channel, symbol] = subKey.split(":");
      const bitunixChannel = this.getBitunixChannel(channel);
      if (bitunixChannel && this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
        this.sendSubscribe(this.wsPublic, symbol, bitunixChannel);
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

// --- Type Guards for Fast Path ---
// Helper to check for safe primitives (string or number)
const isSafe = (v: any) => {
  if (typeof v === 'string') return true;
  if (typeof v === 'number') return !isNaN(v) && isFinite(v);
  return false;
};

export function isPriceData(d: any): d is { fr?: any; nft?: any; lastPrice?: any; lp?: any; la?: any; ip?: any; } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;

  // Validate fields if they exist (Negative Checks)
  if (d.lastPrice !== undefined && !isSafe(d.lastPrice)) return false;
  if (d.lp !== undefined && !isSafe(d.lp)) return false;
  if (d.la !== undefined && !isSafe(d.la)) return false;
  if (d.ip !== undefined && !isSafe(d.ip)) return false;
  if (d.fr !== undefined && !isSafe(d.fr)) return false;

  // Ensure at least one known field exists AND is safe
  const hasSafePrice = (d.lastPrice !== undefined && isSafe(d.lastPrice)) ||
                       (d.lp !== undefined && isSafe(d.lp)) ||
                       (d.la !== undefined && isSafe(d.la)) ||
                       (d.ip !== undefined && isSafe(d.ip));

  const hasSafeFunding = (d.fr !== undefined && isSafe(d.fr));

  return hasSafePrice || hasSafeFunding;
}

export function isTickerData(d: any): d is {
  volume?: any; v?: any; lastPrice?: any; close?: any;
  high?: any; low?: any; quoteVolume?: any;
  h?: any; l?: any; q?: any;
} {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;

  // Validate critical fields if they exist
  if (d.lastPrice !== undefined && !isSafe(d.lastPrice)) return false;
  if (d.close !== undefined && !isSafe(d.close)) return false;
  if (d.volume !== undefined && !isSafe(d.volume)) return false;

  if (d.v !== undefined && !isSafe(d.v)) return false;
  if (d.q !== undefined && !isSafe(d.q)) return false;
  if (d.h !== undefined && !isSafe(d.h)) return false;
  if (d.l !== undefined && !isSafe(d.l)) return false;

  // Must have at least one valid indicator
  return (d.volume !== undefined || d.v !== undefined || d.lastPrice !== undefined || d.close !== undefined);
}

export function isDepthData(d: any): d is { b: any[]; a: any[] } {
  return d && Array.isArray(d.b) && Array.isArray(d.a);
}


export function isTradeData(d: any): d is { p: any; v: any; s: any; t: any; } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  // Bitunix trade format: { p: "price", v: "vol", s: "side", t: ts }
  // OR { lastPrice, volume, side } fallbacks
  
  // Strict Safety Checks
  const p = d.p ?? d.lastPrice ?? d.price;
  const v = d.v ?? d.volume ?? d.amount;
  // Side can be anything truthy usually, but safer to check existence
  // const s = d.s ?? d.side; // Unused but good to know it exists

  if (p === undefined || !isSafe(p)) return false;
  if (v === undefined || !isSafe(v)) return false;

  return true;
}
