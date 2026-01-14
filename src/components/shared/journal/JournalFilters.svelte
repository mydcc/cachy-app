<script lang="ts">
    import { _ } from "../../../locales/i18n";

    // Props - Filter State (two-way binding)
    export let searchQuery: string = "";
    export let filterStatus: string = "all";
    export let filterDateStart: string = "";
    export let filterDateEnd: string = "";
    export let groupBySymbol: boolean = false;

    // Props - Additional Data
    export let totalTrades: number = 0;
    export let filteredCount: number = 0;
</script>

<div class="journal-filters">
    <!-- Header with Trade Count -->
    <div class="filter-header">
        <h3>{$_("journal.title")}</h3>
        <span class="trade-count">
            {#if filteredCount < totalTrades}
                {filteredCount} / {totalTrades} {$_("journal.trades")}
            {:else}
                {totalTrades} {$_("journal.trades")}
            {/if}
        </span>
    </div>

    <!-- Filter Controls -->
    <div class="filter-controls">
        <!-- Search Input -->
        <div class="filter-group">
            <input
                type="text"
                bind:value={searchQuery}
                placeholder={$_("journal.searchPlaceholder")}
                class="filter-input"
            />
        </div>

        <!-- Status Filter -->
        <div class="filter-group">
            <select bind:value={filterStatus} class="filter-select">
                <option value="all">{$_("journal.filters.all")}</option>
                <option value="open">{$_("journal.filters.open")}</option>
                <option value="closed">{$_("journal.filters.closed")}</option>
            </select>
        </div>

        <!-- Date Range Filter -->
        <div class="filter-group date-range">
            <input
                type="date"
                bind:value={filterDateStart}
                class="filter-input date-input"
                placeholder={$_("journal.filters.dateFrom")}
            />
            <span class="date-separator">→</span>
            <input
                type="date"
                bind:value={filterDateEnd}
                class="filter-input date-input"
                placeholder={$_("journal.filters.dateTo")}
            />
        </div>

        <!-- Group by Symbol Toggle -->
        <div class="filter-group">
            <label class="toggle-label">
                <input type="checkbox" bind:checked={groupBySymbol} />
                <span>{$_("journal.groupBySymbol")}</span>
            </label>
        </div>
    </div>
</div>

<style>
    .journal-filters {
        background: var(--card-bg);
        border-radius: var(--border-radius);
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        box-shadow: var(--shadow-sm);
    }

    .filter-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .filter-header h3 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--text-primary);
    }

    .trade-count {
        font-size: 0.9rem;
        color: var(--text-secondary);
        font-weight: 500;
    }

    .filter-controls {
        display: grid;
        grid-template-columns: 2fr 1fr 2fr auto;
        gap: 1rem;
        align-items: center;
    }

    @media (max-width: 768px) {
        .filter-controls {
            grid-template-columns: 1fr;
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
        border-radius: var(--border-radius);
        background: var(--input-bg);
        color: var(--text-primary);
        font-size: 0.9rem;
        transition: all 0.2s ease;
    }

    .filter-input:focus,
    .filter-select:focus {
        outline: none;
        border-color: var(--accent-color);
        box-shadow: 0 0 0 3px var(--accent-color-alpha);
    }

    .date-range {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .date-input {
        flex: 1;
    }

    .date-separator {
        color: var(--text-secondary);
        font-weight: 500;
    }

    .toggle-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        user-select: none;
    }

    .toggle-label input[type="checkbox"] {
        cursor: pointer;
    }

    .toggle-label span {
        font-size: 0.9rem;
        color: var(--text-primary);
    }
</style>
