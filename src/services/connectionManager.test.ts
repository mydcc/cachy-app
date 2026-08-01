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

vi.mock("../stores/market.svelte", () => ({
  marketState: {
    connectionStatus: "disconnected",
  },
}));

vi.mock("./logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { connectionManager } from "./connectionManager";
import type { ManagedService, PollingService } from "./connectionManager";

function makeProvider() {
  return {
    connect: vi.fn(),
    destroy: vi.fn(),
  } satisfies ManagedService;
}

function makePolling() {
  return {
    stopPolling: vi.fn(),
    resumePolling: vi.fn(),
    resync: vi.fn(),
  } satisfies PollingService;
}

describe("ConnectionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("kills the old provider before connecting the new one on switchProvider", async () => {
    const bitunix = makeProvider();
    const bitget = makeProvider();
    connectionManager.registerProvider("bitunix", bitunix);
    connectionManager.registerProvider("bitget", bitget);

    await connectionManager.switchProvider("bitunix", { force: true });
    expect(bitunix.connect).toHaveBeenCalledTimes(1);
    expect(bitget.destroy).toHaveBeenCalledTimes(1); // killAll() tears down every registered provider

    vi.mocked(bitunix.destroy).mockClear();
    vi.mocked(bitget.destroy).mockClear();

    await connectionManager.switchProvider("bitget", { force: true });

    expect(bitunix.destroy).toHaveBeenCalledTimes(1);
    expect(bitget.connect).toHaveBeenCalledTimes(1);
  });

  it("resyncs subscriptions instead of stopping the polling fallback when a provider connects", async () => {
    const bitunix = makeProvider();
    const polling = makePolling();
    connectionManager.registerProvider("bitunix", bitunix);
    connectionManager.registerPolling(polling);

    await connectionManager.switchProvider("bitunix", { force: true });
    // switchProvider's own killAll()/resumePolling() bridge already touched
    // these mocks; clear them so the assertions below only see what
    // onProviderConnected itself does.
    vi.mocked(polling.resumePolling).mockClear();
    vi.mocked(polling.stopPolling).mockClear();

    connectionManager.onProviderConnected("bitunix");

    expect(polling.resync).toHaveBeenCalledTimes(1);
    expect(polling.stopPolling).not.toHaveBeenCalled();
  });

  it("destroys a late connection report from a provider that is no longer active", async () => {
    const bitunix = makeProvider();
    const bitget = makeProvider();
    connectionManager.registerProvider("bitunix", bitunix);
    connectionManager.registerProvider("bitget", bitget);

    await connectionManager.switchProvider("bitget", { force: true });
    vi.mocked(bitunix.destroy).mockClear();

    // A stale onopen from the provider we just switched away from.
    connectionManager.onProviderConnected("bitunix");

    expect(bitunix.destroy).toHaveBeenCalledTimes(1);
  });

  it("resumes polling when the active provider disconnects", async () => {
    const bitunix = makeProvider();
    const polling = makePolling();
    connectionManager.registerProvider("bitunix", bitunix);
    connectionManager.registerPolling(polling);

    await connectionManager.switchProvider("bitunix", { force: true });
    vi.mocked(polling.resumePolling).mockClear();

    connectionManager.onProviderDisconnected("bitunix");

    expect(polling.resumePolling).toHaveBeenCalledTimes(1);
  });
});
