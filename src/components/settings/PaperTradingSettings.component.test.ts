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
 * FEAT-0800 — which paper-trading explanations stay readable.
 *
 * The mode explanation describes what the simulator actually does and belongs
 * behind the marker. The failure-mode line does not: it is the only place that
 * says the choice applies to the next order, and without it the buttons read
 * like a log filter. That asymmetry is what this pins.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../locales/locales/en.json";

vi.mock("../../locales/i18n", async () => {
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

vi.mock("../../services/paperTradingService", () => ({
  paperTradingService: { setEnabled: vi.fn(), resetBook: vi.fn() },
}));

vi.mock("../../stores/modal.svelte", () => ({
  modalState: { show: vi.fn(async () => false) },
}));

import PaperTradingSettings from "./PaperTradingSettings.svelte";

function translation(key: string): string {
  return key
    .split(".")
    .reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], en) as string;
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  component = mount(PaperTradingSettings, { target: host });
  flushSync();
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  host.remove();
});

describe("Paper trading help text (FEAT-0800)", () => {
  it("moves the mode explanation behind the marker", () => {
    expect(host.textContent).not.toContain(
      translation("settings.paper.modeDescription"),
    );
    expect(host.querySelector(".info-tip")).not.toBeNull();
  });

  it("keeps the failure-mode explanation visible", () => {
    expect(host.textContent).toContain(
      translation("settings.paper.failureDescription"),
    );
  });
});
