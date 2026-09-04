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
import MarketOverview from "./MarketOverview.svelte";
import { marketWatcher } from "../../services/marketWatcher";

vi.mock("../../services/logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../services/marketWatcher", () => ({
  marketWatcher: {
    register: vi.fn(),
    unregister: vi.fn(),
  },
}));

vi.mock("../../services/activeTechnicalsManager.svelte", () => ({
  activeTechnicalsManager: {
    register: vi.fn(),
    unregister: vi.fn(),
  },
}));

vi.mock("../../services/trackingService", () => ({
  trackInteraction: vi.fn(),
}));

vi.mock("../../locales/i18n", () => ({
  _: {
    subscribe: (fn: (translate: (key: string) => string) => void) => {
      fn((key: string) => key);
      return () => {};
    },
  },
}));

import { settingsState } from "../../stores/settings.svelte";

describe("MarketOverview subscription lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsState.showMarketActivity = false;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("registers price and ticker exactly once on mount, and unregisters on unmount", () => {
    const component = mount(MarketOverview, {
      target: document.body,
      props: { customSymbol: "BTCUSDT" },
    });
    flushSync();

    expect(marketWatcher.register).toHaveBeenCalledTimes(2);
    expect(marketWatcher.register).toHaveBeenCalledWith("BTCUSDT", "price");
    expect(marketWatcher.register).toHaveBeenCalledWith("BTCUSDT", "ticker");

    unmount(component);
    flushSync();

    expect(marketWatcher.unregister).toHaveBeenCalledTimes(2);
    expect(marketWatcher.unregister).toHaveBeenCalledWith("BTCUSDT", "price");
    expect(marketWatcher.unregister).toHaveBeenCalledWith("BTCUSDT", "ticker");
  });
});
