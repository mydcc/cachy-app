<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { icons } from "../../../lib/constants";
    import { createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();

    // Props - Filter State (two-way binding)
    export let searchQuery: string = "";
    export let filterStatus: string = "all";
    export let filterDateStart: string = "";
    export let filterDateEnd: string = "";
    export let groupBySymbol: boolean = false;

    // Props - Additional Data
    export let totalTrades: number = 0;
    export let filteredCount: number = 0;

    function toggleSettings() {
        dispatch("toggleSettings");
    }
</script>

<div class="journal-filters">
    <!-- Header removed for minimal design -->

    <!-- Filter Controls -->
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

        <!-- Date Range Filter -->
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

        <!-- Actions: Pivot Toggle & Settings -->
        <div class="filter-actions">
            <span class="trade-count mr-2">
                {#if filteredCount < totalTrades}
                    {filteredCount}/{totalTrades}
                {:else}
                    {totalTrades}
                {/if}
                {$_("journal.trades")}
            </span>

            <label class="pivot-toggle">
                <input type="checkbox" bind:checked={groupBySymbol} />
                <span class="toggle-slider" />
                <span class="toggle-text">{$_("journal.labels.pivotMode")}</span
                >
            </label>

            <button
                class="settings-btn"
                on:click={toggleSettings}
                title={$_("journal.labels.tableSettings")}
            >
                <!-- svelte-ignore svelte/no-at-html-tags -->
                {@html icons.settings}
            </button>
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
            grid-template-columns: 1.5fr 0.8fr 1.5fr auto;
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
        padding: 0.6rem 0.85rem;
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        background: var(--input-bg);
        color: var(--text-primary);
        font-size: 0.9rem;
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
        gap: 0.5rem;
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
        gap: 1rem;
        justify-content: flex-end;
    }

    .pivot-toggle {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        user-select: none;
    }

    .pivot-toggle input {
        display: none;
    }

    .toggle-slider {
        position: relative;
        width: 36px;
        height: 20px;
        background: var(--bg-tertiary);
        border-radius: 20px;
        transition: 0.3s;
        border: 1px solid var(--border-color);
    }

    .toggle-slider::before {
        content: "";
        position: absolute;
        width: 14px;
        height: 14px;
        left: 2px;
        bottom: 2px;
        background: var(--text-secondary);
        border-radius: 50%;
        transition: 0.3s;
    }

    .pivot-toggle input:checked + .toggle-slider {
        background: var(--accent-color);
        border-color: var(--accent-color);
    }

    .pivot-toggle input:checked + .toggle-slider::before {
        transform: translateX(16px);
        background: white;
    }

    .toggle-text {
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap;
    }

    .settings-btn {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        padding: 0.5rem;
        border-radius: 0.5rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        color: var(--text-secondary);
    }

    .settings-btn:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
        border-color: var(--accent-color);
    }

    :global(.settings-btn svg) {
        width: 20px;
        height: 20px;
    }
</style>
