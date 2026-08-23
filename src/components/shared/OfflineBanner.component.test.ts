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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
import OfflineBanner from "./OfflineBanner.svelte";
import { marketState } from "../../stores/market.svelte";
import { settingsState } from "../../stores/settings.svelte";
import { uiState } from "../../stores/ui.svelte";
import { connectionManager } from "../../services/connectionManager";
import { toastService } from "../../services/toastService.svelte";

vi.mock("../../services/logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const dictionary = en as Record<string, unknown>;
function getNestedTranslation(
  path: string,
  options?: { values?: Record<string, unknown> },
): string {
  const parts = path.split(".");
  let current: unknown = dictionary;
  for (const part of parts) {
    if (!current || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === "string") {
    if (options?.values) {
      let result = current;
      for (const [k, v] of Object.entries(options.values)) {
        result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
      return result;
    }
    return current;
  }
  return path;
}

vi.mock("../../locales/i18n", () => {
  const translate = (
    key: string,
    options?: { values?: Record<string, unknown> },
  ) => getNestedTranslation(key, options);
  return {
    _: {
      subscribe: (fn: (val: typeof translate) => void) => {
        fn(translate);
        return () => {};
      },
    },
    locale: {
      subscribe: (fn: (val: string) => void) => {
        fn("en");
        return () => {};
      },
    },
  };
});

describe("BUG-0250: OfflineBanner Component Tests", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    vi.spyOn(connectionManager, "switchProvider").mockResolvedValue(undefined);
    vi.spyOn(toastService, "info").mockImplementation(() => "toast-id");
    vi.spyOn(toastService, "error").mockImplementation(() => "toast-id");
    vi.spyOn(uiState, "openSettings").mockImplementation(() => {});
  });

  afterEach(() => {
    if (component) {
      unmount(component);
      component = null;
    }
    if (target && target.parentNode) {
      target.parentNode.removeChild(target);
    }
    vi.restoreAllMocks();
  });

  it("renders when connectionStatus is disconnected", async () => {
    marketState.connectionStatus = "disconnected";
    component = mount(OfflineBanner, { target });
    flushSync();

    const banner = target.querySelector('[data-testid="offline-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Connection Lost");
  });

  it("renders when connectionStatus is error", async () => {
    marketState.connectionStatus = "error";
    component = mount(OfflineBanner, { target });
    flushSync();

    const banner = target.querySelector('[data-testid="offline-banner"]');
    expect(banner).not.toBeNull();
  });

  it("is hidden when connectionStatus is connected", async () => {
    marketState.connectionStatus = "connected";
    component = mount(OfflineBanner, { target });
    flushSync();

    const banner = target.querySelector('[data-testid="offline-banner"]');
    expect(banner).toBeNull();
  });

  it("triggers connectionManager.switchProvider on Reconnect click", async () => {
    marketState.connectionStatus = "disconnected";
    settingsState.apiProvider = "bitunix";

    component = mount(OfflineBanner, { target });
    flushSync();

    const buttons = target.querySelectorAll("button");
    const reconnectBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Reconnect"),
    );
    expect(reconnectBtn).toBeDefined();

    reconnectBtn?.click();
    flushSync();

    expect(connectionManager.switchProvider).toHaveBeenCalledWith("bitunix", {
      force: true,
    });
  });

  it("shows error toast if Reconnect fails", async () => {
    marketState.connectionStatus = "disconnected";
    settingsState.apiProvider = "bitunix";
    vi.spyOn(connectionManager, "switchProvider").mockRejectedValue(new Error("Connection error"));

    component = mount(OfflineBanner, { target });
    flushSync();

    const buttons = target.querySelectorAll("button");
    const reconnectBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Reconnect"),
    );
    expect(reconnectBtn).toBeDefined();

    reconnectBtn?.click();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();

    expect(toastService.error).toHaveBeenCalledWith("Reconnection failed");
  });

  it("toggles provider, reconnects and displays toast on Switch Provider click", async () => {
    marketState.connectionStatus = "disconnected";
    settingsState.apiProvider = "bitunix";

    component = mount(OfflineBanner, { target });
    flushSync();

    const buttons = target.querySelectorAll("button");
    const switchBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Switch Provider"),
    );
    expect(switchBtn).toBeDefined();

    switchBtn?.click();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();

    expect(settingsState.apiProvider).toBe("bitget");
    expect(connectionManager.switchProvider).toHaveBeenCalledWith("bitget", {
      force: true,
    });
    expect(toastService.info).toHaveBeenCalledWith("Provider switched to Bitget");
  });

  it("shows error toast if Switch Provider fails", async () => {
    marketState.connectionStatus = "disconnected";
    settingsState.apiProvider = "bitunix";
    vi.spyOn(connectionManager, "switchProvider").mockRejectedValue(new Error("Switch error"));

    component = mount(OfflineBanner, { target });
    flushSync();

    const buttons = target.querySelectorAll("button");
    const switchBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Switch Provider"),
    );
    expect(switchBtn).toBeDefined();

    switchBtn?.click();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();

    expect(toastService.error).toHaveBeenCalledWith("Failed to switch to Bitget");
  });

  it("opens settings modal on Check Settings click", async () => {
    marketState.connectionStatus = "disconnected";

    component = mount(OfflineBanner, { target });
    flushSync();

    const buttons = target.querySelectorAll("button");
    const settingsBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Check Settings"),
    );
    expect(settingsBtn).toBeDefined();

    settingsBtn?.click();
    flushSync();

    expect(uiState.openSettings).toHaveBeenCalledWith("connections");
  });
});
