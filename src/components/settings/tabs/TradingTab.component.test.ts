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
 * FEAT-0800 — the Trading tab after the explanations moved behind the "i".
 *
 * Two regressions are worth pinning here.
 *
 * The marker must not be a descendant of the `<label>` that names a switch. A
 * click on a `tabindex` span is not interactive content, so a label forwards it
 * to the control it labels — clicking "why?" would flip the setting and, on
 * touch, never show the tooltip at all. That is structural and is what this
 * asserts; a DOM click in happy-dom does not reproduce the browser's label
 * forwarding, so an event-based test here would pass either way.
 *
 * And the explanations must actually be gone from the visible copy: a key that
 * quietly reappears as a paragraph would bring the wall of text back without
 * failing anything else.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../../locales/locales/en.json";

const ui = vi.hoisted(() => ({ settingsTradingSubTab: "market" }));

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

vi.mock("../../../stores/ui.svelte", () => ({ uiState: ui }));

// The market sub-tab is the surface under test. The other panels drag whole
// service graphs into the module graph for no assertion here.
vi.mock("../PaperTradingSettings.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));
vi.mock("../RiskLimitsSettings.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));
vi.mock("../ConfirmationSettings.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));
vi.mock("../NotificationSettings.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));
vi.mock("../ExternalChannelSettings.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));
vi.mock("../OrderAuditSettings.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));

import TradingTab from "./TradingTab.svelte";
import { settingsState } from "../../../stores/settings.svelte";

function translation(key: string): string {
  return key
    .split(".")
    .reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], en) as string;
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;
let showTooltipsBefore: boolean;
let journalPaperTradesBefore: boolean;

function toggleCardContaining(text: string): HTMLElement {
  const card = [...host.querySelectorAll<HTMLElement>(".toggle-card")].find((element) =>
    element.textContent?.includes(text),
  );
  if (!card) throw new Error(`no toggle card carrying "${text}"`);
  return card;
}

beforeEach(() => {
  showTooltipsBefore = settingsState.showTooltips;
  journalPaperTradesBefore = settingsState.journalPaperTrades;
  settingsState.showTooltips = true;
  ui.settingsTradingSubTab = "market";

  host = document.createElement("div");
  document.body.appendChild(host);
  component = mount(TradingTab, { target: host });
  flushSync();
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  host.remove();
  settingsState.showTooltips = showTooltipsBefore;
  settingsState.journalPaperTrades = journalPaperTradesBefore;
});

describe("Trading tab help markers (FEAT-0800)", () => {
  it("keeps the marker out of the toggle label, so clicking it cannot flip the setting", () => {
    const card = toggleCardContaining(
      translation("settings.trading.journalPaperTrades"),
    );

    expect(card.querySelector(".info-tip")).not.toBeNull();
    expect(card.querySelector("label .info-tip")).toBeNull();
  });

  it("does not render the moved explanations as visible copy", () => {
    expect(host.textContent).not.toContain(
      translation("settings.trading.journalPaperTradesDesc"),
    );
    expect(host.textContent).not.toContain(
      translation("settings.stalePriceBadgeDesc"),
    );
  });

  it("keeps the broker-rate instruction visible next to the inputs", () => {
    expect(host.textContent).toContain(translation("settings.feeRatesNote"));
  });

  it("hides the marker instead of leaving a dead icon when tooltips are off", () => {
    expect(host.querySelector(".info-tip")).not.toBeNull();

    settingsState.showTooltips = false;
    flushSync();

    expect(host.querySelector(".info-tip")).toBeNull();
  });
});
