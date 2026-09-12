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

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  resolveReducedMotion,
  prefersReducedMotion,
  subscribeReducedMotion,
  normalizeReduceMotion,
} from "./motion";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveReducedMotion", () => {
  it("honours explicit overrides", () => {
    expect(resolveReducedMotion("reduce", false)).toBe(true);
    expect(resolveReducedMotion("reduce", true)).toBe(true);
    expect(resolveReducedMotion("full", true)).toBe(false);
    expect(resolveReducedMotion("full", false)).toBe(false);
  });

  it("follows the OS signal in system mode", () => {
    expect(resolveReducedMotion("system", true)).toBe(true);
    expect(resolveReducedMotion("system", false)).toBe(false);
  });
});

describe("prefersReducedMotion", () => {
  it("is false without a window (SSR / node)", () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("subscribeReducedMotion", () => {
  it("forwards media-query changes and unsubscribes", () => {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    const mql = {
      matches: false,
      addEventListener: (_type: "change", listener: (event: { matches: boolean }) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: "change", listener: (event: { matches: boolean }) => void) => {
        listeners.delete(listener);
      },
    };
    vi.stubGlobal("window", { matchMedia: () => mql });

    const seen: boolean[] = [];
    const unsubscribe = subscribeReducedMotion((reduced) => seen.push(reduced));

    listeners.forEach((listener) => listener({ matches: true }));
    expect(seen).toEqual([true]);

    unsubscribe();
    expect(listeners.size).toBe(0);
  });

  it("falls back to the legacy addListener API", () => {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    const mql = {
      matches: false,
      addListener: (listener: (event: { matches: boolean }) => void) => listeners.add(listener),
      removeListener: (listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
    };
    vi.stubGlobal("window", { matchMedia: () => mql });

    const seen: boolean[] = [];
    const unsubscribe = subscribeReducedMotion((reduced) => seen.push(reduced));
    listeners.forEach((listener) => listener({ matches: true }));
    expect(seen).toEqual([true]);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });

  it("is a no-op when matchMedia is unavailable", () => {
    vi.stubGlobal("window", {});
    expect(() => subscribeReducedMotion(() => {})()).not.toThrow();
  });
});

describe("normalizeReduceMotion", () => {
  it("keeps known values and defaults the rest", () => {
    expect(normalizeReduceMotion("reduce")).toBe("reduce");
    expect(normalizeReduceMotion("full")).toBe("full");
    expect(normalizeReduceMotion("weird")).toBe("system");
    expect(normalizeReduceMotion(undefined)).toBe("system");
  });
});
