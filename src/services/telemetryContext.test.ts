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

import { describe, it, expect } from "vitest";
import { buildTelemetryContext } from "./telemetryContext";

const VIEWPORT = { width: 1440, height: 900, devicePixelRatio: 2 };
// Extra fields are deliberate: the builder must read `windowType` only. A
// chart window's id is `chart-BTCUSDT` and carries the watched symbol.
const CHART = {
  id: "chart-BTCUSDT",
  windowType: "chart",
  symbol: "BTCUSDT",
  title: "BTCUSDT",
};
const SETTINGS = { id: "settings", windowType: "settings" };

describe("buildTelemetryContext (BUG-0778)", () => {
  it("reduces windows to their type, never an identifier", () => {
    const context = buildTelemetryContext([CHART, SETTINGS], VIEWPORT);

    expect(context.app_modals).toBe("chart,settings");
    expect(JSON.stringify(context)).not.toContain("BTCUSDT");
  });

  it("sends only the four allowed dimensions", () => {
    const context = buildTelemetryContext([], VIEWPORT);

    expect(Object.keys(context).sort()).toEqual([
      "app_modals",
      "app_version",
      "app_viewport",
      "app_zoom",
    ]);
  });

  it("keeps the viewport and zoom values it was given", () => {
    const context = buildTelemetryContext([], VIEWPORT);

    expect(context.app_viewport).toBe("1440x900");
    expect(context.app_zoom).toBe(2);
  });

  it("keeps an empty window list empty", () => {
    expect(buildTelemetryContext([], VIEWPORT).app_modals).toBe("");
  });
});
