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

import { connectionManager, ConnectionManager } from "./connectionManager";
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

  describe("notifyVisibilityChange (BUG-0217)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("forces a reconnect when the tab was hidden past the threshold", async () => {
      const bitunix = makeProvider();
      connectionManager.registerProvider("bitunix", bitunix);
      await connectionManager.switchProvider("bitunix", { force: true });
      vi.mocked(bitunix.connect).mockClear();
      vi.mocked(bitunix.destroy).mockClear();

      connectionManager.notifyVisibilityChange(false);
      vi.advanceTimersByTime(20_000); // past the 15s threshold
      connectionManager.notifyVisibilityChange(true);
      await vi.advanceTimersByTimeAsync(0); // let the async switchProvider settle

      expect(bitunix.destroy).toHaveBeenCalledTimes(1);
      expect(bitunix.connect).toHaveBeenCalledWith(true);
    });

    it("does nothing for an ordinary, brief tab switch", async () => {
      const bitunix = makeProvider();
      connectionManager.registerProvider("bitunix", bitunix);
      await connectionManager.switchProvider("bitunix", { force: true });
      vi.mocked(bitunix.connect).mockClear();
      vi.mocked(bitunix.destroy).mockClear();

      connectionManager.notifyVisibilityChange(false);
      vi.advanceTimersByTime(3_000); // well under the threshold
      connectionManager.notifyVisibilityChange(true);
      await vi.advanceTimersByTimeAsync(0);

      expect(bitunix.destroy).not.toHaveBeenCalled();
      expect(bitunix.connect).not.toHaveBeenCalled();
    });

    it("does nothing when the tab becomes visible without having been hidden first", async () => {
      const bitunix = makeProvider();
      connectionManager.registerProvider("bitunix", bitunix);
      await connectionManager.switchProvider("bitunix", { force: true });
      vi.mocked(bitunix.connect).mockClear();
      vi.mocked(bitunix.destroy).mockClear();

      connectionManager.notifyVisibilityChange(true);
      await vi.advanceTimersByTimeAsync(0);

      expect(bitunix.destroy).not.toHaveBeenCalled();
      expect(bitunix.connect).not.toHaveBeenCalled();
    });

    it("does nothing if there is no active provider", async () => {
      // No registerProvider/switchProvider call: activeProvider is still "".
      connectionManager.notifyVisibilityChange(false);
      vi.advanceTimersByTime(20_000);
      // Must not throw despite there being nothing to reconnect.
      expect(() => connectionManager.notifyVisibilityChange(true)).not.toThrow();
    });

    it("only reconnects once per hidden period, not on a second visible event", async () => {
      const bitunix = makeProvider();
      connectionManager.registerProvider("bitunix", bitunix);
      await connectionManager.switchProvider("bitunix", { force: true });
      vi.mocked(bitunix.connect).mockClear();
      vi.mocked(bitunix.destroy).mockClear();

      connectionManager.notifyVisibilityChange(false);
      vi.advanceTimersByTime(20_000);
      connectionManager.notifyVisibilityChange(true);
      await vi.advanceTimersByTimeAsync(0);
      vi.mocked(bitunix.connect).mockClear();
      vi.mocked(bitunix.destroy).mockClear();

      // A second "visible" event with no intervening "hidden" — e.g. a
      // duplicate browser event — must not trigger a second reconnect.
      connectionManager.notifyVisibilityChange(true);
      await vi.advanceTimersByTimeAsync(0);

      expect(bitunix.destroy).not.toHaveBeenCalled();
      expect(bitunix.connect).not.toHaveBeenCalled();
    });

    it("treats a blur/focus pair the same as a hidden/visible pair", async () => {
      // Covers the window-loses-OS-focus case visibilitychange alone misses
      // (e.g. Cachy stays the active tab but the browser window itself is
      // backgrounded on a second monitor).
      const bitunix = makeProvider();
      connectionManager.registerProvider("bitunix", bitunix);
      await connectionManager.switchProvider("bitunix", { force: true });
      vi.mocked(bitunix.connect).mockClear();
      vi.mocked(bitunix.destroy).mockClear();

      connectionManager.notifyVisibilityChange(false); // simulates `blur`
      vi.advanceTimersByTime(20_000);
      connectionManager.notifyVisibilityChange(true); // simulates `focus`
      await vi.advanceTimersByTimeAsync(0);

      expect(bitunix.destroy).toHaveBeenCalledTimes(1);
      expect(bitunix.connect).toHaveBeenCalledWith(true);
    });

    it("is actually wired to real visibilitychange/focus/blur DOM events", async () => {
      // The tests above call notifyVisibilityChange() directly; this one
      // proves the constructor's addEventListener calls are still in place,
      // so a refactor can't silently detach the whole feature while every
      // other test here keeps passing.
      const bitunix = makeProvider();
      connectionManager.registerProvider("bitunix", bitunix);
      await connectionManager.switchProvider("bitunix", { force: true });
      vi.mocked(bitunix.connect).mockClear();
      vi.mocked(bitunix.destroy).mockClear();

      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(20_000);
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);

      expect(bitunix.destroy).toHaveBeenCalledTimes(1);
      expect(bitunix.connect).toHaveBeenCalledWith(true);
    });
  });

  describe("destroy", () => {
    it("removes document and window listeners with exact references on destroy()", () => {
      const docRemoveSpy = vi.spyOn(document, "removeEventListener");
      const winRemoveSpy = vi.spyOn(window, "removeEventListener");
      const docAddSpy = vi.spyOn(document, "addEventListener");
      const winAddSpy = vi.spyOn(window, "addEventListener");

      const manager = new ConnectionManager();

      const visListener = docAddSpy.mock.calls.find((call) => call[0] === "visibilitychange")?.[1];
      const focusListener = winAddSpy.mock.calls.find((call) => call[0] === "focus")?.[1];
      const blurListener = winAddSpy.mock.calls.find((call) => call[0] === "blur")?.[1];

      expect(visListener).toBeDefined();
      expect(focusListener).toBeDefined();
      expect(blurListener).toBeDefined();

      manager.destroy();

      expect(docRemoveSpy).toHaveBeenCalledWith("visibilitychange", visListener);
      expect(winRemoveSpy).toHaveBeenCalledWith("focus", focusListener);
      expect(winRemoveSpy).toHaveBeenCalledWith("blur", blurListener);
    });

    it("clears providers, polling service, and stops pending switches on destroy()", () => {
      const manager = new ConnectionManager();
      const provider = makeProvider();
      const polling = makePolling();
      manager.registerProvider("bitunix", provider);
      manager.registerPolling(polling);

      manager.destroy();

      expect(polling.stopPolling).toHaveBeenCalledTimes(1);
      expect(provider.destroy).toHaveBeenCalledTimes(1);
    });
  });
});
