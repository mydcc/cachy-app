<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { _ } from "../../../locales/i18n";
    import { formatDynamicDecimal } from "../../../utils/utils";
    import type { JournalEntry } from "../../../stores/types";

    const dispatch = createEventDispatcher();

    // Props
    export let trades: JournalEntry[] = [];
    export let sortField: string = "date";
    export let sortDirection: "asc" | "desc" = "desc";
    export let currentPage: number = 1;
    export let itemsPerPage: number = 10;
    export let columnVisibility: any = {};
    export let groupBySymbol: boolean = false;

    // Pagination
    $: totalPages = Math.ceil(trades.length / itemsPerPage);
    $: paginatedTrades = trades.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    function handleSort(field: string) {
        dispatch("sort", { field });
    }

    function handlePageChange(page: number) {
        dispatch("pageChange", { page });
    }

    function handleDeleteTrade(id: number) {
        dispatch("deleteTrade", { id });
    }

    function handleStatusChange(id: number, status: string) {
        dispatch("statusChange", { id, status });
    }
</script>

<div class="journal-table-container">
    {#if trades.length === 0}
        <div class="empty-state">
            <p>{$_("journal.empty")}</p>
        </div>
    {:else}
        <div class="table-wrapper">
            <table class="journal-table">
                <thead>
                    <tr>
                        {#if columnVisibility.date}
                            <th on:click={() => handleSort("date")}>
                                {$_("journal.table.date")}
                                {sortField === "date"
                                    ? sortDirection === "asc"
                                        ? "↑"
                                        : "↓"
                                    : ""}
                            </th>
                        {/if}
                        {#if columnVisibility.symbol}
                            <th on:click={() => handleSort("symbol")}>
                                {$_("journal.table.symbol")}
                                {sortField === "symbol"
                                    ? sortDirection === "asc"
                                        ? "↑"
                                        : "↓"
                                    : ""}
                            </th>
                        {/if}
                        {#if columnVisibility.type}
                            <th>{$_("journal.table.type")}</th>
                        {/if}
                        {#if columnVisibility.entry}
                            <th on:click={() => handleSort("entryPrice")}>
                                {$_("journal.table.entry")}
                                {sortField === "entryPrice"
                                    ? sortDirection === "asc"
                                        ? "↑"
                                        : "↓"
                                    : ""}
                            </th>
                        {/if}
                        {#if columnVisibility.pnl}
                            <th on:click={() => handleSort("totalNetProfit")}>
                                {$_("journal.table.pnl")}
                                {sortField === "totalNetProfit"
                                    ? sortDirection === "asc"
                                        ? "↑"
                                        : "↓"
                                    : ""}
                            </th>
                        {/if}
                        {#if columnVisibility.rr}
                            <th on:click={() => handleSort("totalRR")}>
                                {$_("journal.table.rr")}
                                {sortField === "totalRR"
                                    ? sortDirection === "asc"
                                        ? "↑"
                                        : "↓"
                                    : ""}
                            </th>
                        {/if}
                        {#if columnVisibility.status}
                            <th>{$_("journal.table.status")}</th>
                        {/if}
                        {#if columnVisibility.action}
                            <th>{$_("journal.table.action")}</th>
                        {/if}
                    </tr>
                </thead>
                <tbody>
                    {#each paginatedTrades as trade}
                        {@const tradeDate = new Date(trade.date)}
                        <tr>
                            {#if columnVisibility.date}
                                <td>
                                    {tradeDate.toLocaleString(undefined, {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "2-digit",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </td>
                            {/if}
                            {#if columnVisibility.symbol}
                                <td>{trade.symbol || "-"}</td>
                            {/if}
                            {#if columnVisibility.type}
                                <td
                                    class:text-success={trade.tradeType.toLowerCase() ===
                                        "long"}
                                    class:text-danger={trade.tradeType.toLowerCase() ===
                                        "short"}
                                >
                                    {trade.tradeType.charAt(0).toUpperCase() +
                                        trade.tradeType.slice(1)}
                                </td>
                            {/if}
                            {#if columnVisibility.entry}
                                <td
                                    >{formatDynamicDecimal(
                                        trade.entryPrice,
                                        4
                                    )}</td
                                >
                            {/if}
                            {#if columnVisibility.pnl}
                                <td
                                    class:text-success={trade.totalNetProfit?.gt(
                                        0
                                    )}
                                    class:text-danger={trade.totalNetProfit?.lt(
                                        0
                                    )}
                                >
                                    {formatDynamicDecimal(
                                        trade.totalNetProfit,
                                        2
                                    )}
                                </td>
                            {/if}
                            {#if columnVisibility.rr}
                                <td
                                    class:text-success={trade.totalRR?.gte(2)}
                                    class:text-warning={trade.totalRR?.gte(
                                        1.5
                                    ) && trade.totalRR?.lt(2)}
                                    class:text-danger={trade.totalRR?.lt(1.5)}
                                >
                                    {!trade.totalRR?.isZero()
                                        ? formatDynamicDecimal(trade.totalRR, 2)
                                        : "-"}
                                </td>
                            {/if}
                            {#if columnVisibility.status}
                                <td>
                                    <select
                                        value={trade.status}
                                        on:change={(e) =>
                                            handleStatusChange(
                                                trade.id,
                                                e.currentTarget.value
                                            )}
                                        class="status-select"
                                    >
                                        <option value="Open"
                                            >{$_("journal.status.open")}</option
                                        >
                                        <option value="Won"
                                            >{$_("journal.status.won")}</option
                                        >
                                        <option value="Lost"
                                            >{$_("journal.status.lost")}</option
                                        >
                                    </select>
                                </td>
                            {/if}
                            {#if columnVisibility.action}
                                <td>
                                    <button
                                        class="btn-delete"
                                        on:click={() =>
                                            handleDeleteTrade(trade.id)}
                                        title={$_("journal.delete")}
                                    >
                                        🗑️
                                    </button>
                                </td>
                            {/if}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <!-- Pagination -->
        {#if totalPages > 1}
            <div class="pagination">
                <button
                    class="pagination-btn"
                    disabled={currentPage === 1}
                    on:click={() => handlePageChange(currentPage - 1)}
                >
                    ←
                </button>
                <span class="pagination-info">
                    {$_("journal.page")}
                    {currentPage} / {totalPages}
                </span>
                <button
                    class="pagination-btn"
                    disabled={currentPage === totalPages}
                    on:click={() => handlePageChange(currentPage + 1)}
                >
                    →
                </button>
            </div>
        {/if}
    {/if}
</div>

<style>
    .journal-table-container {
        background: var(--card-bg);
        border-radius: var(--border-radius);
        padding: 1rem;
        box-shadow: var(--shadow-sm);
    }

    .empty-state {
        text-align: center;
        padding: 3rem 1rem;
        color: var(--text-secondary);
    }

    .table-wrapper {
        overflow-x: auto;
        margin-bottom: 1rem;
    }

    .journal-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
    }

    .journal-table thead {
        background: var(--bg-secondary);
        position: sticky;
        top: 0;
        z-index: 1;
    }

    .journal-table th {
        padding: 0.75rem;
        text-align: left;
        font-weight: 600;
        color: var(--text-secondary);
        border-bottom: 2px solid var(--border-color);
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
    }

    .journal-table th:hover {
        background: var(--bg-tertiary);
    }

    .journal-table td {
        padding: 0.75rem;
        border-bottom: 1px solid var(--border-color);
        color: var(--text-primary);
    }

    .journal-table tbody tr:hover {
        background: var(--bg-secondary);
    }

    .text-success {
        color: var(--success-color);
    }

    .text-danger {
        color: var(--danger-color);
    }

    .text-warning {
        color: var(--warning-color);
    }

    .status-select {
        padding: 0.25rem 0.5rem;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        background: var(--input-bg);
        color: var(--text-primary);
        font-size: 0.85rem;
    }

    .btn-delete {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 1.2rem;
        padding: 0.25rem;
        opacity: 0.6;
        transition: opacity 0.2s ease;
    }

    .btn-delete:hover {
        opacity: 1;
    }

    .pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 1rem;
        padding: 1rem 0;
    }

    .pagination-btn {
        padding: 0.5rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        background: var(--bg-secondary);
        color: var(--text-primary);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .pagination-btn:hover:not(:disabled) {
        background: var(--bg-tertiary);
        border-color: var(--accent-color);
    }

    .pagination-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .pagination-info {
        color: var(--text-secondary);
        font-size: 0.9rem;
    }
</style>
