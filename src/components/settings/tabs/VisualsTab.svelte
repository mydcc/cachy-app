<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { uiState } from "../../../stores/ui.svelte";
    import type { Component } from "svelte";
    import TabBar from "../TabBar.svelte";
    import VisualsLayout from "./VisualsLayout.svelte";
    import VisualsAppearance from "./VisualsAppearance.svelte";
    import VisualsBackground from "./VisualsBackground.svelte";

    let { themes } = $props<{
        themes: Array<{ value: string; label: string }>;
    }>();

    const activeSubTab = $derived(uiState.settingsVisualsSubTab);

    /**
     * FEAT-0607: sub-tabs stay — they are the same navigation as the main rail,
     * rendered through the same component. The list is also the render order,
     * so a fourth sub-tab is one entry rather than another `{#if}` branch.
     */
    type SubTabDef = {
        id: string;
        label: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component: Component<any>;
        props?: Record<string, unknown>;
    };

    const subTabs: SubTabDef[] = $derived([
        {
            id: "appearance",
            label: $_("settings.visuals.subtabs.appearance"),
            component: VisualsAppearance,
            props: { themes },
        },
        {
            id: "layout",
            label: $_("settings.visuals.subtabs.layout"),
            component: VisualsLayout,
        },
        {
            id: "background",
            label: $_("settings.visuals.subtabs.background"),
            component: VisualsBackground,
        },
    ]);
</script>

<div class="visuals-tab flex flex-col gap-3 sm:gap-4 md:gap-6" role="tabpanel" id="tab-visuals">
    <TabBar
        tabs={subTabs}
        active={activeSubTab}
        onSelect={(id) => (uiState.settingsVisualsSubTab = id)}
        variant="pills"
        ariaLabel={$_("settings.visuals.subtabs.label")}
    />

    <div class="min-w-0">
        {#each subTabs as tab (tab.id)}
            {#if tab.id === activeSubTab}
                {@const ActiveTab = tab.component}
                <ActiveTab {...tab.props} />
            {/if}
        {/each}
    </div>
</div>
