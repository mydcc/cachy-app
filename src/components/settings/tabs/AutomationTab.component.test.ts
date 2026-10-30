// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more
 * details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * FEAT-0749 — the Automation tab after the bots moved out.
 *
 * Two things are worth pinning here. The bots are gone, so a trader who knows
 * the old screen is not left with a stale copy to keep in sync. And the tab
 * reaches the desk through the registry entry rather than opening a window of
 * its own, so the rail badge and the singleton rule keep holding when the
 * settings tab was the opener.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../../locales/locales/en.json";
import { ENTRY_POINTS } from "../../../lib/navigation/entry-points";

const mocks = vi.hoisted(() => ({ openEntry: vi.fn() }));

vi.mock("../../../lib/navigation/open-entry", () => ({ openEntry: mocks.openEntry }));

vi.mock("../../../locales/i18n", async () => {
  const { readable } = await import("svelte/store");
  const translate = (key: string) => {
    let value: unknown = en;
    for (const part of key.split(".")) {
      value = (value as Record<string, unknown>)?.[part];
    }
    return typeof value === "string" ? value : key;
  };
  return { _: readable(translate), locale: readable("en") };
});

vi.mock("../PaperTradingSettings.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));

vi.mock("../RiskLimitsSettings.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));

import AutomationTab from "./AutomationTab.svelte";

function translation(key: string): string {
  return key
    .split(".")
    .reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], en) as string;
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  component = mount(AutomationTab, { target: host });
  flushSync();
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  host.remove();
});

describe("AutomationTab after the bots moved", () => {
  it("says where the bots went instead of listing them", () => {
    expect(host.textContent).toContain(translation("settings.automation.botsMoved"));
    expect(host.querySelector("#promote-stop-distance")).toBeNull();
    expect(
      [...host.querySelectorAll("button")].some(
        (element) => element.textContent?.trim() === translation("settings.automation.promote"),
      ),
    ).toBe(false);
  });

  it("keeps the account and the risk limits in the tab", () => {
    expect(host.textContent).toContain(translation("settings.automation.account"));
  });

  it("opens the control center through the registry entry", () => {
    const link = [...host.querySelectorAll("button")].find(
      (element) => element.textContent?.trim() === translation("settings.automation.openBots"),
    );
    expect(link).toBeDefined();

    link!.click();

    expect(mocks.openEntry).toHaveBeenCalledTimes(1);
    expect(mocks.openEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "alerts" }),
    );
    // The entry, not an ad-hoc window: this is what carries the badge clear
    // and the one-instance rule that PR A put on the rail.
    const alertsEntry = ENTRY_POINTS.find((entry) => entry.id === "alerts");
    expect(mocks.openEntry.mock.calls[0][0]).toBe(alertsEntry);
  });
});
