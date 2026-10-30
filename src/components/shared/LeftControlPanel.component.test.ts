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
 * FEAT-0389 -- "The panel opens from the bell."
 *
 * The bell is the only entry point a trader has to the Super-Alert panel
 * (FEAT-0395 adds the chart ones on top, it does not replace this). It is one
 * onclick line, which is exactly the kind of wiring that survives a refactor
 * of everything around it and then silently does not.
 *
 * Where the chain continues is asserted elsewhere, deliberately, because each
 * link is testable at a different level: `+layout.svelte` mounts AlertPanel
 * on this flag, AlertPanel opens an AlertPanelWindow, and the window is
 * non-modal by registry config (WindowRegistry.test.ts). What is *not*
 * covered by any unit test is the visual result in a browser -- that the
 * panel lands beside the chart rather than over it. That needs an e2e run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../locales/locales/en.json";
import LeftControlPanel from "./LeftControlPanel.svelte";
import { uiState } from "../../stores/ui.svelte";
import { settingsState } from "../../stores/settings.svelte";
import { windowManager } from "../../lib/windows/WindowManager.svelte";
import { ModalWindow } from "../../lib/windows/implementations/ModalWindow.svelte";
import EmptyStub from "../../tests/helpers/EmptyStub.svelte";

const dictionary = en as Record<string, unknown>;

function getNestedTranslation(path: string): string {
  let current: unknown = dictionary;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

vi.mock("../../locales/i18n", () => {
  const translate = (key: string, options?: { values?: Record<string, unknown> }) => {
    let out = getNestedTranslation(key);
    for (const [name, value] of Object.entries(options?.values ?? {})) {
      out = out.replace(`{${name}}`, String(value));
    }
    return out;
  };
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

describe("FEAT-0749: the bell opens the alerts control center", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    uiState.showAlertsModal = false;
    localStorage.removeItem("cachy_shadow_firings_v1");
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
    uiState.showAlertsModal = false;
    const open = controlCenter();
    if (open) windowManager.close(open.id);
  });

  function render() {
    component = mount(LeftControlPanel, { target, props: {} });
    flushSync();
    return target;
  }

  /** Found the way a screen reader finds it, not by a class that may be restyled. */
  function bell(el: HTMLElement) {
    return el.querySelector<HTMLButtonElement>(
      `[aria-label="${getNestedTranslation("dashboard.controlCenter.title")}"]`,
    );
  }

  function controlCenter() {
    return windowManager.windows.find((win) => win.windowType === "controlcenter");
  }

  it("labels the bell so it is reachable without sight of the icon", () => {
    expect(bell(render())).not.toBeNull();
  });

  it("opens the control center window", () => {
    const el = render();
    expect(controlCenter()).toBeUndefined();

    bell(el)!.click();
    flushSync();

    expect(controlCenter()).toBeDefined();
    expect(uiState.showAlertsModal).toBe(false);
  });

  it("keeps one window, so a second press focuses instead of duplicating", () => {
    const el = render();

    bell(el)!.click();
    flushSync();
    const first = controlCenter();

    bell(el)!.click();
    flushSync();

    expect(controlCenter()).toBe(first);
    expect(windowManager.windows.filter((win) => win.windowType === "controlcenter")).toHaveLength(1);
  });

  it("carries the unread count of firings since the last look", () => {
    const at = Date.now() + 5_000;
    localStorage.setItem(
      "cachy_shadow_firings_v1",
      JSON.stringify({
        schema_version: 1,
        records: [
          {
            source: "rule",
            recordedAtMs: at,
            symbol: "BTCUSDT",
            id: "r-1",
            timeframe: "1m",
            anchorMs: at - 60_000,
            verdict: "Triggered",
          },
        ],
      }),
    );

    const el = render();
    const alerts = Array.from(
      el.querySelectorAll<HTMLButtonElement>("button.control-btn"),
    ).find((button) =>
      button.getAttribute("aria-label")?.startsWith(
        getNestedTranslation("dashboard.controlCenter.title"),
      ),
    );

    expect(alerts?.getAttribute("aria-label")).toContain("1 unread");
    expect(alerts?.querySelector(".rail-badge")?.textContent?.trim()).toBe("1");

    localStorage.removeItem("cachy_shadow_firings_v1");
  });

  it("gives every icon-only control an accessible name", () => {
    const el = render();
    const buttons = Array.from(
      el.querySelectorAll<HTMLButtonElement>("button.control-btn"),
    );

    // The panel ships nine icon-only controls; the journal shortcut renders
    // only while a journal window is minimized, so it is not counted here.
    expect(buttons.length).toBeGreaterThanOrEqual(9);
    for (const button of buttons) {
      expect(
        button.getAttribute("aria-label")?.trim().length ?? 0,
      ).toBeGreaterThan(0);
    }
  });
});

describe("FEAT-0732: the rail renders the entry-point registry", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  function render() {
    component = mount(LeftControlPanel, { target, props: {} });
    flushSync();
    return target;
  }

  function control(el: HTMLElement, key: string) {
    return el.querySelector<HTMLButtonElement>(
      `[aria-label="${getNestedTranslation(key)}"]`,
    );
  }

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    windowManager.close("assistant");
    uiState.showMarketDashboardModal = false;
    settingsState.showTechnicals = false;
    settingsState.showMarketOverview = true;
    settingsState.showSidebarActivity = false;
    settingsState.showMarketSentiment = true;
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
    windowManager.close("journal");
    windowManager.close("assistant");
    uiState.showMarketDashboardModal = false;
    settingsState.showTechnicals = false;
    settingsState.showMarketOverview = true;
    settingsState.showSidebarActivity = false;
    settingsState.showMarketSentiment = true;
  });

  it("renders nine controls, or ten while the journal is minimized", () => {
    const el = render();
    expect(el.querySelectorAll("button.control-btn")).toHaveLength(9);
    expect(control(el, "app.journalButtonTitle")).toBeNull();

    windowManager.open(
      new ModalWindow(EmptyStub, "Journal", {
        id: "journal",
        windowType: "journal",
      }),
    );
    const journal = windowManager.windows.find(
      (win) => win.windowType === "journal",
    )!;
    journal.isMinimized = true;
    flushSync();

    expect(el.querySelectorAll("button.control-btn")).toHaveLength(10);
    expect(control(el, "app.journalButtonTitle")).not.toBeNull();
  });

  it("opens the dashboard and toggles a panel", () => {
    const el = render();

    control(el, "app.marketDashboard.buttonTitle")!.click();
    flushSync();
    expect(uiState.showMarketDashboardModal).toBe(true);

    control(el, "settings.showTechnicals")!.click();
    flushSync();
    expect(settingsState.showTechnicals).toBe(true);
  });

  it("opens settings through the store's toggle, as before", () => {
    const el = render();
    const toggleSettings = vi
      .spyOn(uiState, "toggleSettingsModal")
      .mockImplementation(async () => {});

    try {
      control(el, "settings.title")!.click();
      flushSync();
      expect(toggleSettings).toHaveBeenCalledWith(true);
    } finally {
      toggleSettings.mockRestore();
    }
  });

  it("opens the academy through openAcademy", () => {
    const el = render();
    const openAcademy = vi
      .spyOn(windowManager, "openAcademy")
      .mockImplementation(async () => {});

    try {
      control(el, "academy.title")!.click();
      flushSync();
      expect(openAcademy).toHaveBeenCalledTimes(1);
    } finally {
      openAcademy.mockRestore();
    }
  });

  it("keeps the previous destination order and gives every control an icon", () => {
    const el = render();
    const buttons = Array.from(
      el.querySelectorAll<HTMLButtonElement>("button.control-btn"),
    );

    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      getNestedTranslation("app.marketDashboard.buttonTitle"),
      getNestedTranslation("settings.title"),
      getNestedTranslation("dashboard.controlCenter.title"),
      getNestedTranslation("academy.title"),
      getNestedTranslation("sidePanel.aiAssistant"),
      getNestedTranslation("settings.showTechnicals"),
      getNestedTranslation("settings.toggleMarketTiles"),
      getNestedTranslation("dashboard.marketActivity"),
      getNestedTranslation("settings.toggleMarketSentiment"),
    ]);
    for (const button of buttons) {
      expect(button.querySelector("svg")).not.toBeNull();
    }
  });

  it("keeps the existing active classes", () => {
    windowManager.open(
      new ModalWindow(EmptyStub, "Assistant", {
        id: "assistant",
        windowType: "assistant",
      }),
    );
    settingsState.showTechnicals = true;
    settingsState.showMarketOverview = true;
    settingsState.showSidebarActivity = true;
    settingsState.showMarketSentiment = true;

    const el = render();

    expect(
      control(el, "sidePanel.aiAssistant")!.classList.contains("active"),
    ).toBe(true);
    expect(
      control(el, "settings.showTechnicals")!.classList.contains("active"),
    ).toBe(true);
    expect(
      control(el, "settings.toggleMarketTiles")!.classList.contains("active"),
    ).toBe(true);
    expect(
      control(el, "dashboard.marketActivity")!.classList.contains("active"),
    ).toBe(true);
    expect(
      control(el, "settings.toggleMarketSentiment")!.classList.contains(
        "active",
      ),
    ).toBe(true);
  });

  it("restores a minimized journal window", () => {
    windowManager.open(
      new ModalWindow(EmptyStub, "Journal", {
        id: "journal",
        windowType: "journal",
      }),
    );
    const journal = windowManager.windows.find(
      (win) => win.windowType === "journal",
    )!;
    journal.isMinimized = true;

    const el = render();
    control(el, "app.journalButtonTitle")!.click();
    flushSync();

    expect(journal.isMinimized).toBe(false);
    expect(windowManager.windows.find((win) => win.id === "journal")).toBe(
      journal,
    );
  });
});
