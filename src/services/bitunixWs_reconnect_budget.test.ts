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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bitunixWs } from "./bitunixWs";

vi.mock("./logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

type WsInternals = {
  scheduleReconnect: (type: "public" | "private") => void;
  reconnectAttemptsPublic: number;
  reconnectAttemptsPrivate: number;
  MAX_RECONNECT_ATTEMPTS: number;
  reconnectTimerPublic: ReturnType<typeof setTimeout> | null;
  reconnectTimerPrivate: ReturnType<typeof setTimeout> | null;
  cleanup: (type: "public" | "private") => void;
  handleMessage: (message: unknown, type: "public" | "private") => void;
  handleOnline: () => void;
  connectPublic: (force?: boolean) => void;
  connectPrivate: (force?: boolean) => void;
};

const internals = bitunixWs as unknown as WsInternals;

describe("BitunixWebSocketService reconnect budget (BUG-0725)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    internals.cleanup("private");
    internals.reconnectAttemptsPrivate = 0;
  });

  afterEach(() => {
    internals.cleanup("private");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("counts a scheduled reconnect and keeps the timer", () => {
    internals.scheduleReconnect("private");

    expect(internals.reconnectAttemptsPrivate).toBe(1);
    expect(internals.reconnectTimerPrivate).not.toBeNull();
  });

  it("switches to a slow probe once the budget is exhausted (BUG-0788)", () => {
    internals.reconnectAttemptsPrivate = internals.MAX_RECONNECT_ATTEMPTS;
    internals.reconnectTimerPrivate = null;
    const connectPrivate = vi
      .spyOn(internals, "connectPrivate")
      .mockImplementation(() => {});

    internals.scheduleReconnect("private");

    // A timer stays alive (the 60 s probe), and the fast counter is untouched
    // until that probe fires.
    expect(internals.reconnectTimerPrivate).not.toBeNull();
    expect(internals.reconnectAttemptsPrivate).toBe(
      internals.MAX_RECONNECT_ATTEMPTS,
    );

    // Exactly 60 s: a probe that fired after the normal 1 s backoff would
    // reinstate the retry storm this budget exists to stop.
    vi.advanceTimersByTime(59_999);
    expect(connectPrivate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(connectPrivate).toHaveBeenCalledTimes(1);

    // One attempt, not twelve: the fast cycle stays closed until an open
    // resets the counter.
    expect(internals.reconnectAttemptsPrivate).toBe(
      internals.MAX_RECONNECT_ATTEMPTS,
    );
  });

  it("probes the public socket too (BUG-0788)", () => {
    internals.reconnectAttemptsPublic = internals.MAX_RECONNECT_ATTEMPTS;
    internals.reconnectTimerPublic = null;
    const connectPublic = vi
      .spyOn(internals, "connectPublic")
      .mockImplementation(() => {});

    internals.scheduleReconnect("public");
    expect(internals.reconnectTimerPublic).not.toBeNull();

    vi.advanceTimersByTime(60_000);

    expect(connectPublic).toHaveBeenCalledTimes(1);
    expect(internals.reconnectAttemptsPublic).toBe(
      internals.MAX_RECONNECT_ATTEMPTS,
    );
  });

  it("keeps the probe alive without connecting while offline (BUG-0788)", () => {
    internals.reconnectAttemptsPrivate = internals.MAX_RECONNECT_ATTEMPTS;
    internals.reconnectTimerPrivate = null;
    const connectPrivate = vi
      .spyOn(internals, "connectPrivate")
      .mockImplementation(() => {});
    internals.scheduleReconnect("private");

    // The network drops while the probe is pending.
    vi.stubGlobal("navigator", { onLine: false });
    vi.advanceTimersByTime(60_000);
    expect(connectPrivate).not.toHaveBeenCalled();
    expect(internals.reconnectTimerPrivate).not.toBeNull();

    vi.stubGlobal("navigator", { onLine: true });
    vi.advanceTimersByTime(60_000);
    expect(connectPrivate).toHaveBeenCalledTimes(1);
  });

  it("re-arms when the probe itself throws instead of dying (BUG-0788)", () => {
    internals.reconnectAttemptsPrivate = internals.MAX_RECONNECT_ATTEMPTS;
    internals.reconnectTimerPrivate = null;
    vi.spyOn(internals, "connectPrivate").mockImplementation(() => {
      throw new TypeError("entitlement unavailable");
    });

    internals.scheduleReconnect("private");
    vi.advanceTimersByTime(60_000);

    // The last recovery path must not end on a thrown error.
    expect(internals.reconnectTimerPrivate).not.toBeNull();
  });

  it("stops rather than re-arming when the connect is declined (BUG-0788)", () => {
    internals.reconnectAttemptsPrivate = internals.MAX_RECONNECT_ATTEMPTS;
    internals.reconnectTimerPrivate = null;
    // A connect that starts no socket: entitlement revoked, key missing.
    vi.spyOn(internals, "connectPrivate").mockImplementation(() => {});

    internals.scheduleReconnect("private");
    vi.advanceTimersByTime(60_000);

    expect(internals.reconnectTimerPrivate).toBeNull();
  });

  it("resets the budget after a successful login", () => {
    internals.reconnectAttemptsPrivate = 7;

    internals.handleMessage({ event: "login", code: 0, msg: "success" }, "private");

    expect(internals.reconnectAttemptsPrivate).toBe(0);
  });

  it("resets both budgets when the browser comes back online", () => {
    internals.reconnectAttemptsPublic = 4;
    internals.reconnectAttemptsPrivate = 7;
    vi.spyOn(internals, "connectPublic").mockImplementation(() => {});
    vi.spyOn(internals, "connectPrivate").mockImplementation(() => {});

    internals.handleOnline();

    expect(internals.reconnectAttemptsPublic).toBe(0);
    expect(internals.reconnectAttemptsPrivate).toBe(0);
  });

  it("resets the budget on destroy()", () => {
    internals.reconnectAttemptsPrivate = 11;

    (bitunixWs as unknown as { destroy(): void }).destroy();

    expect(internals.reconnectAttemptsPrivate).toBe(0);
  });
});
