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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { bitunixWs } from "./bitunixWs";
import { marketState } from "../stores/market.svelte";

vi.mock("./mdaService", () => ({
  mdaService: { normalizeTicker: vi.fn(), normalizeKlines: vi.fn(() => []) },
}));

vi.mock("./logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

// connectPrivate returns early without credentials, before it ever looks at the
// socket — so the force path is only reachable with keys configured.
vi.mock("../stores/settings.svelte", () => ({
  settingsState: {
    apiKeys: { bitunix: { key: "test-key", secret: "test-secret" } },
    capabilities: { marketData: true },
    enableNetworkLogs: false,
  },
}));

vi.mock("../stores/market.svelte", () => ({
  marketState: {
    updateSymbol: vi.fn(),
    updateDepth: vi.fn(),
    updateSymbolKlines: vi.fn(),
    updateTelemetry: vi.fn(),
    connectionStatus: "connected",
  },
}));

/**
 * Two defects found through `no-unused-vars` warnings while burning down the
 * lint backlog (roadmap item 21). Both are the case the roadmap warned about:
 * a variable assigned and never read can equally mean a leftover or a value
 * someone forgot to use, and the linter cannot tell them apart.
 */

type WsInternals = {
  connectPrivate: (force?: boolean) => void;
  handleMessage: (message: unknown, type: "public" | "private") => void;
  cleanup: (which: "public" | "private") => void;
  wsPrivate: unknown;
  isDestroyed: boolean;
  throttleMap?: Map<string, number>;
};

const ws = bitunixWs as unknown as WsInternals;

describe("connectPrivate honours force", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ws.isDestroyed = false;
    ws.throttleMap?.clear();
  });

  /** Stands in for a live authenticated socket. */
  const openSocket = () => ({ readyState: 1 /* OPEN */ });

  it("leaves an open private socket alone when not forced", () => {
    ws.wsPrivate = openSocket();
    const cleanup = vi.spyOn(ws, "cleanup");

    ws.connectPrivate(false);

    expect(cleanup).not.toHaveBeenCalled();
    cleanup.mockRestore();
  });

  it("tears down an open private socket when forced", () => {
    // The defect: `force` was accepted and then ignored, so this path returned
    // early no matter what. connect(force: true) rebuilt the public socket and
    // silently left the authenticated one — the stream carrying order and
    // position updates — running as it was.
    ws.wsPrivate = openSocket();
    const cleanup = vi.spyOn(ws, "cleanup");

    ws.connectPrivate(true);

    expect(cleanup).toHaveBeenCalledWith("private");
    cleanup.mockRestore();
  });
});

describe("depth updates carry the schema-normalised values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ws.throttleMap?.clear();
  });

  it("passes orderbook levels on as strings even when the exchange sends numbers", () => {
    // The defect: the handler validated the payload, bound the normalised
    // arrays, and then passed the *raw* data.b / data.a to marketState — so the
    // SafeString transform that exists to keep levels as strings was skipped.
    ws.handleMessage(
      {
        ch: "depth_book5",
        symbol: "BTCUSDT",
        data: {
          b: [[43567.89, 1.5]],
          a: [[43568.12, 2.25]],
        },
      },
      "public",
    );

    expect(marketState.updateDepth).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(marketState.updateDepth).mock.calls[0] as [
      string,
      { bids: unknown[][]; asks: unknown[][] },
    ];

    expect(payload.bids[0][0]).toBe("43567.89");
    expect(payload.asks[0][0]).toBe("43568.12");
    expect(typeof payload.bids[0][1]).toBe("string");
  });

});
