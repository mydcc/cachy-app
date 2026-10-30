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
 * The one side-effectful adapter between the registry's opener descriptors and
 * the window/settings/UI stores. Surfaces call `openEntry(entry)`; they never
 * map an entry to `uiState` or `windowManager` themselves.
 *
 * Each branch reproduces the previous click handlers, including the
 * surprising ones: the settings entry toggles its window closed on a second
 * click (`WindowManager.toggle`), while the academy entry only raises an
 * existing window. Unifying those two into "focus if open" would be a
 * behaviour change, not a migration.
 *
 * The journal is the one destination with two call sites that behaved
 * differently: the header toggled the window open/closed, the rail shortcut
 * restored it from the dock. Both stay in this adapter, keyed by window state
 * rather than by surface.
 */

import { get } from "svelte/store";
import { _ } from "../../locales/i18n";
import { settingsState } from "../../stores/settings.svelte";
import { uiState } from "../../stores/ui.svelte";
import { controlCenterUnread } from "../../stores/controlCenterUnread.svelte";
import { windowManager } from "../windows/WindowManager.svelte";
import { ControlCenterWindow } from "../windows/implementations/ControlCenterWindow.svelte";
import type { Entry, Opener } from "./entry-points";

type WindowOpener = Extract<Opener, { kind: "window" }>;
type ToggleTarget = Extract<Opener, { kind: "toggle" }>["target"];

/**
 * A minimized journal is restored (the rail shortcut only exists in that
 * state). Otherwise the header's old toggle semantics apply: open when
 * closed, close when open.
 */
function toggleJournal(opener: WindowOpener): void {
    // Prefer the opener's instance id: `toggleJournalModal` works on the
    // "journal" id, so restoring a same-type window with another id would
    // raise a window the store never touches.
    const minimized = windowManager.windows.find(
        (win) =>
            win.isMinimized &&
            (opener.instance !== undefined
                ? win.id === opener.instance
                : win.windowType === opener.windowType),
    );
    if (minimized) {
        windowManager.bringToFront(minimized.id);
        minimized.restore();
        return;
    }
    void uiState.toggleJournalModal(true);
}

function openWindow(opener: WindowOpener): void {
    switch (opener.windowType) {
        case "journal":
            toggleJournal(opener);
            return;
        case "settings":
            // `toggleSettingsModal(true)` closes an already open settings
            // window. Keep the rail's second click doing what it did before.
            void uiState.toggleSettingsModal(true);
            return;
        case "academy":
            // `openAcademy()` dedupes by window id inside `open()`; doing the
            // lookup here as well would add a second, diverging rule.
            void windowManager.openAcademy();
            return;
        case "controlcenter":
            // Opening is looking: the rail badge clears now rather than after
            // the first focus event inside the fresh window.
            controlCenterUnread.markSeen();
            windowManager.open(
                new ControlCenterWindow({
                    title: get(_)("dashboard.controlCenter.title"),
                }),
            );
            return;
        default:
            // The rail has no other window destinations. A future surface
            // must add its opener here rather than calling a store itself.
            throw new Error(
                `No window opener registered for ${opener.windowType}`,
            );
    }
}

function toggle(target: ToggleTarget): void {
    switch (target) {
        case "market-dashboard":
            uiState.toggleMarketDashboardModal(true);
            return;
        case "alerts":
            uiState.toggleAlertsModal(true);
            return;
        case "assistant":
            uiState.toggleAssistant(!uiState.showAssistant);
            return;
        case "technicals":
            settingsState.showTechnicals = !settingsState.showTechnicals;
            return;
        case "market-overview":
            settingsState.showMarketOverview = !settingsState.showMarketOverview;
            return;
        case "market-activity":
            settingsState.showSidebarActivity = !settingsState.showSidebarActivity;
            return;
        case "market-sentiment":
            settingsState.showMarketSentiment = !settingsState.showMarketSentiment;
            return;
    }
}

export interface EntryHandlers {
    /** Executes a `tab` opener; the host owns the selected-tab state. */
    selectTab?: (tabId: string) => void;
}

/**
 * Executes one registry entry. Window and toggle openers are handled here; a
 * tab opener needs the host's selector because the selected tab is host-local
 * state. An opener without a handler fails loudly instead of rendering a dead
 * control that silently swallows its click.
 */
export function openEntry(entry: Entry, handlers: EntryHandlers = {}): void {
    switch (entry.opener.kind) {
        case "window":
            openWindow(entry.opener);
            return;
        case "toggle":
            toggle(entry.opener.target);
            return;
        case "tab":
            if (!handlers.selectTab) {
                throw new Error(
                    `openEntry cannot execute a tab opener without a selectTab handler (${entry.id})`,
                );
            }
            handlers.selectTab(entry.opener.tabId);
            return;
        case "route":
            throw new Error(
                `openEntry cannot execute a route opener yet (${entry.id})`,
            );
    }
}
