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

/**
 * FEAT-0389 -- the "beside it" half of "the chart stays visible and
 * interactive beside it".
 *
 * The other half is registry flags (WindowRegistry.test.ts): no backdrop, no
 * close-on-blur. Those keep the chart usable but say nothing about *where*
 * the panel lands. A non-modal window that opens centred still covers the
 * candles it was built not to cover, and the trader's only recourse is to
 * drag it aside on every single open.
 *
 * So the docking is asserted here, at the one place it is decided.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AlertPanelWindow } from "./AlertPanelWindow.svelte";

/** Mirrors EDGE_MARGIN_PX in the class under test. */
const EDGE_MARGIN_PX = 12;

describe("AlertPanelWindow docks beside the chart (FEAT-0389)", () => {
  const originalWidth = window.innerWidth;

  function setViewportWidth(px: number) {
    Object.defineProperty(window, "innerWidth", {
      value: px,
      configurable: true,
      writable: true,
    });
  }

  beforeEach(() => {
    localStorage.clear();
    setViewportWidth(1600);
  });

  afterEach(() => {
    localStorage.clear();
    setViewportWidth(originalWidth);
  });

  it("opens against the right edge, leaving the chart the rest of the viewport", () => {
    const panel = new AlertPanelWindow({ title: "Alerts" });

    expect(panel.x).toBe(1600 - panel.width - EDGE_MARGIN_PX);
    expect(panel.y).toBe(EDGE_MARGIN_PX);
  });

  it("leaves room to the left rather than filling the screen", () => {
    const panel = new AlertPanelWindow({ title: "Alerts" });

    // The criterion in one assertion: something else can be seen and used
    // beside the panel. A panel wider than its viewport would satisfy
    // "docked right" and still cover everything.
    expect(panel.x).toBeGreaterThan(0);
  });

  it("stays on screen on a narrow viewport instead of sliding off the left", () => {
    setViewportWidth(320);

    const panel = new AlertPanelWindow({ title: "Alerts" });

    expect(panel.x).toBe(EDGE_MARGIN_PX);
  });

  it("does not overrule a position the trader chose earlier", () => {
    const first = new AlertPanelWindow({ title: "Alerts" });
    // WindowBase's own persistence key -- the same one hasPersistedPosition()
    // probes. Written directly because dragging cannot be simulated here.
    localStorage.setItem(
      `cachy_win_${first.id}`,
      JSON.stringify({ x: 40, y: 80, width: first.width, height: first.height }),
    );

    const reopened = new AlertPanelWindow({ title: "Alerts" });

    // Docking is a starting position, not a cage: the constructor must leave
    // the persisted geometry for restoreState() to apply.
    expect(reopened.x).not.toBe(1600 - reopened.width - EDGE_MARGIN_PX);
  });

  it("fires the caller's onclose however the window was closed", () => {
    let closed = 0;
    const panel = new AlertPanelWindow({ title: "Alerts", onclose: () => (closed += 1) });

    panel.destroy();

    expect(closed).toBe(1);
  });
});
