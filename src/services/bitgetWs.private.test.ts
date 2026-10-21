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

/**
 * BUG-0598, private half: the authenticated V2 socket.
 *
 * The public half (`bitgetWs.v2.test.ts`) is verifiable without credentials;
 * this half is not — no test here touches the venue. What these cases pin is
 * everything up to the wire: the endpoint, the login frame the service sends
 * on open, the channels it asks for after a login success, and the two traps
 * a private socket has to avoid (the `default` selector must never pass
 * through symbol normalization, and a keyless instance must refuse rather
 * than retry-loop a login endpoint).
 *
 * The login frame shape and the `0` success code are settled facts, not
 * guesses: BUG-0581 verified both against the venue (`14_uta_v3.md`), and the
 * sign input (`timestamp + "GET" + "/user/verify"`) is unchanged from V1.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BitgetWebSocketService } from "./bitgetWs";
import { accountState } from "../stores/account.svelte";
import { marketState } from "../stores/market.svelte";
import { settingsState } from "../stores/settings.svelte";

const V2_PRIVATE_URL = "wss://ws.bitget.com/v2/ws/private";
const V2_PUBLIC_URL = "wss://ws.bitget.com/v2/ws/public";

class MockWebSocket {
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

  frames(): Array<{ op?: string, args?: Array<Record<string, unknown>> }> {
    return this.sent.map((raw) => JSON.parse(raw));
  }
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket;

type WsInternals = {
  ws: WebSocket | null;
  connect(force?: boolean): void;
  handleMessage(message: Record<string, unknown>): void;
  getBitgetChannel(internalChannel: string): string | null;
};

let service: BitgetWebSocketService;
let internals: WsInternals;

function withCredentials() {
  settingsState.apiProvider = "bitget";
  settingsState.entitlement.capabilities.marketData = true;
  settingsState.accounts = [{
    id: "acct-1",
    name: "Bitget",
    exchange: "bitget",
    keys: { key: "k", secret: "s", passphrase: "p" },
  }];
  settingsState.activeAccountId = "acct-1";
}

function openPrivateSocket(): MockWebSocket {
  service = new BitgetWebSocketService({ url: V2_PRIVATE_URL, isPrivate: true });
  internals = service as unknown as WsInternals;
  internals.connect();
  const opened = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  opened.onopen?.();
  return opened;
}

beforeEach(() => {
  accountState.reset();
  MockWebSocket.instances = [];
});

afterEach(() => {
  service?.destroy();
  vi.restoreAllMocks();
});

describe("Bitget private WebSocket (BUG-0598)", () => {
  describe("endpoint and login", () => {
    it("opens the private endpoint, not the public one", () => {
      withCredentials();

      openPrivateSocket();

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toBe(V2_PRIVATE_URL);
    });

    it("sends a login frame on open with the venue's sign input", () => {
      withCredentials();

      const opened = openPrivateSocket();
      const login = opened.frames().find((f) => f.op === "login");

      expect(login).toBeDefined();
      expect(login?.args?.[0]).toMatchObject({
        apiKey: "k",
        passphrase: "p",
        timestamp: expect.any(String),
      });
      expect(typeof login?.args?.[0]?.sign).toBe("string");
    });

    it("refuses to connect without credentials instead of retry-looping", () => {
      settingsState.apiProvider = "bitget";
      settingsState.entitlement.capabilities.marketData = true;
      settingsState.accounts = [];
      settingsState.activeAccountId = undefined;
      service = new BitgetWebSocketService({ url: V2_PRIVATE_URL, isPrivate: true });
      internals = service as unknown as WsInternals;

      internals.connect();

      // No socket exists, so there is nothing to reconnect — and crucially no
      // timer driving another attempt. A keyless retry loop would hammer the
      // login endpoint while the trader has simply not entered keys yet.
      expect(MockWebSocket.instances).toHaveLength(0);
    });

    it("keeps the default instance on the public endpoint", () => {
      withCredentials();

      const pub = new BitgetWebSocketService();
      (pub as unknown as WsInternals).connect();

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toBe(V2_PUBLIC_URL);
      pub.destroy();
    });
  });

  describe("private channels", () => {
    it("accepts the private channels the public socket refuses", () => {
      withCredentials();
      openPrivateSocket();

      for (const channel of ["orders", "positions", "account"]) {
        expect(internals.getBitgetChannel(channel)).toBe(channel);
      }
    });

    it("subscribes all three private channels after a login success", () => {
      withCredentials();
      const opened = openPrivateSocket();

      // BUG-0581: the venue answers the login with the number 0.
      internals.handleMessage({ event: "login", code: 0 });

      const subscribes = opened.frames().filter((f) => f.op === "subscribe");
      const channels = subscribes.map((f) => f.args?.[0]?.channel).sort();
      expect(channels).toEqual(["account", "orders", "positions"]);
      for (const sub of subscribes) {
        expect(sub.args?.[0]?.instType).toBe("USDT-FUTURES");
        // The account-wide selector reaches the wire verbatim (see below).
        expect(sub.args?.[0]?.instId).toBe("default");
      }
    });

    it("sends the default selector verbatim, never normalized into a pair", () => {
      withCredentials();
      const opened = openPrivateSocket();

      service.subscribe("whatever-the-caller-passed", "orders");
      const frame = opened.frames().find((f) => f.op === "subscribe");

      // `normalizeSymbol("default")` would produce a key nothing reads; the
      // subscription is account-wide, so the caller's symbol is irrelevant
      // and the selector goes out exactly as the venue documents it.
      expect(frame?.args?.[0]?.instId).toBe("default");
    });

    it("keeps an independent subscription ledger per socket", () => {
      withCredentials();
      openPrivateSocket();
      const pub = new BitgetWebSocketService();

      service.subscribe("default", "orders");
      (pub as unknown as { subscribe(s: string, c: string): void }).subscribe("BTCUSDT", "ticker");

      expect(service.subscriptions.get("orders:default")).toBe(1);
      expect(pub.subscriptions.get("orders:default")).toBeUndefined();
      expect(pub.subscriptions.get("ticker:BTCUSDT")).toBe(1);
      pub.destroy();
    });

    it("still refuses private channels on the public instance", () => {
      withCredentials();
      const pub = new BitgetWebSocketService();
      const pubInternals = pub as unknown as WsInternals;

      expect(pubInternals.getBitgetChannel("orders")).toBeNull();
      pub.destroy();
    });

    it("leaves no key material behind on teardown", () => {
      withCredentials();
      openPrivateSocket();
      type WithKeys = WsInternals & { pendingKeys: unknown };

      expect((internals as WithKeys).pendingKeys).not.toBeNull();

      service.destroy();

      // The next connect re-reads the active account anyway; anything kept
      // here could only be stale — or reachable from a dead instance.
      expect((internals as WithKeys).pendingKeys).toBeNull();
    });
  });

  describe("reconnect and status isolation", () => {
    it("does not ask for private channels before the login is acknowledged", () => {
      withCredentials();
      const opened = openPrivateSocket();

      // `onopen` sends the login frame. Replaying the ledger in that same
      // tick would put an unauthenticated subscribe on the wire, which V2
      // answers with an error and never opens (BUG-0598).
      expect(opened.frames().filter((f) => f.op === "subscribe")).toHaveLength(0);

      internals.handleMessage({ event: "login", code: 0 });

      expect(opened.frames().filter((f) => f.op === "subscribe")).toHaveLength(3);
    });

    it("re-authenticates and replays the ledger exactly once after a reconnect", async () => {
      withCredentials();
      openPrivateSocket();
      internals.handleMessage({ event: "login", code: 0 });
      expect(service.subscriptions.get("orders:default")).toBe(1);

      vi.useFakeTimers();
      try {
        vi.stubGlobal("navigator", { onLine: true });
        // A venue-initiated close leaves the socket CLOSED; without this the
        // reconnect's "already open" guard would return early and the test
        // would pass because nothing happened.
        MockWebSocket.instances[0].readyState = MockWebSocket.CLOSED;
        MockWebSocket.instances[0].onclose?.();
        await vi.advanceTimersByTimeAsync(2000);

        const reconnected = MockWebSocket.instances[1];
        expect(reconnected.url).toBe(V2_PRIVATE_URL);

        reconnected.onopen?.();
        expect(reconnected.frames().some((f) => f.op === "login")).toBe(true);
        internals.handleMessage({ event: "login", code: 0 });

        // The channel was adopted once, so the reconnect replays it rather
        // than incrementing the count to 2 — a count that would then survive
        // the single unsubscribe a teardown sends.
        expect(service.subscriptions.get("orders:default")).toBe(1);
        const ordersFrames = reconnected
          .frames()
          .filter((f) => f.op === "subscribe" && f.args?.[0]?.channel === "orders");
        expect(ordersFrames).toHaveLength(1);
      } finally {
        vi.unstubAllGlobals();
        vi.useRealTimers();
      }
    });

    it("does not drive the global market-data status", async () => {
      withCredentials();
      marketState.connectionStatus = "connected";

      const opened = openPrivateSocket();
      expect(marketState.connectionStatus).toBe("connected");

      vi.useFakeTimers();
      try {
        vi.stubGlobal("navigator", { onLine: true });
        opened.readyState = MockWebSocket.CLOSED;
        opened.onclose?.();
        await vi.advanceTimersByTimeAsync(2000);

        // The private socket is reconnecting; public market data is fine. The
        // offline banner must not appear for an account stream alone.
        expect(marketState.connectionStatus).toBe("connected");
      } finally {
        vi.unstubAllGlobals();
        vi.useRealTimers();
      }
    });
  });
});
