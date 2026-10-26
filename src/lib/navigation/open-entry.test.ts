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
 * FEAT-0733 -- the opener adapter.
 *
 * The journal is the reason this file exists: the header toggles the window
 * open/closed while the rail shortcut restores a minimized one. Both behaviours
 * live in `openEntry`, keyed by window state, so a surface never has to know
 * which store call to make.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openEntry } from "./open-entry";
import { ENTRY_POINTS, type Entry } from "./entry-points";
import { uiState } from "../../stores/ui.svelte";
import { settingsState } from "../../stores/settings.svelte";
import { windowManager } from "../windows/WindowManager.svelte";
import { ModalWindow } from "../windows/implementations/ModalWindow.svelte";
import EmptyStub from "../../tests/helpers/EmptyStub.svelte";

function entry(id: string): Entry {
  const found = ENTRY_POINTS.find((item) => item.id === id);
  if (!found) throw new Error(`Missing registry entry ${id}`);
  return found;
}

function openJournalWindow() {
  windowManager.open(
    new ModalWindow(EmptyStub, "Journal", {
      id: "journal",
      windowType: "journal",
    }),
  );
  return windowManager.windows.find((win) => win.windowType === "journal")!;
}

describe("FEAT-0733: openEntry", () => {
  let showTechnicals: boolean;
  let showMarketOverview: boolean;
  let showSidebarActivity: boolean;
  let showMarketSentiment: boolean;

  beforeEach(() => {
    showTechnicals = settingsState.showTechnicals;
    showMarketOverview = settingsState.showMarketOverview;
    showSidebarActivity = settingsState.showSidebarActivity;
    showMarketSentiment = settingsState.showMarketSentiment;
    windowManager.close("journal");
    windowManager.close("journal-other");
    windowManager.close("settings");
    windowManager.close("assistant");
    windowManager.close("academy");
    uiState.showMarketDashboardModal = false;
    uiState.showAlertsModal = false;
  });

  afterEach(() => {
    windowManager.close("journal");
    windowManager.close("journal-other");
    windowManager.close("settings");
    windowManager.close("assistant");
    windowManager.close("academy");
    settingsState.showTechnicals = showTechnicals;
    settingsState.showMarketOverview = showMarketOverview;
    settingsState.showSidebarActivity = showSidebarActivity;
    settingsState.showMarketSentiment = showMarketSentiment;
    uiState.showMarketDashboardModal = false;
    uiState.showAlertsModal = false;
    vi.restoreAllMocks();
  });

  it("opens a closed journal through the store", () => {
    const open = vi
      .spyOn(uiState, "toggleJournalModal")
      .mockImplementation(async () => {});

    openEntry(entry("journal"));

    expect(open).toHaveBeenCalledWith(true);
  });

  it("restores a minimized journal instead of closing it", () => {
    const journal = openJournalWindow();
    journal.isMinimized = true;

    openEntry(entry("journal"));

    expect(journal.isMinimized).toBe(false);
    expect(windowManager.windows.find((win) => win.id === "journal")).toBe(
      journal,
    );
  });

  it("ignores a minimized journal window with another instance id", () => {
    windowManager.open(
      new ModalWindow(EmptyStub, "Other journal", {
        id: "journal-other",
        windowType: "journal",
      }),
    );
    const other = windowManager.windows.find(
      (win) => win.id === "journal-other",
    )!;
    other.isMinimized = true;
    const toggle = vi
      .spyOn(uiState, "toggleJournalModal")
      .mockImplementation(async () => {});

    openEntry(entry("journal"));

    expect(other.isMinimized).toBe(true);
    expect(toggle).toHaveBeenCalledWith(true);
  });

  it("leaves an open journal to the store's toggle", () => {
    openJournalWindow();
    const toggle = vi
      .spyOn(uiState, "toggleJournalModal")
      .mockImplementation(async () => {});

    openEntry(entry("journal"));

    // `toggleJournalModal(true)` is `WindowManager.toggle`, which closes an
    // already open journal. Restoring would be the wrong branch here.
    expect(toggle).toHaveBeenCalledWith(true);
  });

  it("toggles the settings window through the store", () => {
    const toggle = vi
      .spyOn(uiState, "toggleSettingsModal")
      .mockImplementation(async () => {});

    openEntry(entry("settings"));

    expect(toggle).toHaveBeenCalledWith(true);
  });

  it("opens the academy through the window manager", () => {
    const openAcademy = vi
      .spyOn(windowManager, "openAcademy")
      .mockImplementation(async () => {});

    openEntry(entry("academy"));

    expect(openAcademy).toHaveBeenCalledTimes(1);
  });

  it("flips every panel toggle", () => {
    openEntry(entry("technicals"));
    openEntry(entry("market-overview"));
    openEntry(entry("market-activity"));
    openEntry(entry("market-sentiment"));

    expect(settingsState.showTechnicals).toBe(!showTechnicals);
    expect(settingsState.showMarketOverview).toBe(!showMarketOverview);
    expect(settingsState.showSidebarActivity).toBe(!showSidebarActivity);
    expect(settingsState.showMarketSentiment).toBe(!showMarketSentiment);
  });

  it("opens the modal surfaces", () => {
    openEntry(entry("dashboard"));
    openEntry(entry("alerts"));

    expect(uiState.showMarketDashboardModal).toBe(true);
    expect(uiState.showAlertsModal).toBe(true);
  });

  it("toggles the assistant through the store", () => {
    const toggle = vi
      .spyOn(uiState, "toggleAssistant")
      .mockImplementation(async () => {});

    openEntry(entry("assistant"));

    expect(toggle).toHaveBeenCalledWith(true);
  });

  it("throws for an opener kind it cannot execute", () => {
    const tabEntry = ENTRY_POINTS.find((item) => item.opener.kind === "tab");

    expect(tabEntry).toBeDefined();
    expect(() => openEntry(tabEntry!)).toThrow(/tab opener/);
  });
});
