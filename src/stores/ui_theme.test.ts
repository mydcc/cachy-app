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

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));

import { uiState } from "./ui.svelte";

describe("uiState Theme Transitions & Management", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.body.className = "";
    localStorage.clear();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should switch theme and apply theme classes to DOM", () => {
    uiState.setTheme("light");
    expect(uiState.currentTheme).toBe("light");
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);
    expect(document.documentElement.style.backgroundColor).toBe("rgb(241, 245, 249)");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("should use View Transitions API when supported", () => {
    const startViewTransitionMock = vi.fn((cb: () => void) => cb());
    (document as unknown as { startViewTransition?: (cb: () => void) => void }).startViewTransition = startViewTransitionMock;

    uiState.setTheme("dracula");
    expect(startViewTransitionMock).toHaveBeenCalled();
    expect(uiState.currentTheme).toBe("dracula");
    expect(document.documentElement.classList.contains("theme-dracula")).toBe(true);

    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });

  it("should use theme-transitioning class fallback when View Transitions API is not present", () => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;

    uiState.setTheme("matrix");
    expect(uiState.currentTheme).toBe("matrix");
    expect(document.documentElement.classList.contains("theme-transitioning")).toBe(true);
    expect(document.documentElement.classList.contains("theme-matrix")).toBe(true);

    vi.advanceTimersByTime(250);
    expect(document.documentElement.classList.contains("theme-transitioning")).toBe(false);
  });

  it("should save selected theme to localStorage and cookie", () => {
    uiState.setTheme("solarized-dark");
    expect(localStorage.getItem("cachy_theme")).toBe("solarized-dark");
    expect(document.cookie).toContain("cachy_theme=solarized-dark");
  });
});
