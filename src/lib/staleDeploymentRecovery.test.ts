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

import { afterEach, describe, expect, it, vi } from "vitest";

type Recovery = typeof import("./staleDeploymentRecovery");

// Module keeps an in-memory guard, so every test gets a fresh instance.
async function freshModule(): Promise<Recovery> {
  vi.resetModules();
  return import("./staleDeploymentRecovery");
}

function stubBrowser(
  opts: { preexistingFlag?: boolean; brokenStorage?: boolean } = {},
) {
  const store = new Map<string, string>();
  if (opts.preexistingFlag) store.set("cachy:stale-chunk-reload", "123");

  const sessionStorage = {
    getItem: (key: string): string | null => {
      if (opts.brokenStorage) throw new Error("storage denied");
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string): void => {
      if (opts.brokenStorage) throw new Error("storage denied");
      store.set(key, value);
    },
  };

  const reload = vi.fn();
  vi.stubGlobal("sessionStorage", sessionStorage);
  vi.stubGlobal("location", { reload });
  return { reload, store };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("isStaleChunkError", () => {
  it.each([
    [
      "Chrome",
      "Failed to fetch dynamically imported module: https://dev.cachy.app/_app/immutable/chunks/XDJtinBa2.js",
    ],
    ["Firefox", "error loading dynamically imported module https://x/y.js"],
    ["Safari", "Importing a module script failed."],
  ])("detects %s wording", async (_engine, message) => {
    const { isStaleChunkError } = await freshModule();
    expect(isStaleChunkError(message)).toBe(true);
    expect(isStaleChunkError(new TypeError(message))).toBe(true);
    expect(isStaleChunkError({ message })).toBe(true);
  });

  it.each([
    ["network failure", new TypeError("Failed to fetch")],
    ["generic error", new Error("boom")],
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
    ["object without message", { code: "X" }],
  ])("ignores %s", async (_label, error) => {
    const { isStaleChunkError } = await freshModule();
    expect(isStaleChunkError(error)).toBe(false);
  });
});

describe("scheduleStaleReload", () => {
  it("reloads exactly once and marks the session", async () => {
    const { scheduleStaleReload } = await freshModule();
    const { reload, store } = stubBrowser();

    expect(scheduleStaleReload()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(store.has("cachy:stale-chunk-reload")).toBe(true);

    // Double-fire (unhandledrejection + handleError) must not loop.
    expect(scheduleStaleReload()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads when the flag is already set", async () => {
    const { scheduleStaleReload } = await freshModule();
    const { reload } = stubBrowser({ preexistingFlag: true });

    expect(scheduleStaleReload()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it("still recovers once when sessionStorage is unavailable", async () => {
    const { scheduleStaleReload } = await freshModule();
    const { reload } = stubBrowser({ brokenStorage: true });

    expect(scheduleStaleReload()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(scheduleStaleReload()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("installStaleDeploymentRecovery", () => {
  function stubWindow() {
    const listeners = new Map<string, (event: unknown) => void>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: (event: unknown) => void) =>
        listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    return listeners;
  }

  it("reloads on matching rejections and cleans up on dispose", async () => {
    const mod = await freshModule();
    const listeners = stubWindow();
    const { reload } = stubBrowser();

    const dispose = mod.installStaleDeploymentRecovery();
    expect(listeners.has("unhandledrejection")).toBe(true);

    const preventDefault = vi.fn();
    listeners.get("unhandledrejection")!({
      reason: new TypeError(
        "Failed to fetch dynamically imported module: https://dev.cachy.app/_app/immutable/chunks/XDJtinBa2.js",
      ),
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);

    dispose();
    expect(listeners.has("unhandledrejection")).toBe(false);
  });

  it("leaves unrelated rejections alone", async () => {
    const mod = await freshModule();
    const listeners = stubWindow();
    const { reload } = stubBrowser();

    mod.installStaleDeploymentRecovery();

    const preventDefault = vi.fn();
    listeners.get("unhandledrejection")!({
      reason: new Error("something else"),
      preventDefault,
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
