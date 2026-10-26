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
 * Each branch reproduces the rail's previous click handler exactly, including
 * the surprising ones: the settings entry toggles its window closed on a
 * second click (`WindowManager.toggle`), while the academy entry only raises
 * an existing window. Unifying those two into "focus if open" would be a
 * behaviour change, not a migration.
 */

import { settingsState } from "../../stores/settings.svelte";
import { uiState } from "../../stores/ui.svelte";
import { windowManager } from "../windows/WindowManager.svelte";
import type { Entry, Opener } from "./entry-points";

type WindowOpener = Extract<Opener, { kind: "window" }>;
type ToggleTarget = Extract<Opener, { kind: "toggle" }>["target"];

/**
 * The journal shortcut only renders while a journal is minimized, so restore
 * that window rather than raising whichever journal happens to be first.
 */
function restoreJournal(opener: WindowOpener): void {
    const journals = windowManager.windows.filter(
        (win) => win.windowType === opener.windowType,
    );
    const target =
        journals.find((win) => win.isMinimized) ?? journals[0] ?? null;
    if (!target) {
        void uiState.toggleJournalModal(true);
        return;
    }
    windowManager.bringToFront(target.id);
    if (target.isMinimized) target.restore();
}

function openWindow(opener: WindowOpener): void {
    switch (opener.windowType) {
        case "journal":
            restoreJournal(opener);
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

/**
 * Executes one registry entry. Only the opener kinds a migrated surface really
 * uses are implemented; the rest fail loudly instead of rendering a dead
 * control that silently swallows its click.
 */
export function openEntry(entry: Entry): void {
    switch (entry.opener.kind) {
        case "window":
            openWindow(entry.opener);
            return;
        case "toggle":
            toggle(entry.opener.target);
            return;
        case "tab":
        case "route":
            throw new Error(
                `openEntry cannot execute a ${entry.opener.kind} opener yet (${entry.id})`,
            );
    }
}
