// @vitest-environment happy-dom
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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bitunixWs } from "./bitunixWs";

vi.mock("./logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

type WsInternals = {
  scheduleReconnect: (type: "public" | "private") => void;
  backoffDelayPrivate: number;
  MAX_BACKOFF_DELAY: number;
  reconnectTimerPrivate: ReturnType<typeof setTimeout> | null;
  isReconnectingPrivate: boolean;
  handleMessage: (message: unknown, type: "public" | "private") => void;
  cleanup: (type: "public" | "private") => void;
  destroy: () => void;
  wsPrivate: WebSocket | null;
};

const internals = bitunixWs as unknown as WsInternals;

describe("BitunixWebSocketService private reconnect backoff (BUG-0356)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    internals.cleanup("private");
    internals.backoffDelayPrivate = 1000;
  });

  afterEach(() => {
    internals.cleanup("private");
    vi.useRealTimers();
  });

  it("scales backoff delay exponentially up to MAX_BACKOFF_DELAY on consecutive failures", () => {
    expect(internals.backoffDelayPrivate).toBe(1000);

    // Reconnect attempt 1
    internals.scheduleReconnect("private");
    expect(internals.backoffDelayPrivate).toBe(1500);

    // Fast-forward timer to complete reconnect cycle
    vi.advanceTimersByTime(1000);
    expect(internals.isReconnectingPrivate).toBe(false);

    // Reconnect attempt 2
    internals.scheduleReconnect("private");
    expect(internals.backoffDelayPrivate).toBe(2250);

    vi.advanceTimersByTime(1500);

    // Reconnect attempt 3
    internals.scheduleReconnect("private");
    expect(internals.backoffDelayPrivate).toBe(3375);

    // Multiple attempts scale up and cap at MAX_BACKOFF_DELAY (30000ms)
    for (let i = 0; i < 15; i++) {
      vi.advanceTimersByTime(internals.backoffDelayPrivate);
      internals.scheduleReconnect("private");
    }
    expect(internals.backoffDelayPrivate).toBe(internals.MAX_BACKOFF_DELAY);
  });

  it("resets backoffDelayPrivate to 1000ms upon successful login", () => {
    internals.backoffDelayPrivate = 22500;

    internals.handleMessage({ event: "login", code: 0, msg: "success" }, "private");

    expect(internals.backoffDelayPrivate).toBe(1000);
  });

  it("clears reconnectTimerPrivate and resets backoff on destroy()", () => {
    internals.scheduleReconnect("private");
    expect(internals.reconnectTimerPrivate).not.toBeNull();

    internals.destroy();

    expect(internals.reconnectTimerPrivate).toBeNull();
    expect(internals.backoffDelayPrivate).toBe(1000);
  });

  it("aborts autonomous reconnection and cleans up socket when login fails", () => {
    internals.wsPrivate = { close: vi.fn(), onclose: null } as unknown as WebSocket;

    internals.handleMessage({ event: "login", code: 401, msg: "Invalid API key" }, "private");

    expect(internals.wsPrivate).toBeNull();
    expect(internals.reconnectTimerPrivate).toBeNull();
  });
});
