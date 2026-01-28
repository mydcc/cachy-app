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
    import JournalTable from "./JournalTable.svelte";

    import { _ } from "../../../locales/i18n";
    import { formatDynamicDecimal } from "../../../utils/utils";
    import type { JournalEntry } from "../../../stores/types";
    import { Decimal } from "decimal.js";

    interface Props {
        trades?: any[];
        sortField?: string;
        sortDirection?: "asc" | "desc";
        currentPage?: number;
        itemsPerPage?: number;
        columnVisibility?: Record<string, boolean>;
        groupBySymbol?: boolean;
        isInternal?: boolean;
        // Event Props (Svelte 5)
        onSort?: (field: string) => void;
        onPageChange?: (page: number) => void;
        onDeleteTrade?: (id: number) => void;
        onStatusChange?: (id: number, status: string) => void;
        onItemsPerPageChange?: (itemsPerPage: number) => void;
        onUpdateTrade?: (id: number, data: any) => void;
        onUploadScreenshot?: (id: number, file: File) => void;
    }

    let {
        trades = [],
        sortField = $bindable("date"),
        sortDirection = $bindable("desc"),
        currentPage = $bindable(1),
        itemsPerPage = $bindable(10),
        columnVisibility = {},
        groupBySymbol = false,
        isInternal = false,
        onSort,
        onPageChange,
        onDeleteTrade,
        onStatusChange,
        onItemsPerPageChange,
        onUpdateTrade,
        onUploadScreenshot,
    }: Props = $props();

    // Local sort state for internal tables (pivot view)
    let internalSortField = $state("date");
    let internalSortDirection = $state<"asc" | "desc">("desc");

    // Use internal sort state if this is a nested table
    let activeSortField = $derived(isInternal ? internalSortField : sortField);
    let activeSortDirection = $derived(
        isInternal ? internalSortDirection : sortDirection,
    );

    // State for expanded groups
    let expandedGroups = $state(new Set<string>());

    // Sorted trades for internal tables
    let sortedTrades = $derived.by(() => {
        if (!isInternal) return trades;

        const sorted = [...trades].sort((a, b) => {
            let aVal = a[internalSortField];
            let bVal = b[internalSortField];

            // Handle Decimal objects
            if (aVal?.toNumber) aVal = aVal.toNumber();
            if (bVal?.toNumber) bVal = bVal.toNumber();

            // Handle null/undefined
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            // Compare
            let comparison = 0;
            if (typeof aVal === "string" && typeof bVal === "string") {
                comparison = aVal.localeCompare(bVal);
            } else {
                comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            }

            return internalSortDirection === "asc" ? comparison : -comparison;
        });

        return sorted;
    });

    // Pagination
    let totalPages = $derived(Math.ceil(trades.length / Number(itemsPerPage)));
    let safeCurrentPage = $derived(
        Math.min(Math.max(1, currentPage), Math.max(1, totalPages)),
    );

    let paginatedTrades = $derived(
        isInternal
            ? sortedTrades
            : trades.slice(
                  (safeCurrentPage - 1) * Number(itemsPerPage),
                  safeCurrentPage * Number(itemsPerPage),
              ),
    );

    function handleSort(field: string) {
        if (isInternal) {
            // Local sorting for internal tables
            if (internalSortField === field) {
                internalSortDirection =
                    internalSortDirection === "asc" ? "desc" : "asc";
            } else {
                internalSortField = field;
                internalSortDirection = "desc";
            }
        } else {
            onSort?.(field);
        }
    }

    function handlePageChange(page: number) {
        currentPage = page;
        if (!isInternal) {
            onPageChange?.(page);
        }
    }

    function handleDeleteTrade(id: number) {
        onDeleteTrade?.(id);
    }

    function handleStatusChange(id: number, status: string) {
        onStatusChange?.(id, status);
    }

    function handleItemsPerPageChange() {
        currentPage = 1;
        if (!isInternal) {
            onItemsPerPageChange?.(itemsPerPage);
            onPageChange?.(1);
        }
    }

    function toggleGroup(symbol: string) {
        const newGroups = new Set(expandedGroups);
        if (newGroups.has(symbol)) {
            newGroups.delete(symbol);
        } else {
            newGroups.add(symbol);
        }
        expandedGroups = newGroups;
    }

    function addTag(tradeId: number, tag: string, currentTags: string[] = []) {
        if (!tag || tag.trim() === "") return;
        const trimmedTag = tag.trim();
        if (currentTags.includes(trimmedTag)) return;

        const newTags = [...currentTags, trimmedTag];
        onUpdateTrade?.(tradeId, { tags: newTags });
    }

    function removeTag(
        tradeId: number,
        tagToRemove: string,
        currentTags: string[],
    ) {
        const newTags = currentTags.filter((t) => t !== tagToRemove);
        onUpdateTrade?.(tradeId, { tags: newTags });
    }

    let tagInputValues: Record<number, string> = $state({});

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
        (
            document.getElementById(
                `file-upload-${id}`,
            ) as HTMLInputElement | null
        )?.click();
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
                {#if !isInternal || (isInternal && trades.length > 0)}
                    <thead>
                        <tr>
                            {#if groupBySymbol}
                                <th class="w-8"></th>
                            {/if}
                            {#if columnVisibility.date && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("date")}
                                    class="sortable col-date"
                                >
                                    {$_("journal.table.date")}
                                    <span class="sort-icon"
                                        >{activeSortField === "date"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.symbol}
                                <th
                                    onclick={() => handleSort("symbol")}
                                    class="sortable col-symbol"
                                >
                                    {$_("journal.table.symbol")}
                                    <span class="sort-icon"
                                        >{activeSortField === "symbol"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.type && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("tradeType")}
                                    class="sortable"
                                >
                                    {$_("journal.table.type")}
                                    <span class="sort-icon"
                                        >{activeSortField === "tradeType"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.entry && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("entryPrice")}
                                    class="sortable"
                                >
                                    {$_("journal.table.entry")}
                                    <span class="sort-icon"
                                        >{activeSortField === "entryPrice"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.exit && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("exitPrice")}
                                    class="sortable"
                                >
                                    {$_("journal.table.exit")}
                                    <span class="sort-icon"
                                        >{activeSortField === "exitPrice"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.atr && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("atrValue")}
                                    class="sortable"
                                >
                                    {$_("journal.table.atr")}
                                    <span class="sort-icon"
                                        >{activeSortField === "atrValue"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.sl && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("stopLossPrice")}
                                    class="sortable"
                                >
                                    {$_("journal.table.sl")}
                                    <span class="sort-icon"
                                        >{activeSortField === "stopLossPrice"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.size && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("positionSize")}
                                    class="sortable"
                                >
                                    {$_("journal.table.size")}
                                    <span class="sort-icon"
                                        >{activeSortField === "positionSize"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.pnl}
                                <th
                                    onclick={() => handleSort("totalNetProfit")}
                                    class="sortable"
                                >
                                    {$_("journal.table.pnl")}
                                    <span class="sort-icon"
                                        >{activeSortField === "totalNetProfit"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.funding && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("fundingFee")}
                                    class="sortable"
                                >
                                    {$_("journal.table.funding")}
                                    <span class="sort-icon"
                                        >{activeSortField === "fundingFee"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.rr}
                                <th
                                    onclick={() => handleSort("totalRR")}
                                    class="sortable"
                                >
                                    {$_("journal.table.rr")}
                                    <span class="sort-icon"
                                        >{activeSortField === "totalRR"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.mae && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("mae")}
                                    class="sortable"
                                >
                                    {$_("journal.table.mae")}
                                    <span class="sort-icon"
                                        >{activeSortField === "mae"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.mfe && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("mfe")}
                                    class="sortable"
                                >
                                    {$_("journal.table.mfe")}
                                    <span class="sort-icon"
                                        >{activeSortField === "mfe"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.efficiency && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("efficiency")}
                                    class="sortable"
                                >
                                    {$_("journal.table.efficiency")}
                                    <span class="sort-icon"
                                        >{activeSortField === "efficiency"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.duration && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("duration")}
                                    class="sortable col-duration"
                                >
                                    {$_("journal.table.duration")}
                                    <span class="sort-icon"
                                        >{activeSortField === "duration"
                                            ? activeSortDirection === "asc"
                                                ? "↑"
                                                : "↓"
                                            : ""}</span
                                    >
                                </th>
                            {/if}
                            {#if columnVisibility.status && !groupBySymbol}
                                <th
                                    onclick={() => handleSort("status")}
                                    class="sortable"
                                >
                                    {$_("journal.table.status")}
                                </th>
                            {/if}
                            {#if columnVisibility.screenshot && !groupBySymbol}
                                <th>{$_("journal.table.screenshot")}</th>
                            {/if}
                            {#if columnVisibility.tags && !groupBySymbol}
                                <th>{$_("journal.table.tags")}</th>
                            {/if}
                            {#if columnVisibility.notes && !groupBySymbol}<th
                                    >{$_("journal.table.notes")}</th
                                >{/if}
                            {#if columnVisibility.action && !groupBySymbol}<th
                                    >{$_("journal.table.action")}</th
                                >{/if}
                        </tr>
                    </thead>
                {/if}
                <tbody class:is-recursive={isInternal}>
                    {#each isInternal ? sortedTrades : paginatedTrades as item}
                        {#if item.isGroup}
                            <tr
                                class="group-row cursor-pointer"
                                onclick={() => toggleGroup(item.symbol)}
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
                                {#if columnVisibility.symbol}
                                    <td class="font-bold col-symbol"
                                        >{item.symbol} ({item.totalTrades})</td
                                    >
                                {/if}
                                {#if columnVisibility.pnl}
                                    <td
                                        class="font-bold {getProfitClass(
                                            item.totalProfitLoss,
                                        )}"
                                    >
                                        {formatDynamicDecimal(
                                            item.totalProfitLoss,
                                            2,
                                        )}
                                    </td>
                                {/if}
                                {#if columnVisibility.rr}
                                    <td>
                                        {(
                                            (item.wonTrades /
                                                item.totalTrades) *
                                            100
                                        ).toFixed(1)}% Win
                                    </td>
                                {/if}
                            </tr>

                            {#if expandedGroups.has(item.symbol)}
                                <tr class="sub-row">
                                    <td
                                        class="border-l-4 border-[var(--accent-color)]"
                                        style="padding: 0;"
                                    ></td>
                                    <td colspan="100" style="padding: 0;">
                                        <JournalTable
                                            trades={item.trades}
                                            {columnVisibility}
                                            isInternal={true}
                                            {onStatusChange}
                                            {onDeleteTrade}
                                            {onUpdateTrade}
                                            {onUploadScreenshot}
                                        />
                                    </td>
                                </tr>
                            {/if}
                        {:else}
                            <tr class="trade-row">
                                {#if groupBySymbol && !isInternal}<td></td>{/if}
                                {#if columnVisibility.date}
                                    <td
                                        class="text-xs text-[var(--text-secondary)] col-date"
                                    >
                                        {new Date(item.date).toLocaleString(
                                            undefined,
                                            {
                                                day: "2-digit",
                                                month: "2-digit",
                                                year: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            },
                                        )}
                                    </td>
                                {/if}
                                {#if columnVisibility.symbol}
                                    <td class="font-medium col-symbol"
                                        >{item.symbol}</td
                                    >
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
                                            4,
                                        )}</td
                                    >
                                {/if}
                                {#if columnVisibility.exit}
                                    <td
                                        >{item.exitPrice &&
                                        !item.exitPrice.isZero()
                                            ? formatDynamicDecimal(
                                                  item.exitPrice,
                                                  4,
                                              )
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.atr}
                                    <td
                                        class="text-xs text-[var(--text-secondary)]"
                                        >{item.atrValue !== undefined &&
                                        item.atrValue !== null
                                            ? formatDynamicDecimal(
                                                  item.atrValue,
                                                  4,
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
                                                  4,
                                              )
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.size}
                                    <td class="text-xs"
                                        >{item.positionSize
                                            ? formatDynamicDecimal(
                                                  item.positionSize,
                                                  4,
                                              )
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.pnl}
                                    <td
                                        class="font-bold {getProfitClass(
                                            item.totalNetProfit,
                                        )}"
                                    >
                                        {item.totalNetProfit.toFixed(2)}
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
                                                  2,
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
                                        {item.totalRR &&
                                        item.stopLossPrice &&
                                        !item.stopLossPrice.isZero()
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
                                            ? item.efficiency
                                                  .times(100)
                                                  .toFixed(0) + "%"
                                            : "-"}
                                    </td>
                                {/if}
                                {#if columnVisibility.duration}
                                    <td class="text-xs col-duration">
                                        {(() => {
                                            const start = new Date(
                                                item.entryDate || item.date,
                                            ).getTime();
                                            const end = new Date(
                                                item.date,
                                            ).getTime();
                                            const diff =
                                                isNaN(start) || isNaN(end)
                                                    ? 0
                                                    : Math.max(0, end - start);
                                            return formatDuration(
                                                Math.floor(diff / 60000),
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
                                                      : '0',
                                            )}"
                                            disabled={item.isManual === false}
                                            onchange={(e) =>
                                                handleStatusChange(
                                                    item.id,
                                                    e.currentTarget.value,
                                                )}
                                        >
                                            <option value="Open"
                                                >{$_(
                                                    "journal.filterOpen",
                                                )}</option
                                            >
                                            <option value="Won"
                                                >{$_(
                                                    "journal.filterWon",
                                                )}</option
                                            >
                                            <option value="Lost"
                                                >{$_(
                                                    "journal.filterLost",
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
                                                        "journal.labels.view" as any,
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
                                                    onclick={() =>
                                                        onUpdateTrade?.(
                                                            item.id,
                                                            {
                                                                screenshot:
                                                                    undefined,
                                                            },
                                                        )}
                                                    title={$_(
                                                        "journal.labels.removeScreenshot" as any,
                                                    )}
                                                >
                                                    🗑️
                                                </button>
                                            {/if}
                                            <button
                                                class="text-xs opacity-50 hover:opacity-100"
                                                onclick={() =>
                                                    triggerFileUpload(item.id)}
                                                title={item.screenshot
                                                    ? $_(
                                                          "journal.labels.replaceScreenshot",
                                                      )
                                                    : $_(
                                                          "journal.labels.uploadScreenshot",
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
                                            onchange={(e) => {
                                                const file =
                                                    e.currentTarget.files?.[0];
                                                if (file) {
                                                    onUploadScreenshot?.(
                                                        item.id,
                                                        file,
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
                                                        class="tag-chip text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-color)] text-[var(--btn-accent-text)] flex items-center gap-1 group/tag"
                                                    >
                                                        {tag}
                                                        <button
                                                            class="opacity-50 hover:opacity-100 font-bold leading-none"
                                                            onclick={(e) => {
                                                                e.stopPropagation();
                                                                removeTag(
                                                                    item.id,
                                                                    tag,
                                                                    item.tags ||
                                                                        [],
                                                                );
                                                            }}>×</button
                                                        >
                                                    </span>
                                                {/each}
                                            {/if}
                                            <input
                                                type="text"
                                                placeholder="+"
                                                class="tag-add-input text-[10px] bg-transparent border-0 w-8 focus:w-20 transition-all outline-none opacity-50 focus:opacity-100"
                                                bind:value={
                                                    tagInputValues[item.id]
                                                }
                                                onkeydown={(e) => {
                                                    if (e.key === "Enter") {
                                                        addTag(
                                                            item.id,
                                                            tagInputValues[
                                                                item.id
                                                            ],
                                                            item.tags || [],
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
                                            onchange={(e) =>
                                                onUpdateTrade?.(item.id, {
                                                    notes: e.currentTarget
                                                        .value,
                                                })}
                                        />
                                    </td>
                                {/if}
                                {#if columnVisibility.action}
                                    <td class="action-cell">
                                        <div class="flex items-center gap-2">
                                            <button
                                                class="text-xs opacity-50 hover:opacity-100 text-danger"
                                                onclick={() =>
                                                    handleDeleteTrade(item.id)}
                                                title={$_(
                                                    "journal.labels.delete" as any,
                                                )}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                {/if}
                            </tr>
                        {/if}
                    {/each}
                </tbody>
            </table>
        </div>

        {#if totalPages > 1 && !isInternal}
            <div class="pagination-footer">
                <div class="flex items-center gap-3">
                    <button
                        class="px-3 py-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        disabled={currentPage === 1}
                        onclick={() => handlePageChange(currentPage - 1)}
                    >
                        ◀
                    </button>
                    <span class="text-sm font-medium min-w-[60px] text-center">
                        {currentPage} / {totalPages}
                    </span>
                    <button
                        class="px-3 py-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        disabled={currentPage === totalPages}
                        onclick={() => handlePageChange(currentPage + 1)}
                    >
                        ▶
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-sm"
                        >{$_("journal.table.itemsPerPage")}:</span
                    >
                    <select
                        bind:value={itemsPerPage}
                        onchange={handleItemsPerPageChange}
                        class="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-sm hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                    >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </div>
            </div>
        {/if}
    {/if}
</div>

<style>
    .journal-table-container {
        width: 100%;
    }

    .table-wrapper {
        min-width: 800px;
        overflow-x: auto;
    }

    .journal-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8rem;
    }

    .journal-table th {
        text-align: left;
        padding: 0.75rem 0.75rem;
        border-bottom: 2px solid var(--border-color);
        color: var(--text-secondary);
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.7rem;
        letter-spacing: 0.05em;
    }

    /* Improved column widths for better spacing */
    .col-date {
        min-width: 145px;
        padding-right: 1rem !important;
        white-space: nowrap;
    }

    .col-symbol {
        min-width: 110px;
        padding-right: 1rem !important;
        white-space: nowrap;
    }

    .col-duration {
        white-space: nowrap;
    }

    .journal-table th.sortable {
        cursor: pointer;
        user-select: none;
    }

    .journal-table th.sortable:hover {
        color: var(--text-primary);
    }

    .journal-table td {
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid var(--border-color);
        vertical-align: middle;
    }

    .trade-row:hover {
        background-color: var(--bg-secondary);
    }

    .group-row {
        background-color: var(--bg-tertiary);
    }

    .group-row:hover {
        background-color: var(--bg-secondary);
    }

    .sub-row td {
        background-color: transparent;
        padding: 0;
        border-bottom: 0;
    }

    .is-recursive {
        background-color: transparent;
    }

    /* Compact padding for nested trade rows */
    .is-recursive td {
        padding: 0.25rem 0.5rem;
    }

    .pagination-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 1.5rem;
    }

    .status-select {
        cursor: pointer;
        outline: none;
    }

    /* Remove dropdown arrow for disabled status selects */
    .status-select:disabled {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        cursor: default;
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

    .screenshot-cell {
        min-width: 80px;
    }

    .tags-cell {
        min-width: 120px;
    }

    .notes-cell {
        min-width: 100px;
    }
</style>
