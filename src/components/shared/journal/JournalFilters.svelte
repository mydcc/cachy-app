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
    import { icons } from "../../../lib/constants";

    interface Props {
        searchQuery?: string;
        filterStatus?: string;
        filterDateStart?: string;
        filterDateEnd?: string;
        selectedTag?: string;
        availableTags?: string[];
        groupBySymbol?: boolean;
        tradeMode?: "live" | "paper" | "all";
        liveCount?: number;
        paperCount?: number;
        totalTrades?: number;
        filteredCount?: number;
        ontoggleSettings?: () => void;
        actions?: import("svelte").Snippet;
    }

    let {
        searchQuery = $bindable(""),
        filterStatus = $bindable("all"),
        filterDateStart = $bindable(""),
        filterDateEnd = $bindable(""),
        selectedTag = $bindable(""),
        availableTags = [],
        groupBySymbol = $bindable(false),
        tradeMode = $bindable("live"),
        liveCount = 0,
        paperCount = 0,
        totalTrades = 0,
        filteredCount = 0,
        ontoggleSettings,
        actions,
    }: Props = $props();

    function toggleSettings() {
        ontoggleSettings?.();
    }

    function setQuickDate(range: "today" | "week" | "month" | "30days" | "ytd" | "all") {
        const now = new Date();
        const formatDate = (d: Date) => d.toISOString().split("T")[0];

        if (range === "all") {
            filterDateStart = "";
            filterDateEnd = "";
            return;
        }

        if (range === "today") {
            const todayStr = formatDate(now);
            filterDateStart = todayStr;
            filterDateEnd = todayStr;
            return;
        }

        if (range === "week") {
            const firstDay = new Date(now);
            const day = now.getDay() || 7;
            firstDay.setDate(now.getDate() - day + 1);
            filterDateStart = formatDate(firstDay);
            filterDateEnd = formatDate(now);
            return;
        }

        if (range === "month") {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            filterDateStart = formatDate(firstDay);
            filterDateEnd = formatDate(now);
            return;
        }

        if (range === "30days") {
            const past30 = new Date(now);
            past30.setDate(now.getDate() - 30);
            filterDateStart = formatDate(past30);
            filterDateEnd = formatDate(now);
            return;
        }

        if (range === "ytd") {
            const firstOfYear = new Date(now.getFullYear(), 0, 1);
            filterDateStart = formatDate(firstOfYear);
            filterDateEnd = formatDate(now);
            return;
        }
    }

    function resetFilters() {
        searchQuery = "";
        filterStatus = "all";
        filterDateStart = "";
        filterDateEnd = "";
        selectedTag = "";
    }

    let hasActiveFilters = $derived(
        Boolean(searchQuery) ||
        filterStatus !== "all" ||
        Boolean(filterDateStart) ||
        Boolean(filterDateEnd) ||
        Boolean(selectedTag)
    );
</script>

<div class="journal-filters space-y-3">
    <!-- Row 1: Primary Search & Select Controls -->
    <div class="filter-controls">
        <!-- Search Input -->
        <div class="filter-group col-span-2 sm:col-span-1">
            <input
                type="text"
                bind:value={searchQuery}
                placeholder={$_("journal.searchSymbolPlaceholder")}
                class="filter-input"
            />
        </div>

        <!-- Status Filter -->
        <div class="filter-group">
            <select bind:value={filterStatus} class="filter-select">
                <option value="all">{$_("journal.filterAll")}</option>
                <option value="Open">{$_("journal.filterOpen")}</option>
                <option value="Won">{$_("journal.filterWon")}</option>
                <option value="Lost">{$_("journal.filterLost")}</option>
            </select>
        </div>

        <!-- Tag Filter if tags exist -->
        {#if availableTags.length > 0}
            <div class="filter-group">
                <select bind:value={selectedTag} class="filter-select">
                    <option value="">{$_("journal.filters.filterTags")}</option>
                    {#each availableTags as tag}
                        <option value={tag}>#{tag}</option>
                    {/each}
                </select>
            </div>
        {/if}

        <!-- Date Range Inputs -->
        <div class="filter-group date-range">
            <input
                type="date"
                bind:value={filterDateStart}
                class="filter-input date-input"
                placeholder={$_("journal.labels.from")}
            />
            <span class="date-separator">→</span>
            <input
                type="date"
                bind:value={filterDateEnd}
                class="filter-input date-input"
                placeholder={$_("journal.labels.to")}
            />
        </div>

        <!-- Actions & Settings -->
        <div class="filter-actions">
            {#if actions}
                {@render actions()}
            {/if}

            <!-- 3-Way Mode Segmented Control: Live / Paper / All -->
            <div class="inline-flex p-0.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs font-bold shadow-xs">
                <button
                    type="button"
                    class="px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer"
                    class:bg-[var(--card-bg)]={tradeMode === 'live'}
                    class:text-[var(--success-color)]={tradeMode === 'live'}
                    class:shadow-xs={tradeMode === 'live'}
                    onclick={() => (tradeMode = 'live')}
                >
                    <span class="w-2 h-2 rounded-full bg-[var(--success-color)] inline-block"></span>
                    <span>Live</span>
                    <span class="text-[10px] text-[var(--text-secondary)] font-normal font-mono">({liveCount})</span>
                </button>
                <button
                    type="button"
                    class="px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer"
                    class:bg-[var(--card-bg)]={tradeMode === 'paper'}
                    class:text-[var(--accent-color)]={tradeMode === 'paper'}
                    class:shadow-xs={tradeMode === 'paper'}
                    onclick={() => (tradeMode = 'paper')}
                >
                    <span class="w-2 h-2 rounded-full bg-[var(--accent-color)] inline-block"></span>
                    <span>Paper</span>
                    <span class="text-[10px] text-[var(--text-secondary)] font-normal font-mono">({paperCount})</span>
                </button>
                <button
                    type="button"
                    class="px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer"
                    class:bg-[var(--card-bg)]={tradeMode === 'all'}
                    class:text-[var(--text-primary)]={tradeMode === 'all'}
                    class:shadow-xs={tradeMode === 'all'}
                    onclick={() => (tradeMode = 'all')}
                >
                    <span>🔀</span>
                    <span>Alle</span>
                </button>
            </div>

            <label class="pivot-toggle">
                <input type="checkbox" bind:checked={groupBySymbol} />
                <span class="toggle-slider"></span>
                <span class="toggle-text">{$_("journal.labels.pivotMode")}</span>
            </label>

            <button
                class="settings-btn"
                onclick={toggleSettings}
                title={$_("journal.labels.tableSettings")}
                aria-label={$_("journal.labels.tableSettings")}
            >
                {@html icons.settings}
            </button>
        </div>
    </div>

    <!-- Row 2: Quick Date Presets & Count / Reset Bar -->
    <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border-color)] text-xs">
        <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[var(--text-secondary)] font-medium mr-1">{$_("journal.labels.from")}:</span>
            <button
                class="quick-date-btn"
                onclick={() => setQuickDate("today")}
            >
                {$_("journal.filters.quickToday")}
            </button>
            <button
                class="quick-date-btn"
                onclick={() => setQuickDate("week")}
            >
                {$_("journal.filters.quickWeek")}
            </button>
            <button
                class="quick-date-btn"
                onclick={() => setQuickDate("month")}
            >
                {$_("journal.filters.quickMonth")}
            </button>
            <button
                class="quick-date-btn"
                onclick={() => setQuickDate("30days")}
            >
                {$_("journal.filters.quick30Days")}
            </button>
            <button
                class="quick-date-btn"
                onclick={() => setQuickDate("ytd")}
            >
                {$_("journal.filters.quickYtd")}
            </button>
            <button
                class="quick-date-btn"
                onclick={() => setQuickDate("all")}
            >
                {$_("journal.filters.quickAll")}
            </button>

            {#if hasActiveFilters}
                <button
                    class="quick-date-btn text-[var(--accent-color)] border-[var(--accent-color)] font-bold ml-2"
                    onclick={resetFilters}
                >
                    ✕ {$_("journal.filters.reset")}
                </button>
            {/if}
        </div>

        <div class="flex items-center gap-2 text-[var(--text-secondary)] font-medium">
            {#if filteredCount < totalTrades}
                <span class="trade-count">
                    {filteredCount}/{totalTrades} {$_("journal.trades")}
                </span>
            {:else}
                <span class="trade-count">
                    {totalTrades} {$_("journal.trades")}
                </span>
            {/if}
        </div>
    </div>
</div>

<style>
    .journal-filters {
        background: var(--card-bg);
        border-radius: var(--border-radius);
        padding: 0.75rem 1rem;
        margin-bottom: 0.75rem;
        box-shadow: var(--shadow-sm);
        border: 1px solid var(--border-color);
    }

    .trade-count {
        font-size: 0.85rem;
        color: var(--text-secondary);
        font-weight: 500;
    }

    .filter-controls {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 0.75rem;
        align-items: center;
    }

    @media (min-width: 1024px) {
        .filter-controls {
            grid-template-columns: 1.4fr 0.8fr 0.9fr 1.4fr auto;
        }
    }

    .filter-group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .filter-input,
    .filter-select {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        background: var(--input-bg);
        color: var(--text-primary);
        font-size: 0.85rem;
        transition: all 0.2s ease;
    }

    .filter-input:focus,
    .filter-select:focus {
        outline: none;
        border-color: var(--accent-color);
        background: var(--bg-secondary);
    }

    .date-range {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .date-input {
        flex: 1;
        min-width: 0;
    }

    .date-separator {
        color: var(--text-secondary);
        font-weight: 500;
    }

    .filter-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        justify-content: flex-end;
        flex-wrap: wrap;
    }

    .pivot-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        user-select: none;
    }

    .pivot-toggle input {
        display: none;
    }

    .toggle-slider {
        position: relative;
        width: 32px;
        height: 18px;
        background: var(--bg-tertiary);
        border-radius: 18px;
        transition: 0.3s;
        border: 1px solid var(--border-color);
    }

    .toggle-slider::before {
        content: "";
        position: absolute;
        width: 12px;
        height: 12px;
        left: 2px;
        top: 2px;
        background: var(--text-secondary);
        border-radius: 50%;
        transition: 0.3s;
    }

    .pivot-toggle input:checked + .toggle-slider {
        background: var(--accent-color);
        border-color: var(--accent-color);
    }

    .pivot-toggle input:checked + .toggle-slider::before {
        transform: translateX(14px);
        background: var(--card-bg);
    }

    .toggle-text {
        font-size: 0.8rem;
        color: var(--text-secondary);
        font-weight: 500;
        white-space: nowrap;
    }

    .settings-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 0.5rem;
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .settings-btn:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
    }

    .quick-date-btn {
        padding: 0.25rem 0.5rem;
        border-radius: 0.375rem;
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 0.75rem;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .quick-date-btn:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
        border-color: var(--accent-color);
    }
</style>
