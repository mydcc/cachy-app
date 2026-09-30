// @vitest-environment happy-dom
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

/*
 * BUG-0598 — the Bitget WebSocket still spoke the decommissioned V1 protocol.
 *
 * The failure this pins is not a crash. On V1 the socket connected, the
 * subscription frames were accepted, and pushes arrived; they were then
 * discarded on the way in, because the wire vocabulary had moved on:
 *
 *   - V1 mixed streams (`/mix/v1/stream`) were retired in favour of the two
 *     V2 endpoints. There is no combined V2 socket, so the public half moves
 *     to `/v2/ws/public` and the private half needs a socket of its own.
 *   - `instType` is `USDT-FUTURES`, not V1's `mc`.
 *   - `instId` is the bare pair (`BTCUSDT`), not the `_UMCBL` store key. The
 *     suffix is this app's internal bookkeeping and is never sent to a venue.
 *   - the ticker field is `lastPr`; V1's `last` is gone. A V1-shaped ticker
 *     schema therefore rejects every V2 push, and the chart sits empty on a
 *     socket that looks perfectly healthy.
 *
 * Everything here is credential-free and therefore live-verifiable. The
 * private channels (orders, positions, account) are asserted to be *refused
 * loudly* rather than silently dropped, so the gap stays visible until the
 * private socket lands.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import CryptoJS from "crypto-js";
import { BitgetWebSocketService } from "./bitgetWs";
import { marketState } from "../stores/market.svelte";
import { accountState } from "../stores/account.svelte";
import { settingsState } from "../stores/settings.svelte";
import { logger } from "./logger";

const V2_PUBLIC_URL = "wss://ws.bitget.com/v2/ws/public";
const V1_MIX_URL = "wss://ws.bitget.com/mix/v1/stream";

/** The store key for BTCUSDT. What every consumer of marketState looks up. */
const BTC_STORE_KEY = "BTCUSDT_UMCBL";
/** The wire symbol. What the venue expects in `instId`. */
const BTC_WIRE = "BTCUSDT";

class MockWebSocket {
  // The service compares against the *static* `WebSocket.OPEN`, so the mock has
  // to carry it — without it every readiness check silently fails.
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = 1; // OPEN
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  sent: string[] = [];
  close = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  send = vi.fn((data: string) => { this.sent.push(data); });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  /** Every frame written to the wire, parsed. */
  frames(): Array<{ op?: string, args?: Array<Record<string, unknown>> }> {
    return this.sent.map((raw) => JSON.parse(raw));
  }
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket;

/** The private surface this suite drives. */
type WsInternals = {
  ws: WebSocket | null;
  handleMessage(message: Record<string, unknown>): void;
  getBitgetChannel(internalChannel: string): string | null;
  subscribePrivate(): void;
  login(apiKey: string, apiSecret: string, passphrase: string): void;
};

let service: BitgetWebSocketService;
let internals: WsInternals;
let socket: MockWebSocket;

beforeEach(() => {
  accountState.reset();

  service = new BitgetWebSocketService();
  internals = service as unknown as WsInternals;
  socket = new MockWebSocket(V2_PUBLIC_URL);
  internals.ws = socket as unknown as WebSocket;

  // Cleared *after* the hand-made socket above, so `instances` only ever holds
  // sockets the service itself opened. Registering the hand-made one would make
  // the endpoint and login assertions below read a socket they did not open,
  // which passes before the fix and proves nothing.
  MockWebSocket.instances = [];
});

afterEach(() => {
  service.destroy();
  vi.restoreAllMocks();
});

/** A V2 ticker push exactly as `docs/bitget-api/07_websocket.md` documents it. */
function v2TickerFrame(overrides: Record<string, string> = {}) {
  return {
    action: "snapshot",
    arg: { instType: "USDT-FUTURES", channel: "ticker", instId: BTC_WIRE },
    data: [{
      instId: BTC_WIRE,
      lastPr: "110",
      open24h: "100",
      high24h: "120",
      low24h: "90",
      baseVolume: "1234.5",
      quoteVolume: "135795",
      change24h: "0.1",
      fundingRate: "0.0001",
      nextFundingTime: "1760000000000",
      ts: "1760000000000",
      ...overrides,
    }],
  };
}

describe("Bitget WebSocket V2 wire contract (BUG-0598)", () => {
  describe("endpoint", () => {
    it("connects to the V2 public endpoint, not the decommissioned V1 mix stream", () => {
      settingsState.apiProvider = "bitget";
      settingsState.entitlement.capabilities.marketData = true;
      // A cold connect: `connect()` returns early when a live socket is already
      // in place, which is what `beforeEach` provides for the frame-level tests.
      internals.ws = null;

      (service as unknown as { connect(force?: boolean): void }).connect();

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toBe(V2_PUBLIC_URL);
      expect(MockWebSocket.instances[0].url).not.toBe(V1_MIX_URL);
    });

    it("never sends a login frame on the public socket, even with keys configured", () => {
      settingsState.apiProvider = "bitget";
      settingsState.entitlement.capabilities.marketData = true;
      settingsState.accounts = [{
        id: "acct-1",
        name: "Bitget",
        exchange: "bitget",
        keys: { key: "k", secret: "s", passphrase: "p" },
      }];
      settingsState.activeAccountId = "acct-1";
      internals.ws = null;

      (service as unknown as { connect(force?: boolean): void }).connect();
      const opened = MockWebSocket.instances[0];
      opened.onopen?.();

      // V2 has no combined socket: the public endpoint refuses a login and
      // disconnects on failure. Sending one would trade a quiet private gap
      // for a socket that drops every public subscription too.
      expect(opened.frames().filter((f) => f.op === "login")).toHaveLength(0);
    });

    it("arms a ping inside the vendor's 30s budget once the socket is open", () => {
      settingsState.apiProvider = "bitget";
      settingsState.entitlement.capabilities.marketData = true;
      internals.ws = null;
      const intervals: number[] = [];
      const realSetInterval = globalThis.setInterval;
      vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: never, ms?: number) => {
        if (typeof ms === "number") intervals.push(ms);
        return realSetInterval(fn, ms);
      }) as typeof setInterval);

      (service as unknown as { connect(force?: boolean): void }).connect();
      MockWebSocket.instances[0].onopen?.();

      // Bitget disconnects after 2 minutes without a client ping and documents
      // 30s as the ceiling. This pins 25s because that is what the service has
      // always used on V1, where it worked: a live V2 socket is not the place
      // to discover a new cadence. A tighter ping risks the 10 msg/s hard limit,
      // which the vendor answers by disconnecting and eventually banning the IP.
      expect(intervals).toContain(25000);
    });
  });

  describe("outbound subscribe frames", () => {
    it("sends USDT-FUTURES as the instrument type", () => {
      service.subscribe(BTC_WIRE, "ticker");

      const [frame] = socket.frames();
      expect(frame.op).toBe("subscribe");
      expect(frame.args?.[0]?.instType).toBe("USDT-FUTURES");
      expect(frame.args?.[0]?.instType).not.toBe("mc");
    });

    it("sends the bare pair as instId, not the internal _UMCBL store key", () => {
      service.subscribe(BTC_WIRE, "ticker");

      const [frame] = socket.frames();
      expect(frame.args?.[0]?.instId).toBe(BTC_WIRE);
      expect(frame.args?.[0]?.instId).not.toContain("_UMCBL");
    });

    it("strips the store-key suffix even when the caller passes a suffixed symbol", () => {
      // The subscription ledger keys on the store key, so internal callers and
      // resubscribe() may hand us either spelling. The wire always gets the pair.
      service.subscribe(BTC_STORE_KEY, "ticker");

      const [frame] = socket.frames();
      expect(frame.args?.[0]?.instId).toBe(BTC_WIRE);
    });

    it("uses the same V2 payload shape for unsubscribe", () => {
      service.subscribe(BTC_WIRE, "ticker");
      socket.sent.length = 0;
      service.unsubscribe(BTC_WIRE, "ticker");

      const [frame] = socket.frames();
      expect(frame.op).toBe("unsubscribe");
      expect(frame.args?.[0]?.instType).toBe("USDT-FUTURES");
      expect(frame.args?.[0]?.instId).toBe(BTC_WIRE);
    });
  });

  describe("inbound ticker", () => {
    it("reads a V2 push carrying lastPr and writes it to the suffixed store key", () => {
      const update = vi.spyOn(marketState, "updateTicker").mockImplementation(() => {});

      internals.handleMessage(v2TickerFrame());

      // The push is keyed by the bare pair, so the store has to be addressed by
      // the suffixed key or the chart stays empty on a live socket.
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0]).toBe(BTC_STORE_KEY);
      const payload = update.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.lastPrice).toBe("110");
    });

    it("derives the 24h change from lastPr and open24h as a percentage", () => {
      const update = vi.spyOn(marketState, "updateTicker").mockImplementation(() => {});

      internals.handleMessage(v2TickerFrame());

      const payload = update.mock.calls[0][1] as Record<string, unknown>;
      // (110 - 100) / 100 * 100 = 10. The V2 `change24h` field is deliberately
      // ignored: its unit is undocumented, and REST proved the vendor speaks
      // fractions there, not percent.
      expect(String(payload.priceChangePercent)).toBe("10");
    });

    it("carries the V2 volume and quote-volume fields through", () => {
      const update = vi.spyOn(marketState, "updateTicker").mockImplementation(() => {});

      internals.handleMessage(v2TickerFrame());

      const payload = update.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.volume).toBe("1234.5");
      expect(payload.quoteVolume).toBe("135795");
      expect(payload.highPrice).toBe("120");
      expect(payload.lowPrice).toBe("90");
    });

    it("updates the fast price track from lastPr", () => {
      vi.spyOn(marketState, "updateTicker").mockImplementation(() => {});
      const price = vi.spyOn(marketState, "updatePrice").mockImplementation(() => {});

      internals.handleMessage(v2TickerFrame());

      expect(price).toHaveBeenCalledWith(BTC_STORE_KEY, { price: "110" });
    });

    it("still answers a V1-shaped ticker so a mid-flight socket is not silently blind", () => {
      const update = vi.spyOn(marketState, "updateTicker").mockImplementation(() => {});

      internals.handleMessage({
        action: "snapshot",
        arg: { instType: "mc", channel: "ticker", instId: BTC_STORE_KEY },
        data: [{ instId: BTC_STORE_KEY, last: "110", open24h: "100" }],
      });

      expect(update).toHaveBeenCalledTimes(1);
      const payload = update.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.lastPrice).toBe("110");
    });
  });

  describe("inbound depth", () => {
    it("writes a books5 snapshot to the suffixed store key", () => {
      const depth = vi.spyOn(marketState, "updateDepth").mockImplementation(() => {});

      internals.handleMessage({
        action: "snapshot",
        arg: { instType: "USDT-FUTURES", channel: "books5", instId: BTC_WIRE },
        data: [{ asks: [["110.1", "1"]], bids: [["109.9", "2"]], ts: "1760000000000" }],
      });

      expect(depth).toHaveBeenCalledTimes(1);
      expect(depth.mock.calls[0][0]).toBe(BTC_STORE_KEY);
      const payload = depth.mock.calls[0][1] as { bids: string[][], asks: string[][] };
      expect(payload.bids).toEqual([["109.9", "2"]]);
      expect(payload.asks).toEqual([["110.1", "1"]]);
    });
  });

  describe("inbound candles", () => {
    it("maps a V2 candle1H push onto the internal 1h timeframe and store key", () => {
      const klines = vi.spyOn(marketState, "updateSymbolKlines").mockImplementation(() => {});

      internals.handleMessage({
        action: "snapshot",
        arg: { instType: "USDT-FUTURES", channel: "candle1H", instId: BTC_WIRE },
        data: [["1760000000000", "100", "120", "90", "110", "12.5", "1375", "12.5"]],
      });

      expect(klines).toHaveBeenCalledTimes(1);
      const [symbol, timeframe, rows, source] = klines.mock.calls[0] as [
        string, string, Array<{ close: { toString(): string } }>, string,
      ];
      expect(symbol).toBe(BTC_STORE_KEY);
      expect(timeframe).toBe("1h");
      expect(source).toBe("ws");
      expect(rows[0].close.toString()).toBe("110");
    });
  });

  describe("channels the public socket must refuse", () => {
    it.each(["orders", "positions", "account"])(
      "refuses the private channel %s with a loud warning and sends no frame",
      (channel) => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

        service.subscribe(BTC_WIRE, channel);

        expect(socket.frames()).toHaveLength(0);
        expect(warn).toHaveBeenCalledWith(
          "network",
          expect.stringContaining(channel),
          expect.anything(),
        );
      },
    );

    it("refuses the all-levels books channel, whose V2 pushes are incremental", () => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

      service.subscribe(BTC_WIRE, "books");

      // V2 `books` sends one snapshot and then deltas. The depth handler writes
      // whatever arrives as the whole book, so subscribing here would replace a
      // correct order book with a partial one on every push.
      expect(socket.frames()).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith("network", expect.stringContaining("books"), expect.anything());
    });

    it("keeps books5 and books15 subscribable, they are always full snapshots", () => {
      expect(internals.getBitgetChannel("books5")).toBe("books5");
      expect(internals.getBitgetChannel("books15")).toBe("books15");
      expect(internals.getBitgetChannel("books")).toBeNull();
    });

    it("refuses a private subscription from the private path too", () => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

      internals.subscribePrivate();

      expect(socket.frames()).toHaveLength(0);
      expect(warn).toHaveBeenCalled();
    });

    it("keeps the login frame builder signable for the pending private socket", () => {
      // `login` has no caller on the public socket — the endpoint refuses one.
      // It is pinned anyway: the private socket needs this exact signature, and
      // an unpinned signing routine is one nobody can tell is still correct
      // until it fails against a funded account.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      try {
        internals.login("api-key", "api-secret", "passphrase");
      } finally {
        vi.useRealTimers();
      }

      const [frame] = socket.frames();
      expect(frame.op).toBe("login");
      const arg = frame.args?.[0] as Record<string, string>;
      expect(arg.apiKey).toBe("api-key");
      expect(arg.passphrase).toBe("passphrase");
      // base64(hmacSHA256(timestamp + "GET" + "/user/verify", secret))
      const expected = CryptoJS.HmacSHA256(
        `${Math.floor(Date.parse("2026-01-01T00:00:00Z") / 1000)}GET/user/verify`,
        "api-secret",
      ).toString(CryptoJS.enc.Base64);
      expect(arg.sign).toBe(expected);
    });
  });

  describe("reference-counted subscription ledger", () => {
    // These are the semantics the pending private socket will split per role.
    // Pinning them now means the split cannot quietly break them later.
    it("sends one frame for two subscribers of the same channel and symbol", () => {
      service.subscribe(BTC_WIRE, "ticker");
      service.subscribe(BTC_WIRE, "ticker");

      expect(socket.frames()).toHaveLength(1);
    });

    it("holds the subscription while any subscriber remains", () => {
      service.subscribe(BTC_WIRE, "ticker");
      service.subscribe(BTC_WIRE, "ticker");

      service.unsubscribe(BTC_WIRE, "ticker");
      expect(socket.frames()).toHaveLength(1);

      service.unsubscribe(BTC_WIRE, "ticker");
      const frames = socket.frames();
      expect(frames).toHaveLength(2);
      expect(frames[1].op).toBe("unsubscribe");
    });

    it("tracks the two roles independently", () => {
      service.subscribe(BTC_WIRE, "ticker");
      service.subscribe(BTC_WIRE, "books5");

      expect(socket.frames()).toHaveLength(2);
    });

    it("sends nothing for an unsubscribe that never had a subscription", () => {
      service.unsubscribe(BTC_WIRE, "ticker");

      expect(socket.frames()).toHaveLength(0);
    });

    it("stays quiet when a refused channel is unsubscribed without ever subscribing", () => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // Releasing something that was never issued is a no-op, not a
      // misconfiguration. The refusal warnings belong on the subscribe path;
      // repeating them on teardown buries the real one during a debug session.
      service.unsubscribe(BTC_WIRE, "positions");

      expect(socket.frames()).toHaveLength(0);
      expect(warn).not.toHaveBeenCalled();
    });

    it("still releases a held channel with one unsubscribe frame", () => {
      // The counterpart: a channel that *is* held must not be released silently
      // just because the mapping is refused.
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
      service.subscribe(BTC_WIRE, "books5");
      warn.mockClear();
      socket.sent.length = 0;

      service.unsubscribe(BTC_WIRE, "books5");

      expect(socket.frames()).toHaveLength(1);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
