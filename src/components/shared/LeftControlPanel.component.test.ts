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
  const translate = (key: string) => getNestedTranslation(key);
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

describe("FEAT-0389: the bell opens the Super-Alert panel", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    uiState.showAlertsModal = false;
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
    uiState.showAlertsModal = false;
  });

  function render() {
    component = mount(LeftControlPanel, { target, props: {} });
    flushSync();
    return target;
  }

  /** Found the way a screen reader finds it, not by a class that may be restyled. */
  function bell(el: HTMLElement) {
    return el.querySelector<HTMLButtonElement>(
      `[aria-label="${getNestedTranslation("dashboard.alerts.panel.open")}"]`,
    );
  }

  it("labels the bell so it is reachable without sight of the icon", () => {
    expect(bell(render())).not.toBeNull();
  });

  it("raises the flag +layout.svelte mounts the panel on", () => {
    const el = render();
    expect(uiState.showAlertsModal).toBe(false);

    bell(el)!.click();
    flushSync();

    expect(uiState.showAlertsModal).toBe(true);
  });

  it("opens rather than toggles, so a second press does not close the panel", () => {
    const el = render();

    bell(el)!.click();
    bell(el)!.click();
    flushSync();

    // toggleAlertsModal(true) is passed an explicit `true`. A bare toggle()
    // here would make the bell a switch, and a trader who pressed it twice
    // looking for the panel would have closed it.
    expect(uiState.showAlertsModal).toBe(true);
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
