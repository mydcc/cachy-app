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
    import { onMount } from "svelte";
    import { _ } from "../../locales/i18n";
    import { CHART_PATTERNS } from "../../services/chartPatterns";
    import ChartPatternChart from "./ChartPatternChart.svelte";
    import { renderSafeMarkdown } from "../../utils/markdownUtils";
    import "katex/dist/katex.min.css";

    let searchQuery = $state("");
    let selectedCategory = $state("All");
    let selectedPatternId = $state(
        CHART_PATTERNS.length > 0 ? CHART_PATTERNS[0].id : null,
    );

    // Favorites State
    let favorites = $state<Set<string>>(new Set());

    onMount(() => {
        const stored = localStorage.getItem("chart_pattern_favorites");
        if (stored) {
            try {
                favorites = new Set(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse favorites", e);
            }
        }
    });

    function toggleFavorite(id: string) {
        const newFavorites = new Set(favorites);
        if (newFavorites.has(id)) {
            newFavorites.delete(id);
        } else {
            newFavorites.add(id);
        }
        favorites = newFavorites;
        localStorage.setItem(
            "chart_pattern_favorites",
            JSON.stringify([...newFavorites]),
        );
    }

    // Derived filtered list
    let filteredPatterns = $derived(
        CHART_PATTERNS.filter((p) => {
            const matchesSearch = p.name
                .toLowerCase()
                .includes(searchQuery.toLowerCase());

            let matchesCategory = true;
            if (selectedCategory === "Favorites") {
                matchesCategory = favorites.has(p.id);
            } else if (selectedCategory !== "All") {
                matchesCategory = p.category === selectedCategory;
            }

            return matchesSearch && matchesCategory;
        }),
    );

    // Categories: Favorites first, then All, then others
    const categories = $derived(
        [
            "All",
            "Favorites",
            ...new Set(CHART_PATTERNS.map((p) => p.category)),
        ].sort((a, b) => {
            // Keep All and Favorites at top
            if (a === "All") return -1;
            if (b === "All") return 1;
            if (a === "Favorites") return -1;
            if (b === "Favorites") return 1;
            return a.localeCompare(b);
        }),
    );

    // Current Pattern
    let currentPattern = $derived(
        CHART_PATTERNS.find((p) => p.id === selectedPatternId) ||
            CHART_PATTERNS[0],
    );

    function selectPattern(id: string) {
        selectedPatternId = id;
    }

    function getLocalizedText(pattern: any, key: string): string {
        // Prioritize explicit property on object since we are not using full i18n keys for this new feature yet
        if (pattern && pattern[key]) {
            return pattern[key];
        }
        return "No description available.";
    }

    function getCategoryIcon(category: string) {
        switch (category) {
            case "Umkehrmuster":
                // U-Turn / Reversal Icon
                return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>`;
            case "Fortsetzungsmuster":
                // Trend / Continuation Icon
                return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" /></svg>`;
            case "Gap-Typen":
                // Gap / Pause Icon
                return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>`;
            default:
                return "";
        }
    }
</script>

<div class="flex flex-col md:flex-row h-full gap-4">
    <!-- Sidebar -->
    <div
        class="w-full md:w-1/4 lg:w-1/5 flex flex-col gap-4 border-r border-[var(--border-color)] pr-4"
    >
        <!-- Search & Filter -->
        <div
            class="flex flex-col gap-2 p-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
        >
            <input
                type="text"
                placeholder={$_("chartPatterns.searchPlaceholder") || "Search patterns..."}
                bind:value={searchQuery}
                class="input-field w-full px-3 py-2 rounded-md text-xs bg-[var(--bg-tertiary)] border border-[var(--border-color)] focus:border-[var(--accent-color)] outline-none text-[var(--text-primary)] transition-all"
            />
            <select
                bind:value={selectedCategory}
                class="input-field w-full px-3 py-2 rounded-md text-xs bg-[var(--bg-tertiary)] border border-[var(--border-color)] outline-none text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-secondary)] transition-all"
            >
                {#each categories as cat}
                    <option
                        value={cat}
                        class="bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                        >{cat}</option
                    >
                {/each}
            </select>
        </div>

        <!-- List -->
        <div
            class="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1"
        >
            {#each filteredPatterns as pattern}
                <button
                    class="text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex justify-between items-center group
                           {selectedPatternId === pattern.id
                        ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] shadow-lg'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--accent-color)]'}"
                    onclick={() => selectPattern(pattern.id)}
                >
                    <div class="flex items-center gap-2 truncate">
                        <div
                            class="shrink-0 transition-colors {selectedPatternId ===
                            pattern.id
                                ? 'text-[var(--btn-accent-text)]'
                                : 'text-[var(--text-secondary)]'}"
                            title={pattern.category}
                        >
                            {@html getCategoryIcon(pattern.category)}
                        </div>
                        {#if favorites.has(pattern.id)}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                class="w-3.5 h-3.5 text-[var(--warning-color)] flex-shrink-0"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        {/if}
                        <span class="truncate font-bold tracking-tight"
                            >{pattern.name}</span
                        >
                    </div>
                </button>
            {/each}
            {#if filteredPatterns.length === 0}
                <div
                    class="text-center text-[var(--text-tertiary)] text-sm py-4"
                >
                    No patterns found.
                </div>
            {/if}
        </div>
    </div>

    <!-- Main Content -->
    <div
        class="w-full md:w-3/4 lg:w-4/5 flex flex-col gap-4 overflow-y-auto custom-scrollbar px-2"
    >
        {#if currentPattern}
            <!-- Header -->
            <div>
                <div class="flex justify-between items-start">
                    <div class="flex items-center gap-3">
                        <h2
                            class="text-2xl font-bold text-[var(--accent-color)]"
                        >
                            {currentPattern.name}
                        </h2>
                        <button
                            class="p-1 hover:bg-[var(--bg-secondary)] rounded transition-colors"
                            onclick={() => toggleFavorite(currentPattern.id)}
                            title={favorites.has(currentPattern.id)
                                ? "Remove from Favorites"
                                : "Add to Favorites"}
                        >
                            {#if favorites.has(currentPattern.id)}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    class="w-6 h-6 text-[var(--warning-color)]"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                            {:else}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                    stroke="currentColor"
                                    class="w-6 h-6 text-[var(--text-tertiary)]"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.563.045.797.777.388 1.18l-4.204 4.152a.563.563 0 00-.161.503l1.26 5.289a.562.562 0 01-.84.62l-4.738-2.868a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.62l1.26-5.289a.563.563 0 00-.161-.503L3.038 10.577a.562.562 0 01.388-1.18l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                                    />
                                </svg>
                            {/if}
                        </button>
                    </div>

                    <span
                        class="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)] flex items-center gap-2"
                    >
                        {@html getCategoryIcon(currentPattern.category)}
                        {currentPattern.category}
                    </span>
                </div>
            </div>

            <!-- Split Layout: Chart/Desc vs Strategy/Interp -->
            <div class="flex flex-col lg:flex-row gap-6 h-full">
                <!-- Left Column (66%) -->
                <div class="w-full lg:w-2/3 flex flex-col gap-6">
                    <!-- Chart Visualization -->
                    <div class="w-full">
                        <ChartPatternChart pattern={currentPattern} />
                    </div>

                    <!-- Description -->
                    <div
                        class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)] flex-grow"
                    >
                        <h3
                            class="text-sm font-bold uppercase text-[var(--text-secondary)] mb-2"
                        >
                            {$_("chartPatterns.description")}
                        </h3>
                        <div class="prose dark:prose-invert text-sm max-w-none">
                            {@html renderSafeMarkdown(
                                getLocalizedText(currentPattern, "description"),
                            )}
                        </div>

                        <!-- Characteristics -->
                        <h3
                            class="text-sm font-bold uppercase text-[var(--text-secondary)] mt-4 mb-2"
                        >
                            {$_("chartPatterns.characteristics")}
                        </h3>
                        <ul
                            class="list-disc list-inside text-sm text-[var(--text-primary)]"
                        >
                            {#each currentPattern.characteristics as char}
                                <li>{char}</li>
                            {/each}
                        </ul>
                    </div>
                </div>

                <!-- Right Column (33%) -->
                <div class="w-full lg:w-1/3 flex flex-col gap-6 h-full">
                    <!-- Trading Strategy -->
                    <div
                        class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                    >
                        <h3
                            class="text-sm font-bold uppercase text-[var(--text-secondary)] mb-2"
                        >
                            {$_("chartPatterns.tradingStrategy")}
                        </h3>
                        <div class="prose dark:prose-invert text-sm max-w-none">
                            {@html renderSafeMarkdown(
                                getLocalizedText(currentPattern, "trading"),
                            )}
                        </div>
                    </div>

                    <!-- Interpretation / Advanced -->
                    <div
                        class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)] flex-grow"
                    >
                        <h3
                            class="text-sm font-bold uppercase text-[var(--text-secondary)] mb-2"
                        >
                            {$_("chartPatterns.interpretation")}
                        </h3>
                        <div class="prose dark:prose-invert text-sm max-w-none">
                            {@html renderSafeMarkdown(
                                getLocalizedText(
                                    currentPattern,
                                    "advancedConsiderations",
                                ),
                            )}
                        </div>

                        <h3
                            class="text-sm font-bold uppercase text-[var(--text-secondary)] mt-4 mb-2"
                        >
                            {$_("chartPatterns.performance")}
                        </h3>
                        <div class="prose dark:prose-invert text-sm max-w-none">
                            {@html renderSafeMarkdown(
                                getLocalizedText(
                                    currentPattern,
                                    "performanceStats",
                                ),
                            )}
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .input-field {
        transition: all 0.2s;
    }
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 3px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }

    /* Markdown Styles specifically for formulas */
    :global(.katex) {
        font-size: 1.1em;
    }
</style>
