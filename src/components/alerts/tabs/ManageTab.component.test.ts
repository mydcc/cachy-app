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
 * FEAT-0389 -- "Manage lists armed rules and history with the same behaviour
 * as the current modal".
 *
 * The modal this tab replaced is deleted, so the old behaviour cannot be
 * diffed against a running component any more -- it has to be written down.
 * What it did, and what these tests hold this tab to: an armed alert appears
 * under Active and nowhere else, a fired one appears under History with its
 * fired badge, either can be deleted from its row, and an empty list says so
 * instead of rendering nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../../locales/locales/en.json";
import ManageTab from "./ManageTab.svelte";
import { alertState } from "../../../stores/alerts.svelte";
import type { AlertDefinition } from "../../../services/alertEngine/alertEngine";

// The cutover notice reads localStorage behind a promise and is FEAT-0388's
// concern, not this tab's list behaviour. Answering "no" keeps its banner out
// of the markup these assertions read.
vi.mock("../../../services/alertEngine/cutoverNotice", () => ({
  shouldShowCutoverNotice: () => Promise.resolve(false),
  acknowledgeCutoverNotice: vi.fn(),
}));

const dictionary = en as Record<string, unknown>;

function getNestedTranslation(
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

vi.mock("../../../locales/i18n", () => {
  const translate = (key: string, options?: { values?: Record<string, unknown> }) =>
    getNestedTranslation(key, options);
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

function alert(overrides: Partial<AlertDefinition>): AlertDefinition {
  return {
    id: "alert-1",
    symbol: "BTCUSDT",
    condition: { price_cross_up: "70000" },
    active: true,
    ...overrides,
  } as AlertDefinition;
}

describe("FEAT-0389: ManageTab keeps the old modal's list behaviour", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    alertState.definitions = [];
    alertState.orphanReport = null;
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
    alertState.definitions = [];
  });

  function render() {
    component = mount(ManageTab, { target, props: { symbol: "BTCUSDT" } });
    flushSync();
    return target;
  }

  /** The tab's own Active/History switch, addressed the way a trader sees it. */
  function listTabs(el: HTMLElement) {
    return Array.from(el.querySelectorAll("[role='tab'], .list-tab, button")).filter(
      (b) =>
        b.textContent?.trim() === getNestedTranslation("dashboard.alerts.active") ||
        b.textContent?.trim() === getNestedTranslation("dashboard.alerts.history"),
    ) as HTMLButtonElement[];
  }

  it("lists an armed alert under Active with its symbol and condition", () => {
    alertState.definitions = [alert({ symbol: "ETHUSDT", condition: { price_cross_up: "4200" } })];

    const el = render();
    const rows = el.querySelectorAll(".alert-item");

    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("ETHUSDT");
    expect(rows[0].textContent).toContain("4200");
  });

  it("keeps a fired alert out of Active and shows it under History with its badge", async () => {
    alertState.definitions = [
      alert({ id: "armed", symbol: "BTCUSDT", active: true }),
      alert({ id: "fired", symbol: "SOLUSDT", active: false }),
    ];

    const el = render();
    expect(el.textContent).toContain("BTCUSDT");
    expect(el.querySelectorAll(".alert-item")).toHaveLength(1);

    const history = listTabs(el).find(
      (b) => b.textContent?.trim() === getNestedTranslation("dashboard.alerts.history"),
    );
    history?.click();
    flushSync();

    const rows = el.querySelectorAll(".alert-item");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("SOLUSDT");
    expect(rows[0].querySelector(".fired-badge")).not.toBeNull();
  });

  it("deletes the alert its row names, not the first one in the list", () => {
    alertState.definitions = [
      alert({ id: "keep", symbol: "BTCUSDT" }),
      alert({ id: "drop", symbol: "ETHUSDT" }),
    ];

    const el = render();
    const rows = Array.from(el.querySelectorAll(".alert-item"));
    const ethRow = rows.find((r) => r.textContent?.includes("ETHUSDT"));

    (ethRow?.querySelector(".delete-btn") as HTMLButtonElement).click();
    flushSync();

    expect(alertState.definitions.map((a) => a.id)).toEqual(["keep"]);
  });

  it("says the list is empty rather than rendering an empty box", () => {
    const el = render();

    expect(el.querySelector(".empty-state")?.textContent?.trim()).toBe(
      getNestedTranslation("dashboard.alerts.noActive"),
    );
  });
});
