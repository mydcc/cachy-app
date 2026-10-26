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
    vi.useRealTimers();
  });

  it("counts a scheduled reconnect and keeps the timer", () => {
    internals.scheduleReconnect("private");

    expect(internals.reconnectAttemptsPrivate).toBe(1);
    expect(internals.reconnectTimerPrivate).not.toBeNull();
  });

  it("stops scheduling once the budget is exhausted", () => {
    internals.reconnectAttemptsPrivate = internals.MAX_RECONNECT_ATTEMPTS;
    internals.reconnectTimerPrivate = null;

    internals.scheduleReconnect("private");

    expect(internals.reconnectAttemptsPrivate).toBe(
      internals.MAX_RECONNECT_ATTEMPTS,
    );
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
