<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
    import { uiState } from "../../stores/ui.svelte";
    import type { Component } from "svelte";
    import SettingsTabBar from "./SettingsTabBar.svelte";
    import {
        getSettingsTabEntries,
        getSettingsTabId,
    } from "../../lib/navigation/settings-tabs";

    // New Tab Components
    import TradingTab from "./tabs/TradingTab.svelte";
    import AutomationTab from "./tabs/AutomationTab.svelte";
    import ChartTab from "./tabs/ChartTab.svelte";
    import VisualsTab from "./tabs/VisualsTab.svelte";
    import AiTab from "./tabs/AiTab.svelte";
    import ConnectionsTab from "./tabs/ConnectionsTab.svelte";
    import SystemTab from "./tabs/SystemTab.svelte";
    import CloudTab from "./tabs/CloudTab.svelte";

    // Tab State
    const activeTab = $derived(uiState.settingsTab || "trading");

    /**
     * The rail's destinations (ids, labels, icons) come from the registry
     * through `SettingsTabBar`. This map owns only the tab bodies: the
     * registry models destinations, not what a destination renders.
     *
     * `tabs` is built from the registry ids, so a tab without a body fails at
     * init instead of rendering an empty panel, and the ids/order cannot drift
     * from the rail.
     */
    const SETTINGS_TAB_CONTENT: Record<string, Component> = {
        trading: TradingTab,
        automation: AutomationTab,
        chart: ChartTab,
        visuals: VisualsTab,
        ai: AiTab,
        connections: ConnectionsTab,
        system: SystemTab,
        cloud: CloudTab,
    };

    const tabs = getSettingsTabEntries().map((entry) => {
        const id = getSettingsTabId(entry);
        const component = SETTINGS_TAB_CONTENT[id];
        if (!component) throw new Error(`No settings content for ${id}`);
        return { id, component };
    });

</script>

<div
    class="flex flex-col md:flex-row flex-1 w-full h-full overflow-hidden bg-[var(--bg-primary)]"
>
    <!-- Sidebar Navigation -->
    <SettingsTabBar
        active={activeTab}
        onSelect={(id) => (uiState.settingsTab = id)}
    />

    <!-- Tab Content Area -->
    <!-- Container queries below measure THIS width (the settings window),
         not the viewport: @container makes the content a query container. -->
    <div class="@container flex-1 overflow-y-auto p-[var(--density-section-padding)] md:p-[var(--density-section-padding-md)] custom-scrollbar">
        {#each tabs as tab (tab.id)}
            {#if tab.id === activeTab}
                {@const ActiveTab = tab.component}
                <ActiveTab />
            {/if}
        {/each}
    </div>
</div>

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 10px;
    }
</style>
