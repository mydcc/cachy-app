/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { marketState } from "../stores/market.svelte";
import { accountState, type RawWsOrder, type RawWsPosition } from "../stores/account.svelte";
import { settingsState } from "../stores/settings.svelte";
import { normalizeSymbol, stripLegacyVenueSuffix } from "../utils/symbolUtils";
import { connectionManager } from "./connectionManager";
import { logger } from "./logger";
import { safeJsonParse } from "../utils/safeJson";
import CryptoJS from "crypto-js";
import type {
  BitgetWSMessage,
} from "../types/bitget";
import {
  BitgetWSMessageSchema,
  BitgetWSTickerSchema,
} from "../types/bitgetValidation";
import { Decimal } from "decimal.js";
import { keysForActiveAccount } from "../stores/settings/accounts";

// [ts, open, high, low, close, volume] — Bitget candle array entry.
type BitgetCandleTuple = [string, string, string, string, string, string];

// Raw fields read off the "orders" / "positions" private WS channels, as
// opposed to BitgetOrder (types/bitget.ts), which models the REST shape.
// These are normalized to RawWsOrder/RawWsPosition before passing to accountState.
interface BitgetWSOrderData {
  orderId?: string;
  instId?: string;
  status?: string;
  accFillSize?: string;
  price?: string;
  priceAvg?: string;
  size?: string;
  side?: string;
  orderType?: string;
}

interface BitgetWSPositionData {
  instId?: string;
  total?: string;
  openPriceAvg?: string;
  marginMode?: string;
  leverage?: string;
  unrealizedPL?: string;
  holdSide?: string;
}

// BUG-0598. V1 mixed streams are decommissioned. V2 splits the socket by role
// and there is no combined endpoint, so this is the public half only: it serves
// ticker, depth and candles. Private streams (orders, positions, account) need
// `wss://ws.bitget.com/v2/ws/private` plus a login, which is tracked separately —
// see `subscribePrivate`, which refuses loudly rather than dropping the request.
const WS_URL = "wss://ws.bitget.com/v2/ws/public";

/**
 * The authenticated half of the V2 split. Same protocol, same timing, own
 * lifecycle: the vendor serves `orders`, `positions` and `account` here and
 * disconnects a socket whose login fails. A second service instance pointed
 * at this URL is the private socket — its subscription ledger is a separate
 * `Map` by construction, which is exactly the per-socket ledger BUG-0598
 * requires.
 */
const WS_PRIVATE_URL = "wss://ws.bitget.com/v2/ws/private";

/**
 * The subscription selector for account-wide private channels. This is a
 * venue keyword, not a symbol: it must reach the wire verbatim and never pass
 * through `normalizeSymbol`, which would mangle it into a pair that matches
 * nothing (BUG-0598).
 */
const PRIVATE_SUBSCRIBE_INST_ID = "default";

/**
 * V2 replaced V1's `instType: "mc"` with an explicit product type. Public market
 * data is subscribed as USDT futures, which is the product this app quotes.
 */
const WS_INST_TYPE = "USDT-FUTURES";

/**
 * Channels that V2 only serves on the authenticated private socket. The public
 * endpoint rejects them, so subscribing here would trade a loud failure for a
 * silent one.
 */
const PRIVATE_CHANNELS = ["orders", "positions", "account"] as const;

const PING_INTERVAL = 25000; // Bitget requires ping every 30s
const WATCHDOG_TIMEOUT = 35000;
const RECONNECT_DELAY = 1000; // Base delay
const CONNECTION_TIMEOUT_MS = 5000;

export class BitgetWebSocketService {
  private static instanceCount = 0;
  private instanceId = 0;
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPingTime = 0;
  private isReconnecting = false;

  // Backoff
  private backoffDelay = RECONNECT_DELAY;
  private readonly MAX_BACKOFF_DELAY = 30000;

  public subscriptions: Map<string, number> = new Map(); // Stores "channel:symbol" -> count

  private globalMonitorInterval: ReturnType<typeof setInterval> | null = null;

  private lastMessageTime = Date.now();

  private isAuthenticated = false;
  private isDestroyed = false;

  /**
   * Which half of the V2 split this instance is. The default is the public
   * socket, so every existing construction site keeps its behaviour without
   * changing. A private instance points at `WS_PRIVATE_URL`, logs in on open,
   * and accepts the private channels the public one refuses.
   */
  private readonly endpoint: string;
  private readonly isPrivateSocket: boolean;
  /** Credentials captured at connect time, so a mid-session account switch
   *  cannot log this socket in as the account the trader has since left. */
  private pendingKeys: { key: string; secret: string; passphrase?: string } | null = null;

  // Throttling
  private throttleMap = new Map<string, number>();
  private readonly UPDATE_INTERVAL = 200;
  private readonly THROTTLE_TTL = 5000;

  private handleOnline = () => {
    if (this.isDestroyed) return;
    this.cleanup();
    marketState.connectionStatus = "connecting";
    this.connect(true);
  };

  private handleOffline = () => {
    marketState.connectionStatus = "disconnected";
    marketState.updateTelemetry({ activeConnections: 0 });
    connectionManager.onProviderDisconnected("bitget");
    this.cleanup();
  };

  constructor(opts?: { url?: string; isPrivate?: boolean }) {
    this.endpoint = opts?.url ?? WS_URL;
    this.isPrivateSocket = opts?.isPrivate ?? false;
    this.instanceId = ++BitgetWebSocketService.instanceCount;
    logger.log("governance", `[BitgetWS] Instance #${this.instanceId} Created`);
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);

      this.globalMonitorInterval = setInterval(() => {
        if (this.isDestroyed) return;

        this.pruneThrottleMap();

        const status = marketState.connectionStatus;

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          if (status !== "disconnected")
            marketState.connectionStatus = "disconnected";
          return;
        }

        // If Bitget is NOT the active provider, we must NOT touch the global status,
        if (settingsState.apiProvider !== "bitget") {
          this.cleanup();
          return;
        }

        // If market data is globally disabled, then we can force disconnect.
        if (!settingsState.entitlement.capabilities.marketData) {
          if (status !== "disconnected") {
            marketState.connectionStatus = "disconnected";
            this.cleanup();
          }
          return;
        }

        // No autonomous reconnections here.
      }, 5000);
    }
  }



  private shouldThrottle(key: string, commit = true): boolean {
    const now = Date.now();
    const last = this.throttleMap.get(key) || 0;
    if (now - last < this.UPDATE_INTERVAL) {
      return true;
    }
    if (commit) {
      this.throttleMap.set(key, now);
    }
    return false;
  }

  private commitThrottle(key: string): void {
    this.throttleMap.set(key, Date.now());
  }

  private pruneThrottleMap(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.throttleMap.entries()) {
      if (now - timestamp > this.THROTTLE_TTL) {
        this.throttleMap.delete(key);
      }
    }
  }

  destroy() {
    logger.log("governance", `[BitgetWS] #${this.instanceId} destroy() called.`);
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
    this.throttleMap.clear();

    // Permanent teardown: drop subscription state only when the service is
    // being destroyed, never on the transient reconnect-driven `cleanup()`
    // above — `resubscribe()` replays this map onto the fresh socket.
    //
    // FEAT-0227 made this load-bearing. `connectionManager.killAll()` destroys
    // every provider and then tells the subscription ledger to forget what it
    // issued, so the next reconcile re-issues every wanted channel. If the
    // count here survived the destroy, that re-issue would raise it to 2 and
    // send nothing, and the single `unsubscribe` a consumer eventually sends
    // would decrement to 1 rather than to 0 — no unsubscribe frame, and the
    // venue keeps streaming a channel nobody wants. `bitunixWs.destroy()`
    // clears `pendingSubscriptions` for the same reason.
    this.subscriptions.clear();
  }

  connect(force?: boolean) {
    logger.log("governance", `[BitgetWS] #${this.instanceId} connect(force=${force}) entering. isDestroyed was: ${this.isDestroyed}`);
    this.isDestroyed = false;
    if (this.isDestroyed || !settingsState.entitlement.capabilities.marketData) return;
    if (settingsState.apiProvider !== "bitget") return;

    // The private socket authenticates as an account, not as a venue: without
    // keys there is nothing to log in with, so refusing here is the only
    // honest path. Critically this returns *before* any reconnect is
    // scheduled — a missing-key retry loop would hammer a login endpoint
    // while the trader has simply not entered credentials yet.
    this.pendingKeys = null;
    if (this.isPrivateSocket) {
      const keys = keysForActiveAccount(
        settingsState.accounts,
        settingsState.activeAccountId,
        "bitget",
      );
      if (!keys?.key || !keys?.secret) {
        logger.warn(
          "network",
          "[WS-Bitget] Private socket has no credentials for the active account; not connecting",
        );
        return;
      }
      this.pendingKeys = {
        key: keys.key,
        secret: keys.secret,
        passphrase: keys.passphrase,
      };
    }

    if (!force && typeof navigator !== "undefined" && !navigator.onLine) {
      marketState.connectionStatus = "disconnected";
      return;
    }

    if (this.ws) {
      if (
        !force &&
        (this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      // FEAT-0026: `force` was accepted and then ignored here, unlike
      // `bitunixWs.connectPrivate`, which honours it for exactly this
      // reason. Via `switchProvider` it made no difference — the teardown
      // runs first — but `handleOnline` calls `connect` directly, so
      // returning early would keep a socket logged in with the credentials
      // of the account the trader has since left.
      this.cleanup();
    }

    marketState.connectionStatus = "connecting";

    try {
      const ws = new WebSocket(this.endpoint);
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

        if (settingsState.enableNetworkLogs) {
          logger.log("network", "[WS-Bitget] Connected");
        }
        marketState.connectionStatus = "connected";
        marketState.updateTelemetry({ activeConnections: (marketState.telemetry.activeConnections || 0) + 1 });

        // Notify Manager
        connectionManager.onProviderConnected("bitget");

        // Reset Backoff
        this.backoffDelay = RECONNECT_DELAY;
        this.isReconnecting = false;
        this.lastMessageTime = Date.now();

        this.startHeartbeat(ws);
        this.resetWatchdog(ws);

        // BUG-0598: no login here on the public socket. V2's public endpoint
        // has no login to perform and disconnects a socket that tries — which
        // would cost the working public streams. The private socket logs in
        // with the credentials captured at connect time instead (see
        // `subscribePrivate`); without them `connect()` refused before any
        // socket existed, so `pendingKeys` is set exactly when this runs.
        if (this.isPrivateSocket && this.pendingKeys) {
          this.login(
            this.pendingKeys.key,
            this.pendingKeys.secret,
            this.pendingKeys.passphrase ?? "",
          );
        }
        this.resubscribe();
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        this.lastMessageTime = Date.now();
        this.resetWatchdog(ws);

        if (event.data === "pong") {
          const now = Date.now();
          if (this.lastPingTime > 0) {
            const latency = now - this.lastPingTime;
            if (latency >= 0 && latency < 10000) {
              marketState.updateTelemetry({ wsLatency: latency });
            }
          }
          return;
        }

        try {
          const message = safeJsonParse(event.data);
          this.handleMessage(message);
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (this.isDestroyed) return;
        if (this.ws === ws) {
          marketState.updateTelemetry({ activeConnections: Math.max(0, (marketState.telemetry.activeConnections || 0) - 1) });
          // BUG-0565 / IDEA-0563: demote at close, not at the next connect —
          // the reconnect runs after a backoff delay, and until then the
          // measurement would stay trusted with a dead stream behind it.
          accountState.markBalanceUnmeasured();
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            marketState.connectionStatus = "disconnected";
            this.cleanup();
          } else {
            marketState.connectionStatus = "reconnecting";
            this.scheduleReconnect();
          }
        }
      };

      ws.onerror = () => { };

    } catch {
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

    // Exponential Backoff
    const delay = this.backoffDelay;
    this.backoffDelay = Math.min(this.backoffDelay * 1.5, this.MAX_BACKOFF_DELAY);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.isReconnecting = false;
      if (!this.isDestroyed) this.connect();
    }, delay);
  }

  private startHeartbeat(ws: WebSocket) {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          this.lastPingTime = Date.now();
          ws.send("ping");
        } catch {
          // Best effort keepalive. A failed ping means the socket is already
          // gone; the close/reconnect handler owns recovery.
        }
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
      } catch {
        // Teardown must never throw — the socket may already be closed.
      }
    }
    this.ws = null;
    this.isReconnecting = false;
    this.isAuthenticated = false;
    // Teardown leaves no key material behind: the next connect re-reads the
    // active account anyway, so anything kept here could only be stale — or,
    // after destroy(), reachable from a dead instance (review on #3921).
    this.pendingKeys = null;
    // BUG-0565 / IDEA-0563: single socket, shared fate — when it goes down
    // the authenticated stream goes with it, so a live measurement stops
    // being one until the next push or REST poll re-stamps it.
    accountState.markBalanceUnmeasured();
  }

  /**
   * Builds the V2 private-socket login frame.
   *
   * BUG-0598: no caller on this socket. The public endpoint has no login to
   * perform and drops a connection that tries, so the public half never calls
   * this. It is kept, and pinned by `bitgetWs.v2.test.ts`, because the private
   * socket needs exactly this signature and BUG-0581 already settled the
   * matching response handling — deleting it would mean re-deriving the signing
   * input later, with no test to catch a wrong guess.
   */
  private login(apiKey: string, apiSecret: string, passphrase: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!CryptoJS || !CryptoJS.SHA256) return;

    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      // Bitget V1 WS Login Sign: base64(hmac(timestamp + 'GET' + '/user/verify', secret))
      // BUG-0598: the sign input is unchanged in V2, but the *endpoint* it
      // authenticates is not. This is called out rather than rewritten because
      // there is no private socket to verify against yet — see the note above.
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
      logger.warn("network", "[WS-Bitget] Login error", e);
    }
  }

  private handleMessage(message: BitgetWSMessage) {
    // We can do a fast-path throttle check for high frequency channels if we extract channel and instId directly.
    // Both fields are still unvalidated here — `safeParse` runs below — so the
    // symbol is only normalized when it really is a string. A non-string would
    // throw inside `normalizeSymbol`, and that throw would be swallowed by the
    // `try/catch` in `onmessage`: the frame would be discarded through a path
    // that reads like a crash, instead of the plain return the schema below
    // would have given it.
    const rawArg = message.arg as { channel?: string, instId?: unknown } | undefined;
    // The private subscription selector (`default`) is a venue keyword, not a
    // symbol — throttling by it would key every account push onto one shared
    // entry, so it is skipped here (BUG-0598). Per-item pushes carry their own
    // pair and throttle normally below.
    if (rawArg && rawArg.channel && typeof rawArg.instId === "string" && rawArg.instId !== PRIVATE_SUBSCRIBE_INST_ID) {
       const channel = rawArg.channel;
       // Same normalization as the handler below, so this dry-run probes the
       // key the handler actually commits to. With the raw wire spelling the two
       // would disagree and the throttle would never engage — the dry-run would
       // keep reporting "not throttled" for a key nothing ever writes.
       const instId = normalizeSymbol(rawArg.instId, "bitget");

       if (channel === "ticker") {
           const throttleTicker = this.shouldThrottle(`${instId}:ticker`, false);
           const throttlePrice = this.shouldThrottle(`${instId}:price`, false);
           // If both are throttled, we don't need to process ticker updates
           if (throttleTicker && throttlePrice) return;
       } else if (channel === "books" || channel === "books5" || channel === "books15") {
           if (this.shouldThrottle(`${instId}:depth`, false)) return;
       }
    }

    const validated = BitgetWSMessageSchema.safeParse(message);
    if (!validated.success) return;

    const msg = validated.data;

    // BUG-0581: the vendor documents the WS login success code inconsistently
    // ("0" on the WS page, 0 as a number in best-practices, "00000" by REST
    // convention), so accept every documented spelling instead of one exact
    // string. Normalize before comparing; an exact match here failed closed
    // and silently (no private streams, healthy-looking socket).
    if (msg.event === "login") {
      const code = msg.code === undefined ? "" : String(msg.code);
      if (code === "00000" || code === "0") {
        this.isAuthenticated = true;
        if (settingsState.enableNetworkLogs) logger.log("network", "[WS-Bitget] Login success");
        // A login frame only ever arrives on the private socket — the public
        // endpoint drops a connection that tries. So success here means this
        // socket may now ask for the account-wide channels.
        if (this.isPrivateSocket) {
          for (const channel of PRIVATE_CHANNELS) {
            this.subscribe(PRIVATE_SUBSCRIBE_INST_ID, channel);
          }
        } else {
          this.subscribePrivate();
        }
        return;
      }
      logger.warn("network", `[WS-Bitget] Unrecognized login code: ${code}`, msg);
      return;
    }

    if (!msg.arg || !msg.data) return;

    // Inbound stays deliberately wider than outbound. `getBitgetChannel` refuses
    // the private and all-levels-`books` channels on the subscribe path, but a
    // push for one of them can still be in flight from before a reconnect, and
    // dropping it silently would be the same failure this whole change is about.
    // The branches below therefore keep handling what the socket delivers; what
    // we refuse is asking for more of it.
    const channel = msg.arg.channel;
    // BUG-0598: V2 pushes are keyed by the bare pair (`BTCUSDT`), and since
    // BUG-0599 `normalizeSymbol` produces exactly that, so the wire spelling and
    // the store key are the same string. Writing under the wire spelling can no
    // longer leave a live socket feeding a key nothing reads.
    //
    // BUG-0599 changed the fallback rather than removing it: a V1-shaped push
    // that still carries the suffix is now canonicalized to the bare pair, where
    // before it passed through unchanged. That is the behaviour we want, but it
    // is a behaviour change on this line, so it is named here rather than left
    // to be rediscovered.
    const instId = normalizeSymbol(msg.arg.instId, "bitget");

    // Ticker
    if (channel === "ticker") {
      const data = msg.data[0];
      const tickerVal = BitgetWSTickerSchema.safeParse(data);
      if (tickerVal.success) {
        const t = tickerVal.data;
        // V2 renamed the last price to `lastPr`; V1's `last` is kept as a
        // fallback so a socket that has not finished reconnecting shows a stale
        // price rather than a blank chart. The schema guarantees one of them.
        const lastPrice = t.lastPr ?? t.last;
        // Update market
        const update: Record<string, unknown> = {};
        if (lastPrice) update.lastPrice = lastPrice;
        if (t.high24h) update.highPrice = t.high24h;
        if (t.low24h) update.lowPrice = t.low24h;
        if (t.baseVolume || t.volume24h) update.volume = t.baseVolume || t.volume24h;
        if (t.quoteVolume || t.usdtVolume) update.quoteVolume = t.quoteVolume || t.usdtVolume;
        if (t.open24h) update.open = t.open24h;

        // Calc change if possible. Derived from the last price and the open
        // rather than read off V2's `change24h`: the vendor does not document
        // that field's unit, and REST has been observed sending a fraction where
        // the UI shows a percentage. Guessing there would put a wrong sign or
        // wrong magnitude on every percentage on the screen.
        if (lastPrice && t.open24h) {
          const l = new Decimal(lastPrice);
          const o = new Decimal(t.open24h);
          if (!o.isZero()) {
            update.priceChangePercent = l.minus(o).div(o).times(100);
          }
        }

        if (t.fundingRate !== undefined) update.fundingRate = t.fundingRate;
        if (t.nextFundingTime !== undefined) update.nextFundingTime = t.nextFundingTime;

        if (!this.shouldThrottle(`${instId}:ticker`)) {
          marketState.updateTicker(instId, update);
        }

        // Also update price (for fast price)
        if (lastPrice && !this.shouldThrottle(`${instId}:price`)) {
          marketState.updatePrice(instId, { price: lastPrice });
        }
      }
    }
    // Kline
    else if (channel.startsWith("candle")) {
      // data is [[ts, o, h, l, c, v, q], ...]
      if (Array.isArray(msg.data)) {
        const klines = msg.data.map((k: BitgetCandleTuple) => {
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

        marketState.updateSymbolKlines(instId, tf, klines, "ws");
      }
    }
    // Depth
    else if (channel === "books" || channel === "books5" || channel === "books15") {
      const data = msg.data[0];
      if (data && data.bids && data.asks) {
        this.commitThrottle(`${instId}:depth`);
        marketState.updateDepth(instId, { bids: data.bids, asks: data.asks });
      }
    }
    // Private: Orders
    else if (channel === "orders") {
      // Handle order updates
      if (Array.isArray(msg.data)) {
        msg.data.forEach((o: BitgetWSOrderData) => {
          const normalized = this.normalizeOrderData(o);
          accountState.updateOrderFromWs(normalized);
        });
      }
    }
    // Private: Positions
    else if (channel === "positions") {
      if (Array.isArray(msg.data)) {
        msg.data.forEach((p: BitgetWSPositionData) => {
          const normalized = this.normalizePositionData(p);
          accountState.updatePositionFromWs(normalized);
        });
      }
    }
  }

  subscribe(symbol: string, channel: string) {
    if (!symbol) return;

    // Private channels are account-wide: the venue subscribes them under the
    // `default` selector, not under a pair. Normalizing that selector would
    // mangle it into a key nothing reads, so it bypasses `normalizeSymbol`
    // here and travels to the wire verbatim (BUG-0598).
    const isPrivateChannel = (PRIVATE_CHANNELS as readonly string[]).includes(channel);
    const normalizedSymbol = isPrivateChannel
      ? PRIVATE_SUBSCRIBE_INST_ID
      : normalizeSymbol(symbol, "bitget");

    // [FIX] Map internal channel to Bitget specific format
    const bitgetChannel = this.getBitgetChannel(channel);
    if (!bitgetChannel) {
         if (channel.startsWith("kline_")) {
             // logger.warn("network", `[BitgetWS] Unsupported timeframe/channel: ${channel}`);
         }
         return;
    }

    const subKey = `${channel}:${normalizedSymbol}`;
    const currentCount = this.subscriptions.get(subKey) || 0;
    this.subscriptions.set(subKey, currentCount + 1);

    if (currentCount === 0) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendSubscribe(this.ws, normalizedSymbol, bitgetChannel);
      } else {
        this.connect();
      }
    }
  }

  unsubscribe(symbol: string, channel: string) {
    if (!symbol) return;
    const normalizedSymbol = (PRIVATE_CHANNELS as readonly string[]).includes(channel)
      ? PRIVATE_SUBSCRIBE_INST_ID
      : normalizeSymbol(symbol, "bitget");

    const subKey = `${channel}:${normalizedSymbol}`;
    const currentCount = this.subscriptions.get(subKey) || 0;

    // Nothing was ever issued for this channel, so there is nothing to release.
    // This returns before `getBitgetChannel`, which keeps the refusal warnings
    // it logs for the private and incremental channels off the teardown path:
    // unsubscribing something that was never subscribed is a no-op, not a
    // misconfiguration, and a second warning at the end of a teardown sweep
    // buries the one that mattered.
    if (currentCount === 0) return;

    const bitgetChannel = this.getBitgetChannel(channel);
    if (!bitgetChannel) return;

    if (currentCount === 1) {
        this.subscriptions.delete(subKey);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendUnsubscribe(this.ws, normalizedSymbol, bitgetChannel);
        }
    } else {
        this.subscriptions.set(subKey, currentCount - 1);
    }
  }

  // [FIX] Helper to map internal channels to Bitget wire format
  private getBitgetChannel(internalChannel: string): string | null {
      // BUG-0598: V2 serves these on the authenticated private socket only.
      // The public endpoint rejects them, so a public instance refuses them
      // explicitly; a private instance accepts them, which is the entire
      // reason it exists. Returning the name unchanged on the public socket
      // used to mean a frame the venue silently ignored — the account panel
      // then showed no orders with nothing in the log to explain why.
      if ((PRIVATE_CHANNELS as readonly string[]).includes(internalChannel)) {
          if (this.isPrivateSocket) return internalChannel;
          logger.warn(
              "network",
              `[WS-Bitget] Refusing to subscribe to the private channel "${internalChannel}" on the public V2 socket; it needs wss://ws.bitget.com/v2/ws/private plus a login (BUG-0598, tracked separately)`,
              { channel: internalChannel },
          );
          return null;
      }

      // `books` is the all-levels book, and on V2 it is one snapshot followed by
      // incremental deltas. The depth branch below writes whatever arrives as the
      // complete book, so subscribing here would replace a correct book with a
      // partial one on every push. `books5` and `books15` always arrive whole.
      if (internalChannel === "books") {
          logger.warn(
              "network",
              '[WS-Bitget] Refusing to subscribe to "books" on V2: it streams incremental updates after the first snapshot, which this client would mistake for a full order book. Use books5 or books15 (BUG-0598)',
              { channel: internalChannel },
          );
          return null;
      }

      // Pass through standard channels
      if (["ticker", "books5", "books15"].includes(internalChannel)) {
          return internalChannel;
      }

      // Map Klines
      if (internalChannel.startsWith("kline_")) {
          const tf = internalChannel.replace("kline_", "");
          const map: Record<string, string> = {
              "1m": "candle1m",
              "5m": "candle5m",
              "15m": "candle15m",
              "30m": "candle30m",
              "1h": "candle1H",
              "4h": "candle4H",
              "1d": "candle1D",
              "1w": "candle1W"
          };
          return map[tf] || null;
      }
      return null;
  }

  private sendSubscribe(ws: WebSocket, symbol: string, channel: string) {
    // BUG-0598: V2 takes an explicit product type and the bare pair as `instId`.
    // `symbol` is the store key throughout the service — the ledger and
    // `resubscribe` both speak it — so the suffix is stripped here, at the last
    // moment before the wire, rather than at each call site.
    const payload = {
      op: "subscribe",
      args: [{
        instType: WS_INST_TYPE,
        channel: channel,
        instId: stripLegacyVenueSuffix(symbol)
      }]
    };
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Best effort subscribe/unsubscribe. If the socket is not writable
      // the reconnect handler replays subscriptions.
    }
  }

  private sendUnsubscribe(ws: WebSocket, symbol: string, channel: string) {
    const payload = {
      op: "unsubscribe",
      args: [{
        instType: WS_INST_TYPE,
        channel: channel,
        instId: stripLegacyVenueSuffix(symbol)
      }]
    };
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Best effort subscribe/unsubscribe. If the socket is not writable
      // the reconnect handler replays subscriptions.
    }
  }

  private resubscribe() {
    for (const subKey of this.subscriptions.keys()) {
      const [channel, symbol] = subKey.split(":");
      const bitgetChannel = this.getBitgetChannel(channel);
      if (bitgetChannel && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendSubscribe(this.ws, symbol, bitgetChannel);
      }
    }
  }

  /**
   * BUG-0598: refused, deliberately.
   *
   * On V1 one socket carried both roles, so private channels rode along after a
   * login. V2 has no combined endpoint: `orders`, `positions` and `account` are
   * served by `wss://ws.bitget.com/v2/ws/private` and require their own login,
   * and the vendor disconnects a socket whose login fails. Pointing this at the
   * public socket would therefore take the working public streams down with it.
   *
   * The public half landed first because it is verifiable without credentials.
   * The private socket below — with its own reference-counted ledger, since
   * the two roles no longer share one — is the follow-up. Until it is wired
   * into the lifecycle, refusing loudly on this socket stays the honest
   * behaviour: the account panel has no live stream, and the log says so
   * instead of the request vanishing.
   */
  private subscribePrivate() {
    logger.warn(
        "network",
        "[WS-Bitget] Private streams are unavailable: this is the V2 public socket. orders/positions/account need wss://ws.bitget.com/v2/ws/private with a login, tracked as the private half of BUG-0598",
        { channels: [...PRIVATE_CHANNELS] },
    );
  }

  private normalizeOrderData(order: BitgetWSOrderData): RawWsOrder {
    return {
      orderId: order.orderId,
      symbol: order.instId,
      orderStatus: order.status,
      price: order.price,
      qty: order.size,
      dealAmount: order.accFillSize,
      side: order.side,
      type: order.orderType,
      ctime: undefined,
    };
  }

  private normalizePositionData(position: BitgetWSPositionData): RawWsPosition {
    return {
      positionId: position.instId,
      symbol: position.instId,
      qty: position.total,
      leverage: position.leverage,
      marginMode: position.marginMode,
      unrealizedPNL: position.unrealizedPL,
      averagePrice: position.openPriceAvg,
      avgOpenPrice: position.openPriceAvg,
      side: position.holdSide,
      event: undefined,
      margin: undefined,
    };
  }

}

export const bitgetWs = new BitgetWebSocketService();

/**
 * The private half of the V2 split (BUG-0598): authenticated socket for
 * `orders`, `positions` and `account`, with its own subscription ledger —
 * the two roles no longer share one. It connects only when the active
 * account holds credentials; without them `connect()` refuses loudly instead
 * of retry-looping a login endpoint. Login, channel subscription and the
 * timing constants are the same code as the public half.
 *
 * Not yet wired into the adapter lifecycle: nothing drives this instance
 * until the private subscription path is reviewed, so it currently only runs
 * when connected explicitly (and in tests).
 */
export const bitgetWsPrivate = new BitgetWebSocketService({
  url: WS_PRIVATE_URL,
  isPrivate: true,
});
