// @vitest-environment jsdom
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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * BUG-0786 — the locale subscription writes through `StorageHelper.safeSave`.
 * A full quota, or a blocked-storage `SecurityError`, must not escape into
 * whatever UI event changed the language.
 */
describe("locale persistence (BUG-0786)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not throw when the quota is full", async () => {
    const { setLocale } = await import("./i18n");
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    try {
      expect(() => setLocale("de")).not.toThrow();
    } finally {
      setItem.mockRestore();
    }
  });

  it("does not throw when storage is blocked (SecurityError)", async () => {
    const { setLocale } = await import("./i18n");
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    try {
      expect(() => setLocale("de")).not.toThrow();
    } finally {
      setItem.mockRestore();
    }
  });

  it("persists the chosen locale when storage works", async () => {
    const { setLocale } = await import("./i18n");

    setLocale("de");

    expect(localStorage.getItem("locale")).toBe("de");
  });
});
