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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * FEAT-0752 — the drawing tab is read-only by design.
 *
 * What it has to get right: a horizontal line's level is worth showing, a
 * trend line's is not (it is read at arm time and would be stale before the
 * trader finished reading it), and a drawing deleted while the panel is open
 * must say so rather than render an empty form.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../../locales/locales/en.json";
import DrawingTab from "./DrawingTab.svelte";
import { alertPanelState } from "../../../stores/alertPanel.svelte";
import { drawingStore } from "../../../stores/drawings.svelte";
import type { Condition } from "../../../lib/rules/types";

vi.mock("../../../locales/i18n", () => {
  const dictionary = en as Record<string, unknown>;

  function translate(
    path: string,
    options?: { values?: Record<string, unknown> },
  ): string {
    let current: unknown = dictionary;
    for (const part of path.split(".")) {
      if (!current || typeof current !== "object") return path;
      current = (current as Record<string, unknown>)[part];
    }
    if (typeof current !== "string") return path;
    if (!options?.values) return current;
    return Object.entries(options.values).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
      current,
    );
  }

  return {
    _: {
      subscribe: (fn: (val: typeof translate) => void) => {
        fn(translate);
        return () => {};
      },
    },
    locale: { subscribe: (fn: (val: string) => void) => (fn("en"), () => {}) },
  };
});

const condition: Condition = {
  kind: "compare",
  left: { kind: "price", field: "close" },
  op: "gte",
  right: { kind: "constant", value: "70000" },
  timeframe: "1h",
};

function seedDrawing(id: string): void {
  alertPanelState.reset("BTCUSDT");
  alertPanelState.seed({
    symbol: "BTCUSDT",
    tab: "drawing",
    condition,
    drawing: { id, symbol: "BTCUSDT" },
  });
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  host.remove();
});

function render(): string {
  component = mount(DrawingTab, { target: host, props: { symbol: "BTCUSDT" } });
  flushSync();
  return host.textContent ?? "";
}

describe("FEAT-0752: the drawing tab", () => {
  it("shows a horizontal line's fixed level", () => {
    const drawing = drawingStore.addHorizontal("BTCUSDT", "70123.5", "Support");
    seedDrawing(drawing.id);

    const text = render();

    expect(text).toContain("70123.5");
    expect(text).toContain("Horizontal line");
    expect(text).toContain("Support");
  });

  it("does not print a level for a trend line, because it moves", () => {
    const drawing = drawingStore.addTrend(
      "BTCUSDT",
      { ms: 1_000, price: "70000" },
      { ms: 2_000, price: "71000" },
    );
    expect(drawing).not.toBeNull();
    seedDrawing(drawing!.id);

    const text = render();
    const values = [...host.querySelectorAll("dd")].map((dd) => dd.textContent?.trim());

    expect(text).toContain("Trend line");
    expect(values.at(-1)).toBe("follows the line");
  });

  it("shows nothing a trader could type into", () => {
    // The level is the line's; the editable half is the footer the shell owns.
    const drawing = drawingStore.addHorizontal("BTCUSDT", "70123.5");
    seedDrawing(drawing.id);

    render();

    expect(
      host.querySelectorAll("input, select, textarea, [contenteditable]"),
    ).toHaveLength(0);
  });

  it("says the drawing is gone instead of rendering an empty form", () => {
    seedDrawing("deleted-drawing");

    expect(render()).toContain("The drawing no longer exists.");
  });
});
