// @vitest-environment happy-dom
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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0678 — the chart reports the series it drew.
 *
 * The live explanation describes "the values on screen", so it reads the chart's
 * own series instead of computing a second one. This mounts the chart under a
 * parent that stores what it receives (the shape the lesson view uses) and holds
 * the two properties the feature needs: the callback fires with the timeframe
 * the chart actually drew, and it does not fire repeatedly for the same series.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

import { catalogueEntry } from "../../lib/alerts/indicatorCatalogue";
import { readoutSpy, resetReadoutSpy } from "../../tests/helpers/chartReadoutSpy";

// lightweight-charts needs a canvas happy-dom lacks; the chart only has to
// mount for this test, so the series objects are inert.
vi.mock("lightweight-charts", () => {
  const series = () => ({
    setData: vi.fn(),
    applyOptions: vi.fn(),
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
    createPriceLine: vi.fn(),
    removePriceLine: vi.fn(),
  });
  const chart = {
    timeScale: () => ({ fitContent: vi.fn(), applyOptions: vi.fn() }),
    addSeries: vi.fn(() => series()),
    removeSeries: vi.fn(),
    applyOptions: vi.fn(),
    remove: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
  };
  return {
    createChart: vi.fn(() => chart),
    createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn(), detach: vi.fn() })),
    ColorType: { Solid: 0 },
    CandlestickSeries: Symbol("candlestick"),
    LineSeries: Symbol("line"),
  };
});

vi.mock("../../services/marketWatcher", () => ({
  marketWatcher: { register: vi.fn(), unregister: vi.fn(), ensureHistory: vi.fn() },
}));

vi.mock("../../stores/market.svelte", async () => {
  const { marketState } = await import(
    "../../lib/windows/implementations/marketState.helper.svelte"
  );
  return { marketState };
});

vi.mock("../../locales/i18n", async () => {
  const { readable } = await import("svelte/store");
  return {
    _: readable((key: string) => key),
    locale: readable("en"),
    setLocale: vi.fn(),
  };
});

import ChartReadoutHarness from "../../tests/helpers/ChartReadoutHarness.svelte";

describe("IndicatorLessonChart readout (FEAT-0678)", () => {
  beforeEach(() => {
    resetReadoutSpy();
    document.body.innerHTML = "";
  });

  it("reports the drawn series with its timeframe, once per change", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const instance = mount(ChartReadoutHarness, {
      target: host,
      props: { entry: catalogueEntry("rsi") },
    });
    flushSync();

    expect(readoutSpy.calls).toBe(1);
    expect(readoutSpy.last?.timeframe).toBeTruthy();
    expect(readoutSpy.last?.series.lines.length).toBeGreaterThan(0);
    expect(host.querySelector("[data-testid='chart-readout']")?.textContent).toBe(
      readoutSpy.last?.timeframe,
    );

    unmount(instance);
  });
});
