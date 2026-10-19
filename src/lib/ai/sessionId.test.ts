/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, expect, it, vi } from "vitest";
import { isSessionId, newSessionId, resolveSessionId } from "./sessionId";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("isSessionId", () => {
  it("accepts a uuid and the plain ids a client may send", () => {
    expect(isSessionId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isSessionId("conversation-42")).toBe(true);
    expect(isSessionId("a".repeat(128))).toBe(true);
  });

  it("rejects values that would break a header", () => {
    expect(isSessionId("not a valid id")).toBe(false);
    expect(isSessionId("abc\r\nX-Evil: 1")).toBe(false);
    expect(isSessionId("a".repeat(129))).toBe(false);
    expect(isSessionId("")).toBe(false);
    expect(isSessionId(undefined)).toBe(false);
    expect(isSessionId(42)).toBe(false);
  });
});

describe("newSessionId", () => {
  it("mints a uuid from the platform rng", () => {
    expect(newSessionId()).toMatch(UUID_RE);
  });

  it("never falls back to Math.random", () => {
    // A header-bound value must not come from a predictable source (BUG-0701).
    const spy = vi.spyOn(Math, "random");
    newSessionId();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("builds a uuid from getRandomValues when randomUUID is unavailable", () => {
    // `randomUUID` is SecureContext-gated; outside a secure context the id
    // still has to exist, or every request would carry a different one.
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => {
        array.fill(7);
        return array;
      },
    });
    try {
      expect(newSessionId()).toMatch(UUID_RE);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("resolveSessionId", () => {
  it("keeps a value that already fits the header shape", () => {
    expect(resolveSessionId("conversation-42")).toBe("conversation-42");
  });

  it("replaces anything else with a fresh id", () => {
    expect(resolveSessionId(null)).toMatch(UUID_RE);
    expect(resolveSessionId(undefined)).toMatch(UUID_RE);
    expect(resolveSessionId("")).toMatch(UUID_RE);
    expect(resolveSessionId("a".repeat(129))).toMatch(UUID_RE);
    expect(resolveSessionId("abc\r\nX-Evil: 1")).toMatch(UUID_RE);
  });

  it("draws the length boundary at 128 characters", () => {
    expect(resolveSessionId("a".repeat(128))).toBe("a".repeat(128));
    expect(resolveSessionId("a".repeat(129))).toMatch(UUID_RE);
  });
});
