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
import { Decimal } from "decimal.js";
import MarketOverview from "./MarketOverview.svelte";
import { marketWatcher } from "../../services/marketWatcher";
import { marketState } from "../../stores/market.svelte";
import { normalizeSymbol } from "../../utils/symbolUtils";

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
  // settings.svelte.ts installs this at module load; the mock must carry it
  // or importing the real settings store fails.
  setTelemetryConsentProvider: vi.fn(),
}));

// No-op fade: the real in:fade transition leaves a WAAPI animation running
// that happy-dom aborts on unmount, which vitest counts as unhandled
// errors (exit 1). Final DOM is identical without the animation.
vi.mock("svelte/transition", async (importOriginal) => {
  const mod = await importOriginal<typeof import("svelte/transition")>();
  return { ...mod, fade: () => ({ duration: 0 }) };
});

vi.mock("../../locales/i18n", () => ({
  _: {
    subscribe: (
      fn: (
        translate: (
          key: string,
          opts?: { values?: Record<string, unknown> },
        ) => string,
      ) => void,
    ) => {
      // Render {values} into the output so tests can assert on
      // interpolated readouts (the key itself carries no placeholders).
      fn((key: string, opts?: { values?: Record<string, unknown> }) => {
        const rendered = Object.entries(opts?.values ?? {})
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(" ");
        return rendered ? `${key} ${rendered}` : key;
      });
      return () => {};
    },
  },
}));

import { settingsState } from "../../stores/settings.svelte";

const A11Y_SYMBOL = "BTCUSDT";
const a11yDataKey = normalizeSymbol(A11Y_SYMBOL, "bitunix");

function seedMarketData(lastPrice: string, changePct: string) {
  marketState.data[a11yDataKey] = {
    symbol: A11Y_SYMBOL,
    lastPrice: new Decimal(lastPrice),
    indexPrice: null,
    markPrice: null,
    fundingRate: null,
    nextFundingTime: null,
    priceChangePercent: new Decimal(changePct),
    klines: {},
  };
}

function mountWithMarketData(lastPrice: string, changePct: string) {
  seedMarketData(lastPrice, changePct);
  const component = mount(MarketOverview, {
    target: document.body,
    props: { customSymbol: A11Y_SYMBOL },
  });
  flushSync();
  flushSync();
  return component;
}

describe("MarketOverview subscription lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsState.showMarketActivity = false;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    delete marketState.data[a11yDataKey];
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

describe("MarketOverview ticking-price announcements", () => {
  it("hides ticking price and percent change from assistive tech", () => {
    const component = mountWithMarketData("67500.50", "2.5");

    const price = document.querySelector(".text-2xl[aria-live='off']");
    expect(price).not.toBeNull();

    const percent = document.querySelector("span.text-sm[aria-live='off']");
    expect(percent).not.toBeNull();
    expect(percent?.textContent).toContain("%");

    unmount(component);
    flushSync();
  });

  it("exposes a polite atomic summary with the current readout", () => {
    const component = mountWithMarketData("67500.50", "2.5");

    const summary = document.querySelector(
      "p.sr-only[aria-live='polite'][aria-atomic='true']",
    );
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain("symbol=BTCUSDT");
    expect(summary?.textContent).toContain("67500");

    unmount(component);
    flushSync();
  });

  it("refreshes the polite summary at most every 30 seconds", () => {
    let now = 1_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const component = mountWithMarketData("67500.50", "2.5");
      const readSummary = () =>
        document.querySelector("p.sr-only")?.textContent ?? "";
      const first = readSummary();
      expect(first).toContain("67500");

      // Tick within the throttle window: readout stays silent.
      now += 10_000;
      seedMarketData("67600.00", "2.6");
      flushSync();
      flushSync();
      expect(readSummary()).toBe(first);

      // First tick after the window: summary refreshes.
      now += 21_000;
      seedMarketData("67700.00", "2.7");
      flushSync();
      flushSync();
      const second = readSummary();
      expect(second).not.toBe(first);
      expect(second).toContain("67700");

      unmount(component);
      flushSync();
    } finally {
      nowSpy.mockRestore();
    }
  });
});
