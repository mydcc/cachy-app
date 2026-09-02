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
    import { _ } from "../../../locales/i18n";
    import { formatDynamicDecimal } from "../../../utils/utils";
    import { Decimal } from "decimal.js";
    import type { JournalEntry, JournalTableRow, JournalGroupSummary } from "../../../stores/types";

    interface Props {
        trades?: JournalTableRow[];
        sortField?: string;
        sortDirection?: "asc" | "desc";
        currentPage?: number;
        itemsPerPage?: number;
        columnVisibility?: Record<string, boolean>;
        groupBySymbol?: boolean;
        currency?: string;
        // Event Props
        onSort?: (field: string) => void;
        onPageChange?: (page: number) => void;
        onDeleteTrade?: (id: number | string) => void;
        onItemsPerPageChange?: (itemsPerPage: number) => void;
        onOpenTradeDetail?: (trade: JournalEntry) => void;
    }

    let {
        trades = [],
        sortField = $bindable("date"),
        sortDirection = $bindable("desc"),
        currentPage = $bindable(1),
        itemsPerPage = $bindable(10),
        columnVisibility = {},
        groupBySymbol = false,
        currency = "USDT",
        onSort,
        onPageChange,
        onDeleteTrade,
        onItemsPerPageChange,
        onOpenTradeDetail,
    }: Props = $props();

    // Derived visibility merged with defaults
    let visibility = $derived({
        date: columnVisibility?.date ?? true,
        symbol: columnVisibility?.symbol ?? true,
        type: columnVisibility?.type ?? true,
        entry: columnVisibility?.entry ?? true,
        exit: columnVisibility?.exit ?? true,
        sl: columnVisibility?.sl ?? true,
        slAtr: columnVisibility?.slAtr ?? false,
        atr: columnVisibility?.atr ?? false,
        size: columnVisibility?.size ?? true,
        entryFee: columnVisibility?.entryFee ?? true,
        exitFee: columnVisibility?.exitFee ?? true,
        totalFees: columnVisibility?.totalFees ?? true,
        funding: columnVisibility?.funding ?? false,
        pnl: columnVisibility?.pnl ?? true,
        rr: columnVisibility?.rr ?? true,
        mae: columnVisibility?.mae ?? false,
        mfe: columnVisibility?.mfe ?? false,
        efficiency: columnVisibility?.efficiency ?? false,
        duration: columnVisibility?.duration ?? false,
        status: columnVisibility?.status ?? true,
        screenshot: columnVisibility?.screenshot ?? false,
        tags: columnVisibility?.tags ?? false,
        notes: columnVisibility?.notes ?? false,
        action: columnVisibility?.action ?? true,
    });

    let internalSortField = $state("date");
    let internalSortDirection = $state<"asc" | "desc">("desc");
    let expandedGroups = $state(new Set<string>());

    function isGroupRow(row: JournalTableRow): row is JournalGroupSummary {
        return "isGroup" in row && (row as JournalGroupSummary).isGroup === true;
    }

    function isEntryRow(row: JournalTableRow): row is JournalEntry {
        return !isGroupRow(row);
    }

    function sortTradesList(
        list: JournalEntry[],
        field: string,
        direction: "asc" | "desc",
    ): JournalEntry[] {
        return [...list].sort((a, b) => {
            const rawA = a as unknown as Record<string, string | number | Decimal | undefined | null>;
            const rawB = b as unknown as Record<string, string | number | Decimal | undefined | null>;
            let aVal = rawA[field];
            let bVal = rawB[field];

            if (aVal instanceof Decimal) aVal = aVal.toNumber();
            if (bVal instanceof Decimal) bVal = bVal.toNumber();

            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            let comparison: number;
            if (field === "slAtr") {
                const getSlAtr = (item: JournalEntry) => {
                    if (!item.entryPrice || !item.stopLossPrice || !item.atrValue) return -1;
                    const entry = new Decimal(item.entryPrice);
                    const sl = new Decimal(item.stopLossPrice);
                    const atr = new Decimal(item.atrValue);
                    if (atr.isZero()) return -1;
                    return entry.minus(sl).abs().div(atr).toNumber();
                };
                aVal = getSlAtr(a);
                bVal = getSlAtr(b);
            }

            if (typeof aVal === "string" && typeof bVal === "string") {
                comparison = aVal.localeCompare(bVal);
            } else {
                comparison = (aVal as number) < (bVal as number) ? -1 : (aVal as number) > (bVal as number) ? 1 : 0;
            }

            return direction === "asc" ? comparison : -comparison;
        });
    }

    let safeItemsPerPage = $derived(Math.max(1, Number(itemsPerPage || 10)));
    let totalPages = $derived(
        Math.ceil((trades?.length || 0) / safeItemsPerPage),
    );
    let safeCurrentPage = $derived(
        Math.min(Math.max(1, currentPage || 1), Math.max(1, totalPages || 1)) || 1,
    );

    let paginatedTrades = $derived.by(() => {
        const list = trades || [];
        const start = (safeCurrentPage - 1) * safeItemsPerPage;
        const end = safeCurrentPage * safeItemsPerPage;
        return list.slice(Math.max(0, start), Math.min(list.length, end));
    });

    let sortedGroupTrades = $derived.by(() => {
        const map = new Map<string, JournalEntry[]>();
        for (const item of paginatedTrades) {
            if (isGroupRow(item) && expandedGroups.has(item.symbol) && item.trades) {
                map.set(item.symbol, sortTradesList(item.trades, internalSortField, internalSortDirection));
            }
        }
        return map;
    });

    function handleMainSort(field: string) {
        onSort?.(field);
    }

    function handlePageChange(page: number) {
        currentPage = page;
        onPageChange?.(page);
    }

    function handleItemsPerPageChange() {
        currentPage = 1;
        onItemsPerPageChange?.(itemsPerPage);
        onPageChange?.(1);
    }

    function toggleGroup(symbol: string) {
        const next = new Set(expandedGroups);
        if (next.has(symbol)) {
            next.delete(symbol);
        } else {
            next.add(symbol);
        }
        expandedGroups = next;
    }

    function formatDuration(startStr?: string, endStr?: string, fallbackDate?: string): string {
        const start = new Date(startStr || fallbackDate || "").getTime();
        const end = new Date(endStr || fallbackDate || "").getTime();
        if (isNaN(start) || isNaN(end) || end <= start) return "—";
        const diffMs = end - start;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
        if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
        return `${diffMins}m`;
    }

    function getNetPnl(item: JournalTableRow): Decimal {
        if (isGroupRow(item)) return item.totalProfitLoss || new Decimal(0);
        return item.totalNetProfit || item.realizedPnl || new Decimal(0);
    }

    function getTotalFees(item: JournalTableRow): Decimal {
        if (item.totalFees) return new Decimal(item.totalFees);
        if (isEntryRow(item)) {
            if (item.tradingFee) return new Decimal(item.tradingFee);
            if (item.fees) return new Decimal(item.fees);
            const entry = item.entryFee ? new Decimal(item.entryFee) : new Decimal(0);
            const exit = item.exitFee ? new Decimal(item.exitFee) : new Decimal(0);
            return entry.plus(exit);
        }
        return new Decimal(0);
    }

    function getEntryFee(row: JournalTableRow): Decimal | null {
        if ("isGroup" in row) return row.entryFee || null;
        if (row.entryFee && new Decimal(row.entryFee).gt(0)) return new Decimal(row.entryFee);
        const total = getTotalFees(row);
        if (total.gt(0)) {
            if (row.entryPrice && row.exitPrice && new Decimal(row.entryPrice).gt(0) && new Decimal(row.exitPrice).gt(0)) {
                const ep = new Decimal(row.entryPrice);
                const xp = new Decimal(row.exitPrice);
                return total.times(ep).div(ep.plus(xp));
            }
            return total.div(2);
        }
        return null;
    }

    function getExitFee(row: JournalTableRow): Decimal | null {
        if ("isGroup" in row) return row.exitFee || null;
        if (row.exitFee && new Decimal(row.exitFee).gt(0)) return new Decimal(row.exitFee);
        const total = getTotalFees(row);
        if (total.gt(0)) {
            const entry = getEntryFee(row);
            if (entry) return Decimal.max(0, total.minus(entry));
        }
        return null;
    }

    function getEntryFeeType(row: JournalTableRow): "M" | "T" {
        if ("isGroup" in row) return "T";
        if (row.entryFeeType === "maker") return "M";
        if (row.feeMode?.startsWith("maker")) return "M";
        return "T";
    }

    function getExitFeeType(row: JournalTableRow): "M" | "T" {
        if ("isGroup" in row) return "T";
        if (row.exitFeeType === "maker") return "M";
        if (row.feeMode?.endsWith("maker")) return "M";
        return "T";
    }

    function getTradeRR(trade: JournalTableRow): Decimal | null {
        if (isGroupRow(trade)) return null;
        if (trade.totalRR && !(trade.totalRR instanceof Decimal ? trade.totalRR.isZero() : new Decimal(trade.totalRR).isZero())) {
            return trade.totalRR instanceof Decimal ? trade.totalRR : new Decimal(trade.totalRR);
        }
        // Fallback 1: netProfit / riskAmount
        const pnl = trade.totalNetProfit || trade.realizedPnl;
        const risk = trade.riskAmount;
        if (pnl && risk) {
            const pnlDec = pnl instanceof Decimal ? pnl : new Decimal(pnl);
            const riskDec = risk instanceof Decimal ? risk : new Decimal(risk);
            if (riskDec.gt(0)) {
                return pnlDec.div(riskDec);
            }
        }
        // Fallback 2: Price distance vs StopLoss
        if (trade.entryPrice && trade.exitPrice && trade.stopLossPrice) {
            const entry = trade.entryPrice instanceof Decimal ? trade.entryPrice : new Decimal(trade.entryPrice);
            const exit = trade.exitPrice instanceof Decimal ? trade.exitPrice : new Decimal(trade.exitPrice);
            const sl = trade.stopLossPrice instanceof Decimal ? trade.stopLossPrice : new Decimal(trade.stopLossPrice);
            const riskDist = entry.minus(sl).abs();
            if (riskDist.gt(0)) {
                const gainDist = trade.tradeType === "long" ? exit.minus(entry) : entry.minus(exit);
                return gainDist.div(riskDist);
            }
        }
        // Fallback 3: Using ATR if SL is not present
        if (trade.entryPrice && trade.exitPrice && trade.atrValue) {
            const entry = trade.entryPrice instanceof Decimal ? trade.entryPrice : new Decimal(trade.entryPrice);
            const exit = trade.exitPrice instanceof Decimal ? trade.exitPrice : new Decimal(trade.exitPrice);
            const atr = trade.atrValue instanceof Decimal ? trade.atrValue : new Decimal(trade.atrValue);
            if (atr.gt(0)) {
                const gainDist = trade.tradeType === "long" ? exit.minus(entry) : entry.minus(exit);
                return gainDist.div(atr.times(1.5));
            }
        }
        return null;
    }

    let activeHoverScreenshot: { url: string; symbol: string; x: number; y: number } | null = $state(null);
    let activeLightboxScreenshot: { url: string; symbol: string } | null = $state(null);

    function updateHoverPosition(e: MouseEvent, url: string, symbol: string) {
        const popoverWidth = 440;
        const estimatedHeight = 320;
        const winW = typeof window !== "undefined" ? window.innerWidth : 1920;
        const winH = typeof window !== "undefined" ? window.innerHeight : 1080;

        let x = e.clientX + 14;
        let y = e.clientY - 24;

        // Flip to left if overflowing viewport right
        if (x + popoverWidth > winW - 16) {
            x = e.clientX - popoverWidth - 14;
        }
        // Clamp Y to viewport
        if (y + estimatedHeight > winH - 16) {
            y = Math.max(16, winH - estimatedHeight - 16);
        }
        if (y < 16) {
            y = 16;
        }

        activeHoverScreenshot = { url, symbol, x, y };
    }

    function handleThumbnailMouseLeave() {
        activeHoverScreenshot = null;
    }

    function openLightbox(url: string, symbol: string, e: MouseEvent) {
        e.stopPropagation();
        activeHoverScreenshot = null;
        activeLightboxScreenshot = { url, symbol };
    }

    function closeLightbox() {
        activeLightboxScreenshot = null;
    }

    function handleRowClick(row: JournalTableRow, e: MouseEvent) {
        // Prevent opening drawer if user clicked on button, select, or input
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("select") || target.closest("input") || target.closest("a")) {
            return;
        }

        if (isGroupRow(row)) {
            toggleGroup(row.symbol);
        } else if (isEntryRow(row)) {
            onOpenTradeDetail?.(row);
        }
    }
</script>

<div class="journal-table-container">
    <div class="table-responsive-wrapper">
        <table class="journal-table">
            <thead>
                <tr>
                    {#if visibility.date}
                        <th
                            onclick={() => handleMainSort("date")}
                            class="sortable sticky-col col-date"
                        >
                            {$_("journal.table.date")}
                            <span class="sort-icon">{sortField === "date" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.symbol}
                        <th
                            onclick={() => handleMainSort("symbol")}
                            class="sortable sticky-col col-symbol"
                        >
                            {$_("journal.table.symbol")}
                            <span class="sort-icon">{sortField === "symbol" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.type && !groupBySymbol}
                        <th onclick={() => handleMainSort("tradeType")} class="sortable">
                            {$_("journal.table.type")}
                            <span class="sort-icon">{sortField === "tradeType" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.entry && !groupBySymbol}
                        <th onclick={() => handleMainSort("entryPrice")} class="sortable text-right">
                            {$_("journal.table.entry")}
                            <span class="sort-icon">{sortField === "entryPrice" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.exit && !groupBySymbol}
                        <th onclick={() => handleMainSort("exitPrice")} class="sortable text-right">
                            {$_("journal.table.exit")}
                            <span class="sort-icon">{sortField === "exitPrice" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.sl && !groupBySymbol}
                        <th onclick={() => handleMainSort("stopLossPrice")} class="sortable text-right">
                            {$_("journal.table.sl")}
                            <span class="sort-icon">{sortField === "stopLossPrice" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.slAtr && !groupBySymbol}
                        <th class="text-right">
                            {$_("journal.table.slAtr")}
                        </th>
                    {/if}
                    {#if visibility.atr && !groupBySymbol}
                        <th onclick={() => handleMainSort("atrValue")} class="sortable text-right">
                            {$_("journal.table.atr")}
                            <span class="sort-icon">{sortField === "atrValue" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.size && !groupBySymbol}
                        <th onclick={() => handleMainSort("positionSize")} class="sortable text-right">
                            {$_("journal.table.size")}
                            <span class="sort-icon">{sortField === "positionSize" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.entryFee && !groupBySymbol}
                        <th onclick={() => handleMainSort("entryFee")} class="sortable text-right">
                            {$_("journal.table.entryFee")}
                            <span class="sort-icon">{sortField === "entryFee" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.exitFee && !groupBySymbol}
                        <th onclick={() => handleMainSort("exitFee")} class="sortable text-right">
                            {$_("journal.table.exitFee")}
                            <span class="sort-icon">{sortField === "exitFee" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.totalFees}
                        <th onclick={() => handleMainSort("totalFees")} class="sortable text-right">
                            {$_("journal.table.totalFees")}
                            <span class="sort-icon">{sortField === "totalFees" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.funding && !groupBySymbol}
                        <th onclick={() => handleMainSort("fundingFee")} class="sortable text-right">
                            {$_("journal.table.funding")}
                            <span class="sort-icon">{sortField === "fundingFee" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.rr && !groupBySymbol}
                        <th onclick={() => handleMainSort("totalRR")} class="sortable text-right">
                            {$_("journal.table.rr")}
                            <span class="sort-icon">{sortField === "totalRR" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.mae && !groupBySymbol}
                        <th onclick={() => handleMainSort("mae")} class="sortable text-right">
                            {$_("journal.table.mae")}
                            <span class="sort-icon">{sortField === "mae" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.mfe && !groupBySymbol}
                        <th onclick={() => handleMainSort("mfe")} class="sortable text-right">
                            {$_("journal.table.mfe")}
                            <span class="sort-icon">{sortField === "mfe" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.efficiency && !groupBySymbol}
                        <th onclick={() => handleMainSort("efficiency")} class="sortable text-right">
                            {$_("journal.table.efficiency")}
                            <span class="sort-icon">{sortField === "efficiency" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.duration && !groupBySymbol}
                        <th>{$_("journal.table.duration")}</th>
                    {/if}
                    {#if visibility.status}
                        <th onclick={() => handleMainSort("status")} class="sortable text-center">
                            {$_("journal.table.status")}
                            <span class="sort-icon">{sortField === "status" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.screenshot && !groupBySymbol}
                        <th class="text-center">{$_("journal.table.screenshot")}</th>
                    {/if}
                    {#if visibility.tags && !groupBySymbol}
                        <th>{$_("journal.table.tags")}</th>
                    {/if}
                    {#if visibility.notes && !groupBySymbol}
                        <th>{$_("journal.table.notes")}</th>
                    {/if}
                    {#if visibility.pnl}
                        <th
                            onclick={() => handleMainSort("totalNetProfit")}
                            class="sortable text-right sticky-col-right col-pnl"
                        >
                            {$_("journal.table.pnl")}
                            <span class="sort-icon">{sortField === "totalNetProfit" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
                        </th>
                    {/if}
                    {#if visibility.action}
                        <th class="text-center sticky-col-right col-action">
                            {$_("journal.table.action")}
                        </th>
                    {/if}
                </tr>
            </thead>
            <tbody>
                {#if paginatedTrades.length === 0}
                    <tr>
                        <td colspan="20" class="text-center py-8 text-[var(--text-secondary)] text-sm">
                            {$_("journal.noTradesYet")}
                        </td>
                    </tr>
                {:else}
                    {#each paginatedTrades as item (item.id)}
                        {@const netPnl = getNetPnl(item)}
                        {@const isGroup = isGroupRow(item)}
                        {@const entryItem = isEntryRow(item) ? item : null}
                        
                        <tr
                            class="table-row cursor-pointer transition-colors"
                            class:group-header-row={isGroup}
                            onclick={(e) => handleRowClick(item, e)}
                        >
                            {#if visibility.date}
                                <td class="sticky-col col-date font-mono text-xs text-[var(--text-secondary)] whitespace-nowrap">
                                    {isGroup ? "—" : new Date(item.date).toLocaleDateString()}
                                </td>
                            {/if}
                            {#if visibility.symbol}
                                <td class="sticky-col col-symbol font-bold whitespace-nowrap">
                                    <div class="flex items-center gap-1.5">
                                        {#if isGroup}
                                            <button
                                                class="group-toggle-btn"
                                                onclick={() => toggleGroup(item.symbol)}
                                                aria-label={$_("journal.clickToExpand")}
                                            >
                                                {expandedGroups.has(item.symbol) ? "▼" : "▶"}
                                            </button>
                                        {/if}
                                        <span>{item.symbol}</span>
                                        {#if entryItem?.isPaper}
                                            <span class="text-[9px] px-1 py-0.2 rounded font-bold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                                                SIM
                                            </span>
                                        {/if}
                                    </div>
                                </td>
                            {/if}
                            {#if visibility.type && !groupBySymbol}
                                <td class="whitespace-nowrap">
                                    {#if entryItem}
                                        <span
                                            class="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase"
                                            class:bg-success-paired={entryItem.tradeType === "long"}
                                            class:bg-danger-paired={entryItem.tradeType !== "long"}
                                        >
                                            {entryItem.tradeType === "long" ? $_("journal.labels.long") : $_("journal.labels.short")}
                                        </span>
                                    {/if}
                                </td>
                            {/if}
                            {#if visibility.entry && !groupBySymbol}
                                <td class="font-mono text-xs text-right whitespace-nowrap">
                                    {entryItem ? formatDynamicDecimal(entryItem.entryPrice, 4) : "—"}
                                </td>
                            {/if}
                            {#if visibility.exit && !groupBySymbol}
                                <td class="font-mono text-xs text-right whitespace-nowrap">
                                    {entryItem?.exitPrice ? formatDynamicDecimal(entryItem.exitPrice, 4) : "—"}
                                </td>
                            {/if}
                            {#if visibility.sl && !groupBySymbol}
                                <td class="font-mono text-xs text-right text-[var(--danger-color)] whitespace-nowrap">
                                    {entryItem?.stopLossPrice ? formatDynamicDecimal(entryItem.stopLossPrice, 4) : "—"}
                                </td>
                            {/if}
                            {#if visibility.slAtr && !groupBySymbol}
                                <td class="font-mono text-xs text-right text-[var(--text-secondary)] whitespace-nowrap">
                                    {(() => {
                                        if (!entryItem?.entryPrice || !entryItem?.stopLossPrice || !entryItem?.atrValue || entryItem.atrValue.isZero() || entryItem.stopLossPrice.isZero()) return "—";
                                        const dist = entryItem.entryPrice.minus(entryItem.stopLossPrice).abs();
                                        const mult = dist.div(entryItem.atrValue);
                                        return mult.toFixed(2) + "x";
                                    })()}
                                </td>
                            {/if}
                            {#if visibility.atr && !groupBySymbol}
                                <td class="font-mono text-xs text-right text-[var(--text-secondary)] whitespace-nowrap">
                                    {entryItem?.atrValue ? formatDynamicDecimal(entryItem.atrValue, 4) : "—"}
                                </td>
                            {/if}
                            {#if visibility.size && !groupBySymbol}
                                <td class="font-mono text-xs text-right whitespace-nowrap">
                                    {entryItem?.positionSize ? formatDynamicDecimal(entryItem.positionSize, 4) : "—"}
                                </td>
                            {/if}
                            {#if visibility.entryFee && !groupBySymbol}
                                <td class="font-mono text-xs text-right text-[var(--warning-color)] whitespace-nowrap">
                                    {#if getEntryFee(item)}
                                        <span class="flex items-center justify-end gap-1">
                                            <span>-{formatDynamicDecimal(getEntryFee(item)!, 2)}</span>
                                            <span class="text-[9px] px-1 py-0.2 rounded font-bold bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                                                {getEntryFeeType(item)}
                                            </span>
                                        </span>
                                    {:else}
                                        —
                                    {/if}
                                </td>
                            {/if}
                            {#if visibility.exitFee && !groupBySymbol}
                                <td class="font-mono text-xs text-right text-[var(--warning-color)] whitespace-nowrap">
                                    {#if getExitFee(item)}
                                        <span class="flex items-center justify-end gap-1">
                                            <span>-{formatDynamicDecimal(getExitFee(item)!, 2)}</span>
                                            <span class="text-[9px] px-1 py-0.2 rounded font-bold bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                                                {getExitFeeType(item)}
                                            </span>
                                        </span>
                                    {:else}
                                        —
                                    {/if}
                                </td>
                            {/if}
                            {#if visibility.totalFees}
                                <td class="font-mono text-xs text-right text-[var(--warning-color)] whitespace-nowrap">
                                    -{formatDynamicDecimal(getTotalFees(item), 2)}
                                </td>
                            {/if}
                            {#if visibility.funding && !groupBySymbol}
                                <td class="font-mono text-xs text-right whitespace-nowrap" class:text-[var(--danger-color)]={entryItem?.fundingFee?.gt(0)} class:text-[var(--success-color)]={entryItem?.fundingFee?.lt(0)}>
                                    {entryItem?.fundingFee ? formatDynamicDecimal(entryItem.fundingFee, 2) : "0.00"}
                                </td>
                            {/if}
                            {#if visibility.rr && !groupBySymbol}
                                {@const rrVal = getTradeRR(item)}
                                <td
                                    class="font-mono text-xs text-right whitespace-nowrap font-bold"
                                    class:text-[var(--success-color)]={rrVal?.gt(2)}
                                    class:text-[var(--warning-color)]={rrVal && rrVal.gt(1) && rrVal.lte(2)}
                                    class:text-[var(--danger-color)]={rrVal?.lt(0)}
                                >
                                    {rrVal ? `${formatDynamicDecimal(rrVal, 2)}R` : "—"}
                                </td>
                            {/if}
                            {#if visibility.mae && !groupBySymbol}
                                <td class="font-mono text-xs text-right text-[var(--danger-color)] whitespace-nowrap">
                                    {entryItem?.mae ? formatDynamicDecimal(entryItem.mae, 2) : "—"}
                                </td>
                            {/if}
                            {#if visibility.mfe && !groupBySymbol}
                                <td class="font-mono text-xs text-right text-[var(--success-color)] whitespace-nowrap">
                                    {entryItem?.mfe ? formatDynamicDecimal(entryItem.mfe, 2) : "—"}
                                </td>
                            {/if}
                            {#if visibility.efficiency && !groupBySymbol}
                                <td class="font-mono text-xs text-right whitespace-nowrap">
                                    {entryItem?.efficiency ? `${(entryItem.efficiency.times(100)).toFixed(0)}%` : "—"}
                                </td>
                            {/if}
                            {#if visibility.duration && !groupBySymbol}
                                <td class="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                                    {entryItem ? formatDuration(entryItem.entryDate, entryItem.exitDate, entryItem.date) : "—"}
                                </td>
                            {/if}
                            {#if visibility.status}
                                <td class="text-center whitespace-nowrap">
                                    {#if isGroup}
                                        <span class="text-xs font-bold text-[var(--text-secondary)]">
                                            {(item as JournalGroupSummary).totalTrades} {$_("journal.trades")}
                                        </span>
                                    {:else if entryItem}
                                        <span
                                            class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block"
                                            class:bg-success-paired={entryItem.status === 'Won'}
                                            class:bg-danger-paired={entryItem.status === 'Lost'}
                                            class:bg-[var(--bg-tertiary)]={entryItem.status !== 'Won' && entryItem.status !== 'Lost'}
                                            class:text-[var(--text-secondary)]={entryItem.status !== 'Won' && entryItem.status !== 'Lost'}
                                            class:border={entryItem.status !== 'Won' && entryItem.status !== 'Lost'}
                                            class:border-[var(--border-color)]={entryItem.status !== 'Won' && entryItem.status !== 'Lost'}
                                        >
                                            {entryItem.status === 'Won' ? $_("journal.filterWon") : entryItem.status === 'Lost' ? $_("journal.filterLost") : entryItem.status === 'Open' ? $_("journal.filterOpen") : entryItem.status}
                                        </span>
                                    {/if}
                                </td>
                            {/if}
                            {#if visibility.screenshot && !groupBySymbol}
                                <td class="text-center whitespace-nowrap">
                                    {#if entryItem?.screenshot}
                                        <button
                                            type="button"
                                            class="group relative inline-block rounded overflow-hidden border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-all shadow-xs cursor-pointer align-middle"
                                            onmouseenter={(e) => updateHoverPosition(e, entryItem.screenshot!, entryItem.symbol)}
                                            onmousemove={(e) => updateHoverPosition(e, entryItem.screenshot!, entryItem.symbol)}
                                            onmouseleave={handleThumbnailMouseLeave}
                                            onclick={(e) => openLightbox(entryItem.screenshot!, entryItem.symbol, e)}
                                            aria-label={$_("journal.viewScreenshot")}
                                        >
                                            <img
                                                src={entryItem.screenshot}
                                                alt={$_("journal.chartAlt", { values: { symbol: entryItem.symbol } })}
                                                class="w-12 h-7 object-cover transition-transform duration-200 group-hover:scale-110"
                                                loading="lazy"
                                            />
                                            <div class="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <span class="text-[10px] text-white">🔍</span>
                                            </div>
                                        </button>
                                    {:else}
                                        <span class="text-[var(--text-secondary)] text-xs">—</span>
                                    {/if}
                                </td>
                            {/if}
                            {#if visibility.tags && !groupBySymbol}
                                <td class="text-xs whitespace-nowrap">
                                    {#if entryItem?.tags && entryItem.tags.length > 0}
                                        <div class="flex items-center gap-1 flex-wrap max-w-[140px]">
                                            {#each entryItem.tags as tag}
                                                <span class="text-[9px] px-1 py-0.2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                                                    {tag}
                                                </span>
                                            {/each}
                                        </div>
                                    {:else}
                                        —
                                    {/if}
                                </td>
                            {/if}
                            {#if visibility.notes && !groupBySymbol}
                                <td class="text-xs text-[var(--text-secondary)] max-w-[120px] truncate" title={entryItem?.notes || ""}>
                                    {entryItem?.notes || "—"}
                                </td>
                            {/if}
                            {#if visibility.pnl}
                                <td
                                    class="sticky-col-right col-pnl font-mono text-xs font-bold text-right whitespace-nowrap"
                                    class:text-[var(--success-color)]={netPnl.gte(0)}
                                    class:text-[var(--danger-color)]={netPnl.lt(0)}
                                >
                                    {netPnl.gte(0) ? "+" : ""}{formatDynamicDecimal(netPnl, 2)} {currency}
                                </td>
                            {/if}
                            {#if visibility.action}
                                <td class="sticky-col-right col-action text-center whitespace-nowrap">
                                    <div class="flex items-center justify-center gap-1">
                                        {#if entryItem}
                                            <button
                                                class="action-icon-btn"
                                                onclick={() => onOpenTradeDetail?.(entryItem)}
                                                title={$_("journal.drawer.title")}
                                                aria-label={$_("journal.drawer.title")}
                                            >
                                                🔍
                                            </button>
                                            <button
                                                class="action-icon-btn text-[var(--danger-color)]"
                                                onclick={() => onDeleteTrade?.(entryItem.id)}
                                                title={$_("journal.delete")}
                                                aria-label={$_("journal.delete")}
                                            >
                                                🗑️
                                            </button>
                                        {/if}
                                    </div>
                                </td>
                            {/if}
                        </tr>

                        <!-- Sub-rows when group is expanded -->
                        {#if isGroup && expandedGroups.has(item.symbol) && (item as JournalGroupSummary).trades}
                            {#each sortedGroupTrades.get(item.symbol) || [] as subTrade (subTrade.id)}
                                {@const subPnl = subTrade.totalNetProfit || subTrade.realizedPnl || new Decimal(0)}
                                <tr
                                    class="nested-trade-row cursor-pointer transition-colors"
                                    onclick={(e) => handleRowClick(subTrade, e)}
                                >
                                    {#if visibility.date}
                                        <td class="sticky-col col-date pl-6 font-mono text-xs text-[var(--text-secondary)]">
                                            {new Date(subTrade.date).toLocaleDateString()}
                                        </td>
                                    {/if}
                                    {#if visibility.symbol}
                                        <td class="sticky-col col-symbol font-mono text-xs text-[var(--text-secondary)]">
                                            <div class="flex items-center gap-1">
                                                <span>↳ #{subTrade.id}</span>
                                                {#if subTrade.isPaper}
                                                    <span class="text-[9px] px-1 py-0.2 rounded font-bold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                                                        SIM
                                                    </span>
                                                {/if}
                                            </div>
                                        </td>
                                    {/if}
                                    {#if visibility.type && !groupBySymbol}
                                        <td>
                                            <span
                                                class="text-[10px] px-1 py-0.2 rounded font-bold uppercase"
                                                class:bg-success-paired={subTrade.tradeType === "long"}
                                                class:bg-danger-paired={subTrade.tradeType !== "long"}
                                            >
                                                {subTrade.tradeType}
                                            </span>
                                        </td>
                                    {/if}
                                    {#if visibility.entry && !groupBySymbol}
                                        <td class="font-mono text-xs text-right">{formatDynamicDecimal(subTrade.entryPrice, 4)}</td>
                                    {/if}
                                    {#if visibility.exit && !groupBySymbol}
                                        <td class="font-mono text-xs text-right">{subTrade.exitPrice ? formatDynamicDecimal(subTrade.exitPrice, 4) : "—"}</td>
                                    {/if}
                                    {#if visibility.sl && !groupBySymbol}
                                        <td class="font-mono text-xs text-right text-[var(--danger-color)]">{subTrade.stopLossPrice ? formatDynamicDecimal(subTrade.stopLossPrice, 4) : "—"}</td>
                                    {/if}
                                    {#if visibility.slAtr && !groupBySymbol}
                                        <td class="font-mono text-xs text-right text-[var(--text-secondary)] whitespace-nowrap">
                                            {(() => {
                                                if (!subTrade?.entryPrice || !subTrade?.stopLossPrice || !subTrade?.atrValue || subTrade.atrValue.isZero() || subTrade.stopLossPrice.isZero()) return "—";
                                                const dist = subTrade.entryPrice.minus(subTrade.stopLossPrice).abs();
                                                const mult = dist.div(subTrade.atrValue);
                                                return mult.toFixed(2) + "x";
                                            })()}
                                        </td>
                                    {/if}
                                    {#if visibility.atr && !groupBySymbol}
                                        <td class="font-mono text-xs text-right text-[var(--text-secondary)] whitespace-nowrap">
                                            {subTrade?.atrValue ? formatDynamicDecimal(subTrade.atrValue, 4) : "—"}
                                        </td>
                                    {/if}
                                    {#if visibility.size && !groupBySymbol}
                                        <td class="font-mono text-xs text-right">{subTrade.positionSize ? formatDynamicDecimal(subTrade.positionSize, 4) : "—"}</td>
                                    {/if}
                                    {#if visibility.entryFee && !groupBySymbol}
                                        <td class="font-mono text-xs text-right text-[var(--warning-color)]">
                                            {#if getEntryFee(subTrade)}
                                                <span class="flex items-center justify-end gap-1">
                                                    <span>-{formatDynamicDecimal(getEntryFee(subTrade)!, 2)}</span>
                                                    <span class="text-[9px] px-1 py-0.2 rounded font-bold bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                                                        {getEntryFeeType(subTrade)}
                                                    </span>
                                                </span>
                                            {:else}
                                                —
                                            {/if}
                                        </td>
                                    {/if}
                                    {#if visibility.exitFee && !groupBySymbol}
                                        <td class="font-mono text-xs text-right text-[var(--warning-color)]">
                                            {#if getExitFee(subTrade)}
                                                <span class="flex items-center justify-end gap-1">
                                                    <span>-{formatDynamicDecimal(getExitFee(subTrade)!, 2)}</span>
                                                    <span class="text-[9px] px-1 py-0.2 rounded font-bold bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                                                        {getExitFeeType(subTrade)}
                                                    </span>
                                                </span>
                                            {:else}
                                                —
                                            {/if}
                                        </td>
                                    {/if}
                                    {#if visibility.totalFees}
                                        <td class="font-mono text-xs text-right text-[var(--warning-color)]">
                                            -{formatDynamicDecimal(getTotalFees(subTrade), 2)}
                                        </td>
                                    {/if}
                                    {#if visibility.funding && !groupBySymbol}
                                        <td class="font-mono text-xs text-right">{subTrade.fundingFee ? formatDynamicDecimal(subTrade.fundingFee, 2) : "0.00"}</td>
                                    {/if}
                                    {#if visibility.rr && !groupBySymbol}
                                        {@const subRrVal = getTradeRR(subTrade)}
                                        <td
                                            class="font-mono text-xs text-right whitespace-nowrap font-bold"
                                            class:text-[var(--success-color)]={subRrVal?.gt(2)}
                                            class:text-[var(--warning-color)]={subRrVal && subRrVal.gt(1) && subRrVal.lte(2)}
                                            class:text-[var(--danger-color)]={subRrVal?.lt(0)}
                                        >
                                            {subRrVal ? `${formatDynamicDecimal(subRrVal, 2)}R` : "—"}
                                        </td>
                                    {/if}
                                    {#if visibility.mae && !groupBySymbol}
                                        <td class="font-mono text-xs text-right text-[var(--danger-color)] whitespace-nowrap">
                                            {subTrade?.mae ? formatDynamicDecimal(subTrade.mae, 2) : "—"}
                                        </td>
                                    {/if}
                                    {#if visibility.mfe && !groupBySymbol}
                                        <td class="font-mono text-xs text-right text-[var(--success-color)] whitespace-nowrap">
                                            {subTrade?.mfe ? formatDynamicDecimal(subTrade.mfe, 2) : "—"}
                                        </td>
                                    {/if}
                                    {#if visibility.efficiency && !groupBySymbol}
                                        <td class="font-mono text-xs text-right whitespace-nowrap">
                                            {subTrade?.efficiency ? `${(subTrade.efficiency.times(100)).toFixed(0)}%` : "—"}
                                        </td>
                                    {/if}
                                    {#if visibility.duration && !groupBySymbol}
                                        <td class="text-xs text-[var(--text-secondary)]">{formatDuration(subTrade.entryDate, subTrade.exitDate, subTrade.date)}</td>
                                    {/if}
                                    {#if visibility.status}
                                        <td class="text-center whitespace-nowrap">
                                            <span
                                                class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block"
                                                class:bg-success-paired={subTrade.status === 'Won'}
                                                class:bg-danger-paired={subTrade.status === 'Lost'}
                                                class:bg-[var(--bg-tertiary)]={subTrade.status !== 'Won' && subTrade.status !== 'Lost'}
                                                class:text-[var(--text-secondary)]={subTrade.status !== 'Won' && subTrade.status !== 'Lost'}
                                                class:border={subTrade.status !== 'Won' && subTrade.status !== 'Lost'}
                                                class:border-[var(--border-color)]={subTrade.status !== 'Won' && subTrade.status !== 'Lost'}
                                            >
                                                {subTrade.status === 'Won' ? $_("journal.filterWon") : subTrade.status === 'Lost' ? $_("journal.filterLost") : subTrade.status === 'Open' ? $_("journal.filterOpen") : subTrade.status}
                                            </span>
                                        </td>
                                    {/if}
                                    {#if visibility.screenshot && !groupBySymbol}
                                        <td class="text-center whitespace-nowrap">
                                            {#if subTrade?.screenshot}
                                                <button
                                                    type="button"
                                                    class="group relative inline-block rounded overflow-hidden border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-all shadow-xs cursor-pointer align-middle"
                                                    onmouseenter={(e) => updateHoverPosition(e, subTrade.screenshot!, subTrade.symbol)}
                                                    onmousemove={(e) => updateHoverPosition(e, subTrade.screenshot!, subTrade.symbol)}
                                                    onmouseleave={handleThumbnailMouseLeave}
                                                    onclick={(e) => openLightbox(subTrade.screenshot!, subTrade.symbol, e)}
                                                    aria-label={$_("journal.viewScreenshot")}
                                                >
                                                    <img
                                                        src={subTrade.screenshot}
                                                        alt={$_("journal.chartAlt", { values: { symbol: subTrade.symbol } })}
                                                        class="w-12 h-7 object-cover transition-transform duration-200 group-hover:scale-110"
                                                        loading="lazy"
                                                    />
                                                    <div class="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                        <span class="text-[10px] text-white">🔍</span>
                                                    </div>
                                                </button>
                                            {:else}
                                                <span class="text-[var(--text-secondary)] text-xs">—</span>
                                            {/if}
                                        </td>
                                    {/if}
                                    {#if visibility.tags && !groupBySymbol}
                                        <td class="text-xs whitespace-nowrap">
                                            {#if subTrade?.tags && subTrade.tags.length > 0}
                                                <div class="flex items-center gap-1 flex-wrap max-w-[140px]">
                                                    {#each subTrade.tags as tag}
                                                        <span class="text-[9px] px-1 py-0.2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                                                            {tag}
                                                        </span>
                                                    {/each}
                                                </div>
                                            {:else}
                                                —
                                            {/if}
                                        </td>
                                    {/if}
                                    {#if visibility.notes && !groupBySymbol}
                                        <td class="text-xs text-[var(--text-secondary)] max-w-[120px] truncate" title={subTrade?.notes || ""}>
                                            {subTrade?.notes || "—"}
                                        </td>
                                    {/if}
                                    {#if visibility.pnl}
                                        <td class="sticky-col-right col-pnl font-mono text-xs font-bold text-right" class:text-[var(--success-color)]={subPnl.gte(0)} class:text-[var(--danger-color)]={subPnl.lt(0)}>
                                            {subPnl.gte(0) ? "+" : ""}{formatDynamicDecimal(subPnl, 2)}
                                        </td>
                                    {/if}
                                    {#if visibility.action}
                                        <td class="sticky-col-right col-action text-center">
                                            <button class="action-icon-btn" onclick={() => onOpenTradeDetail?.(subTrade)}>🔍</button>
                                        </td>
                                    {/if}
                                </tr>
                            {/each}
                        {/if}
                    {/each}
                {/if}
            </tbody>
        </table>
    </div>

    <!-- Pagination Controls -->
    <div class="table-pagination flex flex-wrap items-center justify-between gap-3 p-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs">
        <div class="flex items-center gap-2">
            <span class="text-[var(--text-secondary)]">{$_("journal.table.itemsPerPage")}:</span>
            <select
                bind:value={itemsPerPage}
                onchange={handleItemsPerPageChange}
                class="py-1 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
            >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
            </select>
        </div>

        <div class="flex items-center gap-3">
            <span class="text-[var(--text-secondary)] font-mono">
                {$_("journal.pagination.page")} {safeCurrentPage} {$_("journal.pagination.of")} {Math.max(1, totalPages)}
            </span>
            <div class="flex items-center gap-1">
                <button
                    class="pagination-btn"
                    disabled={safeCurrentPage <= 1}
                    onclick={() => handlePageChange(safeCurrentPage - 1)}
                >
                    ‹ {$_("journal.pagination.prev")}
                </button>
                <button
                    class="pagination-btn"
                    disabled={safeCurrentPage >= totalPages}
                    onclick={() => handlePageChange(safeCurrentPage + 1)}
                >
                    {$_("journal.pagination.next")} ›
                </button>
            </div>
        </div>
    </div>
</div>

<!-- Hover-Zoom Floating Card (Clean, bündig & Cursor-nah) -->
{#if activeHoverScreenshot}
    <div
        class="fixed z-50 pointer-events-none rounded-xl overflow-hidden border border-[var(--border-color)] glass-panel shadow-2xl transition-transform duration-75"
        style="left: {activeHoverScreenshot.x}px; top: {activeHoverScreenshot.y}px; width: 440px;"
    >
        <img
            src={activeHoverScreenshot.url}
            alt={$_("journal.chartPreviewAlt", { values: { symbol: activeHoverScreenshot.symbol } })}
            class="w-full h-auto max-h-[300px] object-cover block bg-black"
        />
        <div class="px-3 py-1.5 bg-[var(--bg-secondary)] flex items-center justify-between text-xs border-t border-[var(--border-color)]">
            <span class="font-bold flex items-center gap-1.5 text-[var(--text-primary)]">
                <span>📊</span>
                <span>{activeHoverScreenshot.symbol}</span>
            </span>
            <span class="text-[var(--text-secondary)] text-[11px]">🔍 Klick für Vollbild</span>
        </div>
    </div>
{/if}

<!-- Lightbox Modal -->
{#if activeLightboxScreenshot}
    <div
        class="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={closeLightbox}
        onkeydown={(e) => e.key === "Escape" && closeLightbox()}
    >
        <div
            class="relative max-w-5xl max-h-[90vh] glass-panel rounded-xl overflow-hidden shadow-2xl border border-[var(--border-color)] flex flex-col"
            role="document"
            tabindex="-1"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
        >
            <div class="p-3 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex items-center justify-between">
                <h4 class="text-sm font-bold flex items-center gap-2">
                    <span>📷</span>
                    <span>{activeLightboxScreenshot.symbol} Chart Screenshot</span>
                </h4>
                <button
                    class="p-1 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    onclick={closeLightbox}
                    aria-label={$_("journal.closeLightbox")}
                >
                    ✕
                </button>
            </div>
            <div class="p-2 overflow-auto flex items-center justify-center bg-black/20">
                <img
                    src={activeLightboxScreenshot.url}
                    alt={$_("journal.chartFullAlt", { values: { symbol: activeLightboxScreenshot.symbol } })}
                    class="max-w-full max-h-[80vh] object-contain rounded-lg"
                />
            </div>
        </div>
    </div>
{/if}

<style>
    .journal-table-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        background: var(--bg-primary);
        border-radius: var(--border-radius);
        overflow: hidden;
    }

    .table-responsive-wrapper {
        width: 100%;
        overflow-x: auto;
        position: relative;
    }

    .journal-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        text-align: left;
    }

    .journal-table th {
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-weight: var(--font-semibold);
        font-size: var(--text-xs);
        padding: 0.65rem 0.85rem;
        border-bottom: 1px solid var(--border-color);
        white-space: nowrap;
        user-select: none;
    }

    .journal-table th.sortable {
        cursor: pointer;
    }

    .journal-table th.sortable:hover {
        color: var(--text-primary);
        background: var(--bg-tertiary);
    }

    .journal-table td {
        padding: 0.65rem 0.85rem;
        border-bottom: 1px solid var(--border-color);
        color: var(--text-primary);
        background: var(--bg-primary);
    }

    .table-row:hover td {
        background: var(--bg-secondary);
    }

    .group-header-row td {
        background: var(--bg-secondary);
    }

    .nested-trade-row td {
        background: var(--bg-tertiary);
        opacity: 0.95;
    }

    /* Sticky Columns Left */
    .sticky-col.col-date {
        position: sticky;
        left: 0;
        z-index: 10;
    }

    .sticky-col.col-symbol {
        position: sticky;
        left: 85px;
        z-index: 10;
        box-shadow: 3px 0 6px -2px rgba(0, 0, 0, 0.2);
    }

    /* Sticky Columns Right */
    .sticky-col-right.col-pnl {
        position: sticky;
        right: 75px;
        z-index: 10;
        box-shadow: -3px 0 6px -2px rgba(0, 0, 0, 0.2);
    }

    .sticky-col-right.col-action {
        position: sticky;
        right: 0;
        z-index: 10;
    }

    .journal-table thead th.sticky-col,
    .journal-table thead th.sticky-col-right {
        z-index: 20;
    }

    .group-toggle-btn {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: var(--text-xs);
        padding: 0 var(--space-1);
    }

    .group-toggle-btn:hover {
        color: var(--text-primary);
    }

    .action-icon-btn {
        padding: 0.25rem 0.4rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        cursor: pointer;
        font-size: var(--text-xs);
        transition: all 0.15s ease;
    }

    .action-icon-btn:hover {
        background: var(--bg-tertiary);
    }

    .pagination-btn {
        padding: 0.35rem 0.65rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-primary);
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .pagination-btn:hover:not(:disabled) {
        background: var(--bg-tertiary);
        border-color: var(--accent-color);
    }

    .pagination-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
</style>
