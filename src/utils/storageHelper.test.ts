/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StorageHelper } from "./storageHelper";

function quotaError(): Error {
  const error = new Error("quota exceeded");
  error.name = "QuotaExceededError";
  return error;
}

describe("StorageHelper.safeSave", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves without invoking the quota handler on success", () => {
    const onQuotaExceeded = vi.fn();

    const ok = StorageHelper.safeSave("k", "v", onQuotaExceeded);

    expect(ok).toBe(true);
    expect(localStorage.getItem("k")).toBe("v");
    expect(onQuotaExceeded).not.toHaveBeenCalled();
  });

  it("invokes the quota handler once and retries after cleanup", () => {
    const onQuotaExceeded = vi.fn();
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw quotaError();
    });
    const cleanup = vi.spyOn(StorageHelper, "cleanupCache");

    const ok = StorageHelper.safeSave("k", "v", onQuotaExceeded);

    expect(ok).toBe(true);
    expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("k")).toBe("v");
  });

  it("returns false and stays non-silent when the retry also fails", () => {
    const onQuotaExceeded = vi.fn();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw quotaError();
    });

    const ok = StorageHelper.safeSave("k", "v", onQuotaExceeded);

    expect(ok).toBe(false);
    expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
  });

  it("does not throw when no quota handler is provided", () => {
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw quotaError();
    });

    expect(() => StorageHelper.safeSave("k", "v")).not.toThrow();
  });
});
