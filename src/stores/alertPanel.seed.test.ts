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
 * FEAT-0395 — the seam between an entry point and the panel.
 *
 * The failure this pins down is an ordering one: an entry point necessarily
 * seeds the draft before the panel exists, and the panel blanks the draft when
 * it mounts. Get that wrong and the symptom is "the chart sometimes forgets
 * the price" — intermittent, and nowhere near the code that caused it.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { alertPanelState, DEFAULT_ALERT_PANEL_TABS } from "./alertPanel.svelte";
import type { Condition } from "../lib/rules/types";

const level: Condition = {
  kind: "cross",
  left: { kind: "price", field: "close" },
  direction: "above",
  right: { kind: "constant", value: "61234.57" },
  timeframe: "4h",
};

describe("alertPanelState seeding", () => {
  beforeEach(() => {
    // Singleton store: start every test unmounted, as a fresh page would.
    alertPanelState.closePanel();
    alertPanelState.reset("BTCUSDT");
    alertPanelState.activeTab = "manage";
  });

  it("puts the seeded condition, tab and anchor into the draft", () => {
    alertPanelState.seed({
      symbol: "ETHUSDT",
      tab: "price",
      condition: level,
      timeframe: "4h",
    });

    expect(alertPanelState.activeTab).toBe("price");
    expect(alertPanelState.draft.symbol).toBe("ETHUSDT");
    expect(alertPanelState.draft.trigger_timeframe).toBe("4h");
    expect(alertPanelState.draft.conditions).toMatchObject({
      kind: "group",
      op: "all",
      of: [level],
    });
  });

  it("survives the panel mounting afterwards", () => {
    alertPanelState.seed({ symbol: "ETHUSDT", tab: "price", condition: level });

    // What AlertPanel.svelte does on mount, with the *active trade* symbol —
    // which is not necessarily the chart the trader right-clicked.
    alertPanelState.openFor("BTCUSDT");

    expect(alertPanelState.draft.symbol).toBe("ETHUSDT");
    expect(alertPanelState.draft.conditions).toMatchObject({ of: [level] });
    expect(alertPanelState.activeTab).toBe("price");
  });

  it("consumes the seed, so the next open starts blank", () => {
    alertPanelState.seed({ symbol: "ETHUSDT", tab: "price", condition: level });
    alertPanelState.openFor("BTCUSDT");

    alertPanelState.openFor("BTCUSDT");

    expect(alertPanelState.draft.symbol).toBe("BTCUSDT");
    expect(alertPanelState.draft.conditions).toMatchObject({ of: [] });
  });

  it("opens blank on the trade symbol when nothing seeded it", () => {
    alertPanelState.openFor("SOLUSDT");

    expect(alertPanelState.draft.symbol).toBe("SOLUSDT");
    expect(alertPanelState.draft.conditions).toMatchObject({ of: [] });
  });

  it("arms nothing by itself — a seeded draft is notify-only and unvalidated", () => {
    alertPanelState.seed({ symbol: "ETHUSDT", tab: "price", condition: level });

    expect(alertPanelState.draft.action.consequence_level).toBe("notify");
    expect(alertPanelState.hasValidated).toBe(false);
  });
});

/*
 * FEAT-0752 — the drawing seed.
 *
 * The drawing is not a condition: it is an anchor the evaluator re-reads. The
 * store has to remember which drawing the open draft belongs to so the shell
 * can rebuild the rule at arm time and show the level read-only.
 */
describe("alertPanelState seeding a drawing", () => {
  beforeEach(() => {
    // The store is a module singleton: a test that mounted the panel would
    // otherwise leave it looking mounted to the next one, and a seed would be
    // applied "live" rather than waiting for the mount that consumes it.
    alertPanelState.closePanel();
    alertPanelState.reset("BTCUSDT");
    alertPanelState.activeTab = "manage";
  });

  it("remembers the drawing and opens its tab", () => {
    alertPanelState.seed({
      symbol: "BTCUSDT",
      tab: "drawing",
      condition: level,
      timeframe: "4h",
      drawing: { id: "draw-1", symbol: "BTCUSDT" },
    });

    expect(alertPanelState.drawingDraft).toEqual({
      id: "draw-1",
      symbol: "BTCUSDT",
    });
    expect(alertPanelState.activeTab).toBe("drawing");
  });

  it("keeps the drawing through the mount, and drops it on the next open", () => {
    alertPanelState.seed({
      symbol: "BTCUSDT",
      tab: "drawing",
      condition: level,
      drawing: { id: "draw-1", symbol: "BTCUSDT" },
    });

    // The mount that consumes the seed must keep it: `openFor` is what the
    // panel calls on mount, and clearing here would blank the draft the chart
    // just handed over.
    alertPanelState.openFor("BTCUSDT");
    expect(alertPanelState.drawingDraft).toEqual({
      id: "draw-1",
      symbol: "BTCUSDT",
    });
    expect(alertPanelState.activeTab).toBe("drawing");

    alertPanelState.openFor("BTCUSDT");

    expect(alertPanelState.drawingDraft).toBeNull();
  });

  it("does not resurrect a draft seeded while the panel was already open", () => {
    // A live seed applies to the mounted panel; it must not stay "pending" and
    // come back on the next open as if it were still waiting for a mount.
    alertPanelState.openFor("BTCUSDT");
    alertPanelState.seed({
      symbol: "BTCUSDT",
      tab: "drawing",
      condition: level,
      drawing: { id: "draw-1", symbol: "BTCUSDT" },
    });
    alertPanelState.closePanel();

    alertPanelState.openFor("BTCUSDT");

    expect(alertPanelState.drawingDraft).toBeNull();
  });

  it("keeps the drawing tab out of the default strip", () => {
    expect(DEFAULT_ALERT_PANEL_TABS).not.toContain("drawing");
  });
});
