/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { bitgetWs } from "./bitgetWs";
import { normalizeSymbol } from "../utils/symbolUtils";

class MockWebSocket {
    // The service compares against the *static* `WebSocket.OPEN`, so the mock
    // has to carry it — without it every readiness check silently fails.
    static readonly OPEN = 1;
    static readonly CONNECTING = 0;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState = 1; // OPEN
    send = vi.fn();
    close = vi.fn();
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket;

/*
 * FEAT-0227 — the Bitget half of the invariant `bitunixWs.leak.test.ts`
 * already pins for Bitunix.
 *
 * The ledger above the adapters drops its record of what was issued when
 * `connectionManager.killAll()` destroys every provider. That is only sound if
 * the venue socket forgets at the same moment: the ledger then re-issues every
 * wanted channel and the venue counts it from zero again. If the venue keeps
 * its count across `destroy()`, each teardown ratchets it up by one, and the
 * `unsubscribe` that eventually arrives decrements to a number above zero —
 * so no unsubscribe frame is ever sent and the venue streams a channel nobody
 * wants for the rest of the session.
 *
 * `cleanup()` is the other half and must behave the opposite way: it runs on
 * transient reconnects, where `resubscribe()` replays the map onto the fresh
 * socket. Clearing there would lose the subscriptions instead of leaking them.
 *
 * Reachable only since FEAT-0227: before it, `syncSubscriptions` returned early
 * for every provider but Bitunix, so this map was always empty.
 */
type WsInternals = {
    subscriptions: Map<string, number>;
    ws: WebSocket | null;
    cleanup: () => void;
    destroy: () => void;
};

const internals = bitgetWs as unknown as WsInternals;

/** The service keys its map by the Bitget-normalised symbol (`..._UMCBL`). */
const TICKER_KEY = `ticker:${normalizeSymbol("BTCUSDT", "bitget")}`;

describe("BitgetWebSocketService subscription leak", () => {
    beforeEach(() => {
        internals.subscriptions.clear();
        internals.ws = new MockWebSocket() as unknown as WebSocket;
        vi.clearAllMocks();
    });

    it("preserves subscriptions across a transient cleanup (reconnect replay buffer)", () => {
        bitgetWs.subscribe("BTCUSDT", "ticker");
        expect(internals.subscriptions.size).toBe(1);

        // Heartbeat failure, watchdog timeout, socket close — the reconnect
        // handler replays this map, so it must survive.
        internals.cleanup();

        expect(internals.subscriptions.size).toBe(1);
    });

    it("clears subscriptions on destroy()", () => {
        bitgetWs.subscribe("BTCUSDT", "ticker");
        bitgetWs.subscribe("BTCUSDT", "books5");
        expect(internals.subscriptions.size).toBe(2);

        internals.destroy();

        expect(internals.subscriptions.size).toBe(0);
    });

    it("counts from zero again after destroy(), so one unsubscribe still unsubscribes", () => {
        bitgetWs.subscribe("BTCUSDT", "ticker");
        internals.destroy();

        // What killAll() does: every provider destroyed, then the ledger
        // forgets and the next reconcile re-issues everything still wanted.
        internals.ws = new MockWebSocket() as unknown as WebSocket;
        bitgetWs.subscribe("BTCUSDT", "ticker");

        expect(internals.subscriptions.get(TICKER_KEY)).toBe(1);
        // A fresh socket has to be told; the count must not have swallowed it.
        expect((internals.ws as unknown as MockWebSocket).send).toHaveBeenCalledTimes(1);

        // The one consumer goes away — the venue must be told exactly once.
        bitgetWs.unsubscribe("BTCUSDT", "ticker");

        expect(internals.subscriptions.has(TICKER_KEY)).toBe(false);
        expect((internals.ws as unknown as MockWebSocket).send).toHaveBeenCalledTimes(2);
    });
});
