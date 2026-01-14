<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { _ } from "../../../locales/i18n";
    import { formatDynamicDecimal } from "../../../utils/utils";
    import type { JournalEntry } from "../../../stores/types";
    import { Decimal } from "decimal.js";

    const dispatch = createEventDispatcher();

    // Props
    export let trades: any[] = [];
    export let sortField: string = "date";
    export let sortDirection: "asc" | "desc" = "desc";
    export let currentPage: number = 1;
    export let itemsPerPage: number = 10;
    export let columnVisibility: Record<string, boolean> = {};
    export let groupBySymbol: boolean = false;
    export let isInternal: boolean = false;

    // State for expanded groups
    let expandedGroups = new Set<string>();

    // Pagination
    $: totalPages = Math.ceil(trades.length / itemsPerPage);
    $: paginatedTrades = trades.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    function handleSort(field: string) {
        if (!isInternal) {
            dispatch("sort", { field });
        }
    }

    function handlePageChange(page: number) {
        if (!isInternal) {
            dispatch("pageChange", { page });
        }
    }

    function handleDeleteTrade(id: number) {
        dispatch("deleteTrade", { id });
    }

    function handleStatusChange(id: number, status: string) {
        dispatch("statusChange", { id, status });
    }

    function handleItemsPerPageChange() {
        currentPage = 1;
        if (!isInternal) {
            dispatch("itemsPerPageChange", { itemsPerPage });
            dispatch("pageChange", { page: 1 });
        }
    }

    function toggleGroup(symbol: string) {
        if (expandedGroups.has(symbol)) {
            expandedGroups.delete(symbol);
        } else {
            expandedGroups.add(symbol);
        }
        expandedGroups = expandedGroups;
    }

    function addTag(tradeId: number, tag: string, currentTags: string[] = []) {
        if (!tag || tag.trim() === "") return;
        const trimmedTag = tag.trim();
        if (currentTags.includes(trimmedTag)) return;

        const newTags = [...currentTags, trimmedTag];
        dispatch("updateTrade", { id: tradeId, tags: newTags });
    }

    function removeTag(
        tradeId: number,
        tagToRemove: string,
        currentTags: string[]
    ) {
        const newTags = currentTags.filter((t) => t !== tagToRemove);
        dispatch("updateTrade", { id: tradeId, tags: newTags });
    }

    let tagInputValues: Record<number, string> = {};

    function formatDuration(minutes: number) {
        if (minutes < 0) return "-";
        if (minutes === 0) return "0m";
        const d = Math.floor(minutes / (60 * 24));
        const h = Math.floor((minutes % (60 * 24)) / 60);
        const m = Math.floor(minutes % 60);

        let parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0 || parts.length === 0) parts.push(`${m}m`);
        return parts.join(" ");
    }

    function getProfitClass(pnl: Decimal | undefined | string) {
        if (!pnl) return "";
        let val: Decimal;
        if (pnl instanceof Decimal) {
            val = pnl;
        } else {
            val = new Decimal(pnl.toString());
        }
        if (val.gt(0)) return "text-success";
        if (val.lt(0)) return "text-danger";
        return "";
    }

    function triggerFileUpload(id: number) {
        const el = document.getElementById(`file-upload-${id}`);
        if (el) (el as HTMLInputElement).click();
    }
</script>

<div class="journal-table-container">
    {#if trades.length === 0 && !isInternal}
        <div class="empty-state">
            <p>{$_("journal.noTradesYet")}</p>
        </div>
    {:else}
        <div class="table-wrapper">
            <table class="journal-table">
                {#if !isInternal}
                    <thead>
                        <tr>
                            {#if groupBySymbol}
                                <th class="w-8" />
                            {/if}
                            {#if columnVisibility.date}
                                <th
                                    on:click={() => handleSort("date")}
                                    class="sortable"
                                >
                                    {$_("journal.table.date")}
                                    <span class="sort-icon"
                                        >{sortField === "date"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.symbol}
                                <th
                                    on:click={() => handleSort("symbol")}
                                    class="sortable"
                                >
                                    {$_("journal.table.symbol")}
                                    <span class="sort-icon"
                                        >{sortField === "symbol"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.type}
                                <th
                                    on:click={() => handleSort("tradeType")}
                                    class="sortable"
                                >
                                    {$_("journal.table.type")}
                                    <span class="sort-icon"
                                        >{sortField === "tradeType"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.entry}
                                <th
                                    on:click={() => handleSort("entryPrice")}
                                    class="sortable"
                                >
                                    {$_("journal.table.entry")}
                                    <span class="sort-icon"
                                        >{sortField === "entryPrice"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.exit}
                                <th
                                    on:click={() => handleSort("exitPrice")}
                                    class="sortable"
                                >
                                    {$_("journal.table.exit")}
                                    <span class="sort-icon"
                                        >{sortField === "exitPrice"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.sl}
                                <th
                                    on:click={() => handleSort("stopLossPrice")}
                                    class="sortable"
                                >
                                    {$_("journal.table.sl")}
                                    <span class="sort-icon"
                                        >{sortField === "stopLossPrice"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.size}
                                <th
                                    on:click={() => handleSort("positionSize")}
                                    class="sortable"
                                >
                                    {$_("journal.table.size")}
                                    <span class="sort-icon"
                                        >{sortField === "positionSize"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.pnl}
                                <th
                                    on:click={() =>
                                        handleSort("totalNetProfit")}
                                    class="sortable"
                                >
                                    {$_("journal.table.pnl")}
                                    <span class="sort-icon"
                                        >{sortField === "totalNetProfit"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.funding}
                                <th
                                    on:click={() => handleSort("fundingFee")}
                                    class="sortable"
                                >
                                    {$_("journal.table.funding")}
                                    <span class="sort-icon"
                                        >{sortField === "fundingFee"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.rr}
                                <th
                                    on:click={() => handleSort("totalRR")}
                                    class="sortable"
                                >
                                    {$_("journal.table.rr")}
                                    <span class="sort-icon"
                                        >{sortField === "totalRR"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.mae}
                                <th
                                    on:click={() => handleSort("mae")}
                                    class="sortable"
                                >
                                    {$_("journal.table.mae")}
                                    <span class="sort-icon"
                                        >{sortField === "mae"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.mfe}
                                <th
                                    on:click={() => handleSort("mfe")}
                                    class="sortable"
                                >
                                    {$_("journal.table.mfe")}
                                    <span class="sort-icon"
                                        >{sortField === "mfe"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.efficiency}
                                <th
                                    on:click={() => handleSort("efficiency")}
                                    class="sortable"
                                >
                                    {$_("journal.table.efficiency")}
                                    <span class="sort-icon"
                                        >{sortField === "efficiency"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.duration}
                                <th
                                    on:click={() => handleSort("duration")}
                                    class="sortable"
                                >
                                    {$_("journal.table.duration")}
                                    <span class="sort-icon"
                                        >{sortField === "duration"
                                            ? sortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.status}
                                <th
                                    on:click={() => handleSort("status")}
                                    class="sortable"
                                >
                                    {$_("journal.table.status")}
                                </th>
                            {/if}
                            {#if columnVisibility.screenshot}
                                <th>{$_("journal.table.screenshot")}</th>
                            {/if}
                            {#if columnVisibility.tags}
                                <th>{$_("journal.table.tags")}</th>
                            {/if}
                            {#if columnVisibility.notes}<th
                                    >{$_("journal.table.notes")}</th
                                >{/if}
                            {#if columnVisibility.action}<th
                                    >{$_("journal.table.action")}</th
                                >{/if}
                        </tr>
                    </thead>
                {/if}
                <tbody class:is-recursive={isInternal}>
                    {#each isInternal ? trades : paginatedTrades as item}
                        {#if item.isGroup}
                            <tr
                                class="group-row cursor-pointer"
                                on:click={() => toggleGroup(item.symbol)}
                            >
                                {#if groupBySymbol}
                                    <td class="text-center">
                                        <span class="expand-icon"
                                            >{expandedGroups.has(item.symbol)
                                                ? "▼"
                                                : "▶"}</span
                                        >
                                    </td>
                                {/if}
                                {#if columnVisibility.date}<td>-</td>{/if}
                                {#if columnVisibility.symbol}
                                    <td class="font-bold"
                                        >{item.symbol} ({item.totalTrades})</td
                                    >
                                {/if}
                                {#if columnVisibility.type}<td>-</td>{/if}
                                {#if columnVisibility.entry}<td>-</td>{/if}
                                {#if columnVisibility.exit}<td>-</td>{/if}
                                {#if columnVisibility.sl}<td>-</td>{/if}
                                {#if columnVisibility.size}<td>-</td>{/if}
                                {#if columnVisibility.pnl}
                                    <td
                                        class="font-bold {getProfitClass(
                                            item.totalProfitLoss
                                        )}"
                                    >
                                        {formatDynamicDecimal(
                                            item.totalProfitLoss,
                                            2
                                        )}
                                    </td>
                                {/if}
                                {#if columnVisibility.funding}<td>-</td>{/if}
                                {#if columnVisibility.rr}
                                    <td>
                                        {(
                                            (item.wonTrades /
                                                item.totalTrades) *
                                            100
                                        ).toFixed(1)}% Win
                                    </td>
                                {/if}
                                {#if columnVisibility.mae}<td>-</td>{/if}
                                {#if columnVisibility.mfe}<td>-</td>{/if}
                                {#if columnVisibility.efficiency}<td>-</td>{/if}
                                {#if columnVisibility.duration}<td>-</td>{/if}
                                {#if columnVisibility.status}<td>-</td>{/if}
                                {#if columnVisibility.tags}<td>-</td>{/if}
                                {#if columnVisibility.notes}<td>-</td>{/if}
                                {#if columnVisibility.action}<td />{/if}
                            </tr>

                            {#if expandedGroups.has(item.symbol)}
                                {#each item.trades as trade}
                                    <tr class="sub-row">
                                        <td
                                            class="border-l-4 border-[var(--accent-color)]"
                                            style="padding: 0;"
                                        />
                                        <td colspan="100" style="padding: 0;">
                                            <svelte:self
                                                trades={[trade]}
                                                {columnVisibility}
                                                isInternal={true}
                                                on:statusChange
                                                on:deleteTrade
                                            />
                                        </td>
                                    </tr>
                                {/each}
                            {/if}
                        {:else}
                            <tr class="trade-row">
                                {#if groupBySymbol && !isInternal}<td />{/if}
                                {#if columnVisibility.date}
                                    <td
                                        class="text-xs text-[var(--text-secondary)]"
                                    >
                                        {new Date(item.date).toLocaleString(
                                            undefined,
                                            {
                                                day: "2-digit",
                                                month: "2-digit",
                                                year: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            }
                                        )}
                                    </td>
                                {/if}
                                {#if columnVisibility.symbol}
                                    <td class="font-medium">{item.symbol}</td>
                                {/if}
                                {#if columnVisibility.type}
                                    <td
                                        class="text-xs uppercase font-bold {item.tradeType ===
                                        'long'
                                            ? 'text-success'
                                            : 'text-danger'}"
                                    >
                                        {item.tradeType}
                                    </td>
                                {/if}
                                {#if columnVisibility.entry}
                                    <td
                                        >{formatDynamicDecimal(
                                            item.entryPrice,
                                            4
                                        )}</td
                                    >
                                {/if}
                                {#if columnVisibility.exit}
                                    <td
                                        >{item.exitPrice &&
                                        !item.exitPrice.isZero()
                                            ? formatDynamicDecimal(
                                                  item.exitPrice,
                                                  4
                                              )
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.sl}
                                    <td class="text-danger"
                                        >{item.stopLossPrice &&
                                        !item.stopLossPrice.isZero()
                                            ? formatDynamicDecimal(
                                                  item.stopLossPrice,
                                                  4
                                              )
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.size}
                                    <td class="text-xs"
                                        >{item.positionSize
                                            ? formatDynamicDecimal(
                                                  item.positionSize,
                                                  2
                                              )
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.pnl}
                                    <td
                                        class="font-bold {getProfitClass(
                                            item.totalNetProfit
                                        )}"
                                    >
                                        {formatDynamicDecimal(
                                            item.totalNetProfit,
                                            2
                                        )}
                                    </td>
                                {/if}
                                {#if columnVisibility.funding}
                                    <td
                                        class="text-xs text-[var(--text-secondary)]"
                                    >
                                        {item.fundingFee !== undefined &&
                                        item.fundingFee !== null
                                            ? formatDynamicDecimal(
                                                  item.fundingFee,
                                                  2
                                              )
                                            : "-"}
                                    </td>
                                {/if}
                                {#if columnVisibility.rr}
                                    <td
                                        class="font-bold {item.totalRR?.gt(2)
                                            ? 'text-success'
                                            : item.totalRR?.gt(1)
                                            ? 'text-warning'
                                            : item.totalRR?.lt(0)
                                            ? 'text-danger'
                                            : 'text-[var(--text-secondary)]'}"
                                    >
                                        {item.totalRR && !item.totalRR.isZero()
                                            ? item.totalRR.toFixed(2) + "R"
                                            : "-"}
                                    </td>
                                {/if}
                                {#if columnVisibility.mae}
                                    <td class="text-xs text-danger"
                                        >{item.mae !== undefined &&
                                        item.mae !== null
                                            ? formatDynamicDecimal(item.mae, 2)
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.mfe}
                                    <td class="text-xs text-success"
                                        >{item.mfe !== undefined &&
                                        item.mfe !== null
                                            ? formatDynamicDecimal(item.mfe, 2)
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.efficiency}
                                    <td class="text-xs">
                                        {item.efficiency !== undefined &&
                                        item.efficiency !== null
                                            ? (item.efficiency * 100).toFixed(
                                                  0
                                              ) + "%"
                                            : "-"}
                                    </td>
                                {/if}
                                {#if columnVisibility.duration}
                                    <td class="text-xs">
                                        {(() => {
                                            const start = new Date(
                                                item.entryDate || item.date
                                            ).getTime();
                                            const end = new Date(
                                                item.date
                                            ).getTime();
                                            const diff =
                                                isNaN(start) || isNaN(end)
                                                    ? 0
                                                    : Math.max(0, end - start);
                                            return formatDuration(
                                                Math.floor(diff / 60000)
                                            );
                                        })()}
                                    </td>
                                {/if}
                                {#if columnVisibility.status}
                                    <td>
                                        <select
                                            value={item.status}
                                            class="status-select bg-transparent border-0 font-bold {getProfitClass(
                                                item.status === 'Won'
                                                    ? '1'
                                                    : item.status === 'Lost'
                                                    ? '-1'
                                                    : '0'
                                            )}"
                                            disabled={item.isManual === false}
                                            on:change={(e) =>
                                                handleStatusChange(
                                                    item.id,
                                                    e.currentTarget.value
                                                )}
                                        >
                                            <option value="Open"
                                                >{$_(
                                                    "journal.filterOpen"
                                                )}</option
                                            >
                                            <option value="Won"
                                                >{$_(
                                                    "journal.filterWon"
                                                )}</option
                                            >
                                            <option value="Lost"
                                                >{$_(
                                                    "journal.filterLost"
                                                )}</option
                                            >
                                        </select>
                                    </td>
                                {/if}

                                {#if columnVisibility.screenshot}
                                    <td class="screenshot-cell">
                                        <div class="flex items-center gap-2">
                                            {#if item.screenshot}
                                                <a
                                                    href={item.screenshot}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    class="screenshot-icon-wrapper relative group text-lg"
                                                    title={$_(
                                                        "journal.labels.view"
                                                    )}
                                                >
                                                    🖼️
                                                    <div
                                                        class="screenshot-hover-preview hidden group-hover:block absolute z-[100] bottom-full left-0 mb-2 p-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-xl"
                                                    >
                                                        <img
                                                            src={item.screenshot}
                                                            alt="Preview"
                                                            class="w-[240px] h-auto rounded"
                                                        />
                                                    </div>
                                                </a>
                                                <button
                                                    class="text-xs opacity-50 hover:opacity-100 text-danger"
                                                    on:click={() =>
                                                        dispatch(
                                                            "updateTrade",
                                                            {
                                                                id: item.id,
                                                                screenshot:
                                                                    undefined,
                                                            }
                                                        )}
                                                    title={$_(
                                                        "journal.labels.removeScreenshot"
                                                    )}
                                                >
                                                    🗑️
                                                </button>
                                            {/if}
                                            <button
                                                class="text-xs opacity-50 hover:opacity-100"
                                                on:click={() =>
                                                    triggerFileUpload(item.id)}
                                                title={item.screenshot
                                                    ? $_(
                                                          "journal.labels.replaceScreenshot"
                                                      )
                                                    : $_(
                                                          "journal.labels.uploadScreenshot"
                                                      )}
                                            >
                                                {item.screenshot ? "↻" : "➕"}
                                            </button>
                                        </div>
                                        <input
                                            type="file"
                                            id="file-upload-{item.id}"
                                            class="hidden"
                                            accept="image/*"
                                            on:change={(e) => {
                                                const file =
                                                    e.currentTarget.files?.[0];
                                                if (file) {
                                                    dispatch(
                                                        "uploadScreenshot",
                                                        { id: item.id, file }
                                                    );
                                                }
                                            }}
                                        />
                                    </td>
                                {/if}

                                {#if columnVisibility.tags}
                                    <td class="tags-cell">
                                        <div
                                            class="flex flex-wrap gap-1 items-center"
                                        >
                                            {#if item.tags && item.tags.length > 0}
                                                {#each item.tags as tag}
                                                    <span
                                                        class="tag-chip text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-color)] text-white flex items-center gap-1 group/tag"
                                                    >
                                                        {tag}
                                                        <button
                                                            class="opacity-50 hover:opacity-100 font-bold leading-none"
                                                            on:click|stopPropagation={() =>
                                                                removeTag(
                                                                    item.id,
                                                                    tag,
                                                                    item.tags ||
                                                                        []
                                                                )}>×</button
                                                        >
                                                    </span>
                                                {/each}
                                            {/if}
                                            <input
                                                type="text"
                                                placeholder="+"
                                                class="tag-add-input text-[10px] bg-transparent border-0 w-8 focus:w-20 transition-all outline-none opacity-50 focus:opacity-100"
                                                bind:value={tagInputValues[
                                                    item.id
                                                ]}
                                                on:keydown={(e) => {
                                                    if (e.key === "Enter") {
                                                        addTag(
                                                            item.id,
                                                            tagInputValues[
                                                                item.id
                                                            ],
                                                            item.tags || []
                                                        );
                                                        tagInputValues[
                                                            item.id
                                                        ] = "";
                                                    }
                                                }}
                                            />
                                        </div>
                                    </td>
                                {/if}
                                {#if columnVisibility.notes}
                                    <td class="notes-cell">
                                        <input
                                            type="text"
                                            value={item.notes || ""}
                                            class="notes-input bg-transparent border-0 text-xs w-full focus:bg-[var(--bg-secondary)] rounded px-1"
                                            placeholder="-"
                                            on:change={(e) =>
                                                dispatch("updateTrade", {
                                                    id: item.id,
                                                    notes: e.currentTarget
                                                        .value,
                                                })}
                                        />
                                    </td>
                                {/if}
                                {#if columnVisibility.action}
                                    <td>
                                        <button
                                            class="delete-btn"
                                            on:click|stopPropagation={() =>
                                                handleDeleteTrade(item.id)}
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                {/if}
                            </tr>
                        {/if}
                    {/each}
                </tbody>
            </table>
        </div>

        {#if !groupBySymbol && !isInternal && trades.length > 0}
            <div class="pagination">
                <div class="pagination-left">
                    <span class="text-xs text-[var(--text-secondary)]"
                        >{$_("journal.pagination.rows")}</span
                    >
                    <select
                        bind:value={itemsPerPage}
                        on:change={handleItemsPerPageChange}
                        class="rows-select bg-transparent border border-[var(--border-color)] rounded px-1 text-xs"
                    >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </div>

                <div class="pagination-controls">
                    <button
                        class="pagination-btn"
                        disabled={currentPage === 1}
                        on:click={() => handlePageChange(currentPage - 1)}
                    >
                        ←
                    </button>
                    <span class="pagination-info">
                        {$_("journal.pagination.page")}
                        {currentPage}
                        {$_("journal.pagination.of")}
                        {Math.max(1, totalPages)}
                    </span>
                    <button
                        class="pagination-btn"
                        disabled={currentPage === totalPages ||
                            totalPages === 0}
                        on:click={() => handlePageChange(currentPage + 1)}
                    >
                        →
                    </button>
                </div>
            </div>
        {/if}
    {/if}
</div>

<style>
    .journal-table-container {
        width: 100%;
        background: var(--card-bg);
    }

    .table-wrapper {
        overflow-x: auto;
        overflow-y: visible;
        max-height: 70vh;
    }

    .journal-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 0.85rem;
    }

    .journal-table th {
        position: sticky;
        top: 0;
        background: var(--bg-tertiary);
        padding: 0.75rem 1rem;
        text-align: left;
        font-weight: 700;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--border-color);
        white-space: nowrap;
        z-index: 10;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .sortable {
        cursor: pointer;
    }

    .sortable:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
    }

    .sort-icon {
        display: inline-block;
        width: 12px;
        margin-left: 4px;
        color: var(--accent-color);
    }

    .journal-table td {
        padding: 0.3rem 0.6rem;
        border-bottom: 1px solid var(--border-color);
        white-space: nowrap;
        vertical-align: middle;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 250px;
    }

    .trade-row:hover {
        background: var(--bg-secondary);
    }

    .group-row {
        background: var(--bg-tertiary);
    }

    .group-row:hover {
        background: var(--bg-secondary);
    }

    .expand-icon {
        font-size: 0.7rem;
        color: var(--text-secondary);
        width: 1.5rem;
        display: inline-block;
        text-align: center;
    }

    .status-select {
        cursor: pointer;
        padding: 0.2rem;
        border-radius: 4px;
        outline: none;
    }

    .delete-btn {
        background: none;
        border: none;
        cursor: pointer;
        opacity: 0.5;
        transition: opacity 0.2s;
    }

    .delete-btn:hover {
        opacity: 1;
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

    .is-recursive {
        background: transparent !important;
    }

    .screenshot-cell {
        min-width: 100px;
    }

    .screenshot-preview {
        position: relative;
        display: inline-block;
    }

    .thumbnail {
        width: 40px;
        height: 40px;
        object-fit: cover;
        border-radius: 4px;
        border: 1px solid var(--border-color);
        transition: transform 0.2s;
    }

    .thumbnail:hover {
        transform: scale(1.1);
    }

    .upload-btn {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        cursor: pointer;
        transition: all 0.2s;
    }

    .upload-btn:hover {
        border-color: var(--accent-color);
        background: var(--bg-tertiary);
    }

    .upload-btn.mini {
        position: absolute;
        bottom: -5px;
        right: -5px;
        padding: 0 4px;
        font-size: 0.65rem;
        background: var(--card-bg);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .hidden {
        display: none;
    }

    .pagination {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background: var(--bg-tertiary);
        border-top: 1px solid var(--border-color);
    }

    .pagination-left {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .pagination-controls {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .pagination-btn {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 0.35rem 0.75rem;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 600;
    }

    .pagination-btn:hover:not(:disabled) {
        background: var(--bg-tertiary);
        border-color: var(--accent-color);
    }

    .pagination-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    .notes-input {
        color: var(--text-primary);
        min-width: 120px;
    }

    .notes-input:focus {
        outline: 1px solid var(--accent-color);
    }

    .screenshot-cell {
        min-width: 60px;
    }

    .tag-chip {
        white-space: nowrap;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .pagination-info {
        font-size: 0.75rem;
        color: var(--text-secondary);
        font-weight: 500;
        min-width: 80px;
        text-align: center;
    }

    .rows-select {
        color: var(--text-primary);
        outline: none;
        cursor: pointer;
    }
</style>
