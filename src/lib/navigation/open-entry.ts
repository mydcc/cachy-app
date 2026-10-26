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
 */

import { settingsState } from "../../stores/settings.svelte";
import { uiState } from "../../stores/ui.svelte";
import { windowManager } from "../windows/WindowManager.svelte";
import type { Entry, Opener } from "./entry-points";

function openWindow(opener: Extract<Opener, { kind: "window" }>): void {
    const existing = windowManager.windows.find(
        (win) => win.windowType === opener.windowType,
    );
    if (existing) {
        windowManager.bringToFront(existing.id);
        if (existing.isMinimized) existing.restore();
        return;
    }

    switch (opener.windowType) {
        case "journal":
            void uiState.toggleJournalModal(true);
            return;
        case "settings":
            void uiState.toggleSettingsModal(true);
            return;
        case "academy":
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

function toggle(target: Extract<Opener, { kind: "toggle" }>["target"]): void {
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

/** Executes one registry entry. Tab/route openers are not used by the rail. */
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
            return;
    }
}
