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
    import VisualsLayout from "./VisualsLayout.svelte";
    import VisualsAppearance from "./VisualsAppearance.svelte";
    import VisualsBackground from "./VisualsBackground.svelte";

    let { themes } = $props<{
        themes: Array<{ value: string; label: string }>;
    }>();

    const activeSubTab = $derived(uiState.settingsVisualsSubTab);

    const subTabs = [
        {
            id: "appearance",
            label: $_("settings.visuals.subtabs.appearance"),
        },
        { id: "layout", label: $_("settings.visuals.subtabs.layout") },
        {
            id: "background",
            label: $_("settings.visuals.subtabs.background"),
        },
        // We can add a dedicated tab if it gets too crowded, 
        // but for now sticking to "Background" sub-section is fine.
    ];
</script>

<div class="visuals-tab flex flex-col gap-3 sm:gap-4 md:gap-6" role="tabpanel" id="tab-visuals">
    <!-- Sub-Navigation -->
    <div
        class="flex gap-2 overflow-x-auto border-b border-[var(--border-color)] pb-2 shrink-0 custom-scrollbar"
    >
        {#each subTabs as tab}
            <button
                class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 {activeSubTab ===
                tab.id
                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}"
                onclick={() => (uiState.settingsVisualsSubTab = tab.id)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="min-w-0">
        {#if activeSubTab === "appearance"}
            <VisualsAppearance {themes} />
        {/if}

        {#if activeSubTab === "layout"}
            <VisualsLayout />
        {/if}

        {#if activeSubTab === "background"}
            <VisualsBackground />
        {/if}
    </div>
</div>
