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
    import { _ } from "../../locales/i18n";

    // New Tab Components
    import TradingTab from "./tabs/TradingTab.svelte";
    import ChartTab from "./tabs/ChartTab.svelte";
    import VisualsTab from "./tabs/VisualsTab.svelte";
    import AiTab from "./tabs/AiTab.svelte";
    import ConnectionsTab from "./tabs/ConnectionsTab.svelte";
    import SystemTab from "./tabs/SystemTab.svelte";
    import CloudTab from "./tabs/CloudTab.svelte";

    // Tab State
    const activeTab = $derived(uiState.settingsTab || "trading");

    function selectTab(tab: string, e?: MouseEvent) {
        uiState.settingsTab = tab;
        // Mobile: the tab bar scrolls horizontally — keep the active tab in view.
        (e?.currentTarget as HTMLElement | undefined)?.scrollIntoView({
            inline: "center",
            block: "nearest",
        });
    }

    const themes = [
        { value: "dark", label: "Dark (Default)" },
        { value: "light", label: "Light" },
        { value: "meteorite", label: "Meteorite" },
        { value: "midnight", label: "Midnight" },
        { value: "cobalt2", label: "Cobalt2" },
        { value: "night-owl", label: "Night Owl" },
        { value: "dracula", label: "Dracula" },
        { value: "dracula-soft", label: "Dracula Soft" },
        { value: "monokai", label: "Monokai" },
        { value: "nord", label: "Nord" },
        { value: "solarized-dark", label: "Solarized Dark" },
        { value: "solarized-light", label: "Solarized Light" },
        { value: "gruvbox-dark", label: "Gruvbox Dark" },
        { value: "catppuccin", label: "Catppuccin" },
        { value: "tokyo-night", label: "Tokyo Night" },
        { value: "one-dark-pro", label: "One Dark Pro" },
        { value: "obsidian", label: "Obsidian" },
        { value: "ayu-dark", label: "Ayu Dark" },
        { value: "ayu-light", label: "Ayu Light" },
        { value: "ayu-mirage", label: "Ayu Mirage" },
        { value: "github-dark", label: "GitHub Dark" },
        { value: "github-light", label: "GitHub Light" },
        { value: "steel", label: "Steel" },
        { value: "matrix", label: "Matrix" },
        { value: "everforest-dark", label: "Everforest Dark" },
        { value: "VIP", label: "VIP" },
    ];

    const tabs = [
        {
            id: "trading",
            icon: `<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93 4.93 19.07"/>`,
            label: $_("settings.tabs.trading") || "Trading",
        },
        {
            id: "chart",
            icon: `<path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/>`,
            label: $_("settings.tabs.chart") || "Chart",
        },
        {
            id: "visuals",
            icon: `<path d="M2.05 13.9a9.96 9.96 0 0 1 0-7.8"/> <path d="M8.2 21.8c-1.3-.2-2.5-.6-3.7-1.3"/> <path d="M15.8 2.2c1.3.2 2.5.6 3.7 1.3"/> <path d="M21.95 10.1a9.96 9.96 0 0 1 0 7.8"/> <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/> <path d="M12 2a10 10 0 0 1 10 10"/>`,
            label: $_("settings.tabs.visuals") || "Visuals",
        },
        {
            id: "ai",
            icon: `<path d="M12 2a2 2 0 0 1 2 2c0 2.21-1.79 4-4 4s-4-1.79-4-4a2 2 0 0 1 2-2z"/><path d="M12 10c-3.31 0-6 2.69-6 6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2c0-3.31-2.69-6-6-6z"/>`,
            label: $_("settings.tabs.ai") || "Intelligence",
        },
        {
            id: "connections",
            icon: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
            label: $_("settings.tabs.connections") || "Connections",
        },
        {
            id: "system",
            icon: `<path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 22v-2"/><path d="m17 7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/><path d="M22 12h-2"/><path d="M2 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m7 17 1.4 1.4"/>`,
            label: $_("settings.tabs.system") || "System",
        },
        {
            id: "cloud",
            icon: `<path d="M17.5 19c0-1.7-1.3-3-3-3h-1.5c-2.8 0-5-2.2-5-5 0-2.3 1.5-4.3 3.7-4.8.8-1.8 2.6-3.2 4.8-3.2 3 0 5.5 2.5 5.5 5.5 0 .2 0 .5-.1.7 2.1.8 3.6 2.8 3.6 5.3 0 2.8-2.2 5-5 5h-4.5c-.3 0-.5-.2-.5-.5z"/>`,
            label: "Cloud",
        },
    ];
</script>

<div
    class="flex flex-col md:flex-row flex-1 w-full h-full overflow-hidden bg-[var(--bg-primary)]"
>
    <!-- Sidebar Navigation -->
    <div
        class="flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible md:overflow-y-auto w-full md:w-52 border-b md:border-b-0 md:border-r border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)] py-0 md:py-2 custom-scrollbar"
        role="tablist"
    >
        {#each tabs as tab}
            <button
                class="flex items-center gap-2 md:gap-3 px-4 md:px-4 py-3 text-sm font-semibold transition-all text-left focus:outline-none whitespace-nowrap group
               {activeTab === tab.id
                    ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)] shadow-inner'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/50 border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                onclick={(e) => selectTab(tab.id, e)}
                role="tab"
                aria-selected={activeTab === tab.id}
            >
                <div
                    class="tab-icon transition-transform group-hover:scale-110 {activeTab ===
                    tab.id
                        ? 'text-[var(--accent-color)]'
                        : 'text-[var(--text-secondary)]'}"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        {@html tab.icon}
                    </svg>
                </div>
                {tab.label}
            </button>
        {/each}
    </div>

    <!-- Tab Content Area -->
    <!-- Container queries below measure THIS width (the settings window),
         not the viewport: @container makes the content a query container. -->
    <div class="@container flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">

        {#if activeTab === "trading"}
            <TradingTab />
        {:else if activeTab === "chart"}
            <ChartTab />
        {:else if activeTab === "visuals"}
            <VisualsTab {themes} />
        {:else if activeTab === "ai"}
            <AiTab />
        {:else if activeTab === "connections"}
            <ConnectionsTab />
        {:else if activeTab === "system"}
            <SystemTab />
        {:else if activeTab === "cloud"}
            <CloudTab />
        {/if}
    </div>
</div>

<style>
    .tab-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
    }
    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 10px;
    }
</style>
