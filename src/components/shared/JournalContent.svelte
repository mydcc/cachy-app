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
    import { tradeState } from "../../stores/trade.svelte";
    import { settingsState } from "../../stores/settings.svelte";
    import { journalState } from "../../stores/journal.svelte";
    import { uiState } from "../../stores/ui.svelte";
    import { app } from "../../services/app";
    import { imgbbService } from "../../services/imgbbService";
    import { calculator } from "../../lib/calculator";
    import { _ } from "../../locales/i18n";
    import { icons } from "../../lib/constants";
    import { browser } from "$app/environment";
    import { getComputedColor } from "../../utils/colors";
    import type { WindowBase } from "../../lib/windows/WindowBase.svelte";
    import type { Snippet } from "svelte";
    import type { JournalEntry, JournalTableRow, JournalGroupSummary } from "../../stores/types";

    import DashboardNav from "./DashboardNav.svelte";
    import { Decimal } from "decimal.js";
    import { onMount, untrack } from "svelte";

    // Journal Sub-Components
    import JournalFilters from "./journal/JournalFilters.svelte";
    import JournalStatistics from "./journal/JournalStatistics.svelte";
    import JournalTable from "./journal/JournalTable.svelte";
    import JournalCharts from "./journal/JournalCharts.svelte";
    import JournalDeepDive from "./journal/JournalDeepDive.svelte";
    import TradeDetailDrawer from "./journal/TradeDetailDrawer.svelte";

    interface Props {
        window?: WindowBase;
    }

    let { window: win }: Props = $props();

    // Top-Level Main Tab State
    type JournalMainTab = "overview" | "table" | "deepDive";
    let activeMainTab: JournalMainTab = $state("table");

    // State for Chart Preset within Overview
    let activePreset = $state("performance");

    // Drawer state
    let activeTradeIdForDetail: number | string | null = $state(null);
    let activeTradeForDetail = $derived(
        activeTradeIdForDetail
            ? journalState.entries.find((t) => t.id === activeTradeIdForDetail) || null
            : null
    );
    let isDrawerOpen = $state(false);

    // --- Cheat Code Logic ---
    const CODE_UNLOCK = "VIPENTE2026";
    const CODE_LOCK = "VIPDEEPDIVE";
    const CODE_SPACE = "VIPSPACE2026";
    const CODE_BONUS = "BONUS";
    const CODE_STREAK = "STREAK";

    const MAX_CODE_LENGTH = Math.max(
        CODE_UNLOCK.length,
        CODE_LOCK.length,
        CODE_SPACE.length,
        CODE_BONUS.length,
        CODE_STREAK.length,
    );

    let inputBuffer: string[] = [];

    function handleKeydown(event: KeyboardEvent) {
        const target = event.target as HTMLElement;
        if (
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable
        )
            return;

        const key = event.key.toUpperCase();
        if (key.length === 1) {
            inputBuffer.push(key);
            if (inputBuffer.length > MAX_CODE_LENGTH) {
                inputBuffer.shift();
            }

            const bufferStr = inputBuffer.join("");

            if (bufferStr.endsWith(CODE_UNLOCK)) {
                if (settingsState.entitlement.isPro && uiState.currentTheme === "VIP") {
                    unlockDeepDive();
                }
            } else if (bufferStr.endsWith(CODE_LOCK)) {
                lockDeepDive();
            } else if (bufferStr.endsWith(CODE_SPACE)) {
                if (settingsState.entitlement.isPro && uiState.currentTheme === "VIP") {
                    activateVipSpace();
                }
            }
        }
    }

    function unlockDeepDive() {
        if (settingsState.isDeepDiveUnlocked) return;
        settingsState.isDeepDiveUnlocked = true;
        uiState.showToast($_("journal.messages.unlocked"), "success");
        inputBuffer = [];
    }

    function lockDeepDive() {
        if (!settingsState.isDeepDiveUnlocked) return;
        settingsState.isDeepDiveUnlocked = false;
        uiState.showToast($_("journal.messages.deactivated"), "info");
        inputBuffer = [];
    }

    function activateVipSpace() {
        uiState.showToast($_("journal.messages.vipSpaceUnlocked"), "success");
        inputBuffer = [];
        setTimeout(() => {
            if (browser) {
                window.open("https://metaverse.bitunix.cyou", "_blank");
            }
        }, 2000);
    }

    onMount(() => {
        window.addEventListener("keydown", handleKeydown);
        return () => {
            window.removeEventListener("keydown", handleKeydown);
        };
    });

    // --- Theme Color Management ---
    let themeColors = $state({
        success: "var(--success-color)",
        danger: "var(--danger-color)",
        warning: "var(--warning-color)",
        accent: "var(--accent-color)",
        textSecondary: "var(--text-secondary)",
    });

    function updateThemeColors() {
        if (!browser) return;
        setTimeout(() => {
            themeColors = {
                success: getComputedColor("--success-color") || "#10b981",
                danger: getComputedColor("--danger-color") || "#ef4444",
                warning: getComputedColor("--warning-color") || "#f59e0b",
                accent: getComputedColor("--accent-color") || "#3b82f6",
                textSecondary: getComputedColor("--text-secondary") || "#64748b",
            };
        }, 0);
    }

    $effect(() => {
        void uiState.currentTheme;
        untrack(() => updateThemeColors());
    });

    // --- Table State ---
    type SortField = keyof JournalEntry | "duration" | "totalFees" | "entryFee" | "exitFee";
    let currentPage = $state(1);
    let itemsPerPage = $state(10);
    let sortField: SortField = $state("date");
    let sortDirection: "asc" | "desc" = $state("desc");
    let filterDateStart = $state("");
    let filterDateEnd = $state("");
    let selectedTag = $state("");
    let groupBySymbol = $state(false);
    let showColumnSettings = $state(false);
    let tradeMode: "live" | "paper" | "all" = $state("live");

    let liveTradesCount = $derived(
        journalState.entries.filter((t) => !t.isPaper).length,
    );
    let paperTradesCount = $derived(
        journalState.entries.filter((t) => t.isPaper).length,
    );

    // Column Visibility State - all columns visible by default
    let columnVisibility: Record<string, boolean> = $state({
        date: true,
        symbol: true,
        type: true,
        entry: true,
        exit: true,
        sl: true,
        slAtr: true,
        atr: true,
        size: true,
        entryFee: true,
        exitFee: true,
        totalFees: true,
        funding: true,
        pnl: true,
        rr: true,
        mae: true,
        mfe: true,
        efficiency: true,
        duration: true,
        status: true,
        screenshot: true,
        tags: true,
        notes: true,
        action: true,
    });

    function applyColumnPreset(preset: "compact" | "standard" | "fees" | "all") {
        if (preset === "compact") {
            columnVisibility = {
                date: true,
                symbol: true,
                type: true,
                entry: true,
                exit: true,
                sl: false,
                slAtr: false,
                atr: false,
                size: false,
                entryFee: false,
                exitFee: false,
                totalFees: false,
                funding: false,
                pnl: true,
                rr: false,
                mae: false,
                mfe: false,
                efficiency: false,
                duration: false,
                status: true,
                screenshot: false,
                tags: false,
                notes: false,
                action: true,
            };
        } else if (preset === "standard") {
            columnVisibility = {
                date: true,
                symbol: true,
                type: true,
                entry: true,
                exit: true,
                sl: true,
                slAtr: false,
                atr: false,
                size: true,
                entryFee: false,
                exitFee: false,
                totalFees: true,
                funding: false,
                pnl: true,
                rr: true,
                mae: false,
                mfe: false,
                efficiency: false,
                duration: false,
                status: true,
                screenshot: false,
                tags: false,
                notes: false,
                action: true,
            };
        } else if (preset === "fees") {
            columnVisibility = {
                date: true,
                symbol: true,
                type: true,
                entry: true,
                exit: true,
                sl: false,
                slAtr: false,
                atr: false,
                size: true,
                entryFee: true,
                exitFee: true,
                totalFees: true,
                funding: true,
                pnl: true,
                rr: false,
                mae: false,
                mfe: false,
                efficiency: false,
                duration: false,
                status: true,
                screenshot: false,
                tags: false,
                notes: false,
                action: true,
            };
        } else if (preset === "all") {
            columnVisibility = {
                date: true,
                symbol: true,
                type: true,
                entry: true,
                exit: true,
                sl: true,
                slAtr: true,
                atr: true,
                size: true,
                entryFee: true,
                exitFee: true,
                totalFees: true,
                funding: true,
                pnl: true,
                rr: true,
                mae: true,
                mfe: true,
                efficiency: true,
                duration: true,
                status: true,
                screenshot: true,
                tags: true,
                notes: true,
                action: true,
            };
        }
    }

    function sortTrades(
        trades: JournalTableRow[],
        field: string,
        direction: "asc" | "desc",
    ): JournalTableRow[] {
        return [...trades].sort((rawA, rawB) => {
            const a = rawA as unknown as Record<string, string | number | Decimal | undefined | null>;
            const b = rawB as unknown as Record<string, string | number | Decimal | undefined | null>;
            let valA: string | number | Decimal | undefined | null = a[field];
            let valB: string | number | Decimal | undefined | null = b[field];

            if (field === "duration") {
                const startA = new Date((a.entryDate || a.date) as string | number).getTime();
                const endA = new Date((a.exitDate || a.date) as string | number).getTime();
                valA = isNaN(startA) || isNaN(endA) ? 0 : Math.max(0, endA - startA);

                const startB = new Date((b.entryDate || b.date) as string | number).getTime();
                const endB = new Date((b.exitDate || b.date) as string | number).getTime();
                valB = isNaN(startB) || isNaN(endB) ? 0 : Math.max(0, endB - startB);
            }

            if (valA instanceof Decimal) valA = valA.toNumber();
            if (valB instanceof Decimal) valB = valB.toNumber();

            if (valA === undefined || valA === null) valA = field === "symbol" || field === "status" ? "" : -Infinity;
            if (valB === undefined || valB === null) valB = field === "symbol" || field === "status" ? "" : -Infinity;

            if ((field === "date" || field === "exitDate") && typeof valA === "string") {
                valA = new Date(valA).getTime();
                valB = new Date(valB as string).getTime();
            }

            if (typeof valA === "string" && typeof valB === "string") {
                return direction === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }

            if (valA < valB) return direction === "asc" ? -1 : 1;
            if (valA > valB) return direction === "asc" ? 1 : -1;
            return 0;
        });
    }

    let journalSearchQuery = $derived(tradeState.journalSearchQuery);
    let journalFilterStatus = $derived(tradeState.journalFilterStatus);

    let allAvailableTags = $derived.by(() => {
        const set = new Set<string>();
        for (const entry of journalState.entries) {
            if (entry.tags) {
                for (const t of entry.tags) {
                    if (t.trim()) set.add(t.trim());
                }
            }
        }
        return Array.from(set).sort();
    });

    let processedTrades = $derived(
        journalState.entries.filter((trade) => {
            if (tradeMode === "live" && trade.isPaper) return false;
            if (tradeMode === "paper" && !trade.isPaper) return false;

            const query = journalSearchQuery.toLowerCase();
            const matchesSearch =
                !query ||
                trade.symbol.toLowerCase().includes(query) ||
                (trade.notes && trade.notes.toLowerCase().includes(query)) ||
                (trade.tags && trade.tags.some((t) => t.toLowerCase().includes(query)));

            const matchesStatus =
                journalFilterStatus === "all" || trade.status === journalFilterStatus;

            const matchesTag =
                !selectedTag || (trade.tags && trade.tags.includes(selectedTag));

            let matchesDate = true;
            const tradeDate = new Date(trade.date);
            if (filterDateStart) matchesDate = matchesDate && tradeDate >= new Date(filterDateStart);
            if (filterDateEnd) {
                const endDate = new Date(filterDateEnd);
                endDate.setHours(23, 59, 59, 999);
                matchesDate = matchesDate && tradeDate <= endDate;
            }

            return matchesSearch && matchesStatus && matchesTag && matchesDate;
        }),
    );

    let groupedTrades: JournalGroupSummary[] = $derived(
        groupBySymbol
            ? Object.entries(
                  calculator.calculateSymbolPerformance(processedTrades),
              ).map(([symbol, data]) => ({
                  id: `group-${symbol}`,
                  symbol,
                  isGroup: true as const,
                  totalTrades: data.totalTrades,
                  wonTrades: data.wonTrades,
                  totalProfitLoss: data.totalProfitLoss,
                  date: new Date().toISOString(),
                  tradeType: "group" as const,
                  entryPrice: new Decimal(0),
                  totalNetProfit: data.totalProfitLoss,
                  totalRR: new Decimal(0),
                  totalFees: new Decimal(0),
                  status: "Group" as const,
                  trades: processedTrades.filter((t) => t.symbol === symbol),
              }))
            : [],
    );

    let displayTrades: JournalTableRow[] = $derived(
        groupBySymbol ? groupedTrades : processedTrades,
    );
    let sortedTrades = $derived(
        sortTrades(displayTrades, sortField, sortDirection),
    );

    function handleSort(field: SortField) {
        if (sortField === field) {
            sortDirection = sortDirection === "asc" ? "desc" : "asc";
        } else {
            sortField = field;
            sortDirection = "desc";
        }
    }

    function handleImportCsv(event: Event) {
        if (browser) {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) {
                app.importFromCSV(file);
            }
        }
    }

    function confirmDeleteTrade(tradeId: number | string) {
        if (confirm($_("journal.confirmDelete"))) {
            app.deleteTrade(tradeId);
            if (activeTradeIdForDetail === tradeId) {
                isDrawerOpen = false;
                activeTradeIdForDetail = null;
            }
        }
    }

    $effect(() => {
        void [
            journalSearchQuery,
            journalFilterStatus,
            selectedTag,
            tradeMode,
            filterDateStart,
            filterDateEnd,
            groupBySymbol,
            sortField,
            sortDirection,
            itemsPerPage,
        ];
        currentPage = 1;
    });

    function handleDateFilterChange(data: { date: string }) {
        const dateStr = data.date;
        filterDateStart = dateStr;
        filterDateEnd = dateStr;
        activeMainTab = "table";
    }

    let filteredPerformance = $derived(
        calculator.calculatePerformanceStats(processedTrades) || {
            totalTrades: 0,
            winRate: 0,
            profitFactor: new Decimal(0),
            maxDrawdown: new Decimal(0),
            avgRMultiple: new Decimal(0),
        },
    );
    let filteredJournal = $derived(
        calculator.calculateJournalStats(processedTrades),
    );

    let performanceData = $derived({
        ...filteredPerformance,
        totalPnl: filteredJournal.totalNetProfit?.toNumber() || 0,
        profitFactor: filteredPerformance.profitFactor?.toNumber() || 0,
        maxDrawdown: filteredPerformance.maxDrawdown?.toNumber() || 0,
    });
    let qualityData = $derived({
        avgR: filteredPerformance.avgRMultiple?.toNumber() || 0,
    });

    async function handleScreenshotUpload(id: number | string, file: File) {
        try {
            uiState.isLoading = true;
            uiState.loadingMessage = $_("journal.messages.uploading");

            const url = await imgbbService.uploadToImgbb(file);
            const trade = journalState.entries.find((t) => t.id === id);
            if (trade) {
                app.updateTrade(id, { screenshot: url });
                uiState.showFeedback("save");
            }
        } catch (e) {
            uiState.errorMessage =
                (e instanceof Error ? e.message : undefined) || $_("journal.messages.uploadFailed");
            uiState.showErrorMessage = true;
        } finally {
            uiState.isLoading = false;
        }
    }

    function setHeaderSnippet(node: HTMLElement, snippet: Snippet) {
        if (win) win.headerSnippet = snippet;
    }

    function openTradeDetail(trade: JournalEntry) {
        activeTradeIdForDetail = trade.id;
        isDrawerOpen = true;
    }
</script>

{#snippet headerStats()}
    <JournalStatistics
        {performanceData}
        {qualityData}
        isPro={true}
        minimal={true}
    />
{/snippet}

<div
    class="journal-content-wrapper p-4 sm:p-6"
    use:setHeaderSnippet={headerStats}
>
    <!-- Top-Level Tab Switcher -->
    <div class="main-tab-nav flex items-center justify-between gap-4 mb-6 border-b border-[var(--border-color)] pb-3">
        <div class="flex items-center gap-2">
            <button
                class="tab-btn"
                class:active={activeMainTab === "table"}
                onclick={() => (activeMainTab = "table")}
            >
                <span class="tab-icon">📋</span>
                <span>{$_("journal.presets.table")}</span>
                <span class="tab-badge">{processedTrades.length}</span>
            </button>
            <button
                class="tab-btn"
                class:active={activeMainTab === "overview"}
                onclick={() => (activeMainTab = "overview")}
            >
                <span class="tab-icon">📊</span>
                <span>{$_("journal.presets.overview")}</span>
            </button>
            <button
                class="tab-btn"
                class:active={activeMainTab === "deepDive"}
                onclick={() => (activeMainTab = "deepDive")}
            >
                <span class="tab-icon">🔬</span>
                <span>{$_("journal.presets.deepDive")}</span>
            </button>
        </div>

        <!-- Sync Button & Quick Status in Tab Header -->
        <div class="flex items-center gap-2">
            {#if settingsState.entitlement.isPro}
                {#if uiState.syncProgress}
                    <div
                        class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                        title={$_("dashboard.synchronizingHistory") || "Synchronizing History..."}
                    >
                        <span class="font-mono text-[10px] text-[var(--text-primary)] font-bold">
                            {uiState.syncProgress.current}/{uiState.syncProgress.total}
                        </span>
                        <div class="w-16 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                            <div
                                class="h-full bg-[var(--accent-color)] transition-all duration-500 ease-out"
                                style="width: {(uiState.syncProgress.current / Math.max(uiState.syncProgress.total, 1)) * 100}%"
                            ></div>
                        </div>
                    </div>
                {:else}
                    <button
                        class="text-[11px] font-bold py-1.5 px-3 rounded-md flex items-center gap-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] transition-colors disabled:opacity-50"
                        onclick={app.syncBitunixHistory}
                        disabled={uiState.isPriceFetching || uiState.isLoading}
                    >
                        {#if uiState.isPriceFetching}
                            <div class="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full"></div>
                        {:else}
                            <span class="opacity-70">{@html icons.refresh}</span>
                        {/if}
                        <span>
                            {uiState.isPriceFetching ? $_("journal.messages.syncing") : $_("journal.syncBitunix")}
                        </span>
                    </button>
                {/if}
            {/if}
        </div>
    </div>

    <!-- TAB 1: OVERVIEW & CHARTS -->
    {#if activeMainTab === "overview"}
        <div class="overview-view space-y-6">
            <JournalStatistics
                {performanceData}
                {qualityData}
                isPro={true}
                minimal={false}
            />
            <DashboardNav {activePreset} onselect={(id) => (activePreset = id)} />
            <JournalCharts {activePreset} {themeColors} />
        </div>
    {/if}

    <!-- TAB 2: JOURNAL TABLE (PRIMARY WORKFLOW) -->
    {#if activeMainTab === "table"}
        <div class="table-view space-y-4">
            <JournalFilters
                bind:searchQuery={tradeState.journalSearchQuery}
                bind:filterStatus={tradeState.journalFilterStatus}
                bind:filterDateStart
                bind:filterDateEnd
                bind:selectedTag
                availableTags={allAvailableTags}
                bind:groupBySymbol
                bind:tradeMode
                liveCount={liveTradesCount}
                paperCount={paperTradesCount}
                totalTrades={journalState.entries.length}
                filteredCount={processedTrades.length}
                ontoggleSettings={() => (showColumnSettings = !showColumnSettings)}
            />

            <!-- Column Settings Dialog Popover -->
            {#if showColumnSettings}
                <div
                    class="fixed inset-0 bg-black/40 z-40"
                    role="presentation"
                    onclick={() => (showColumnSettings = false)}
                ></div>
                <div class="relative">
                    <div
                        class="absolute top-0 right-0 z-50 glass-panel border border-[var(--border-color)] rounded-xl shadow-2xl p-5 min-w-[340px] max-w-md animate-fade-in"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="col-settings-heading"
                    >
                        <div class="flex justify-between items-center mb-3">
                            <h4 id="col-settings-heading" class="text-sm font-bold">
                                {$_("journal.labels.tableSettings")}
                            </h4>
                            <button
                                class="text-xs px-3 py-1 rounded bg-[var(--accent-color)] text-[var(--bg-primary)] font-bold hover:opacity-90"
                                onclick={() => (showColumnSettings = false)}
                            >
                                {$_("common.ok")}
                            </button>
                        </div>

                        <!-- Column Presets -->
                        <div class="flex flex-wrap gap-1.5 mb-4 pb-3 border-b border-[var(--border-color)]">
                            <button
                                class="text-[11px] px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]"
                                onclick={() => applyColumnPreset("compact")}
                            >
                                {$_("journal.presets.compact")}
                            </button>
                            <button
                                class="text-[11px] px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]"
                                onclick={() => applyColumnPreset("standard")}
                            >
                                {$_("journal.presets.standard")}
                            </button>
                            <button
                                class="text-[11px] px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]"
                                onclick={() => applyColumnPreset("fees")}
                            >
                                {$_("journal.presets.feesExecution")}
                            </button>
                            <button
                                class="text-[11px] px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]"
                                onclick={() => applyColumnPreset("all")}
                            >
                                {$_("journal.presets.allColumns")}
                            </button>
                        </div>

                        <!-- Checkboxes -->
                        <div class="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                            {#each Object.keys(columnVisibility) as col}
                                <label class="flex items-center gap-2 cursor-pointer text-xs p-1 rounded hover:bg-[var(--bg-secondary)]">
                                    <input
                                        type="checkbox"
                                        bind:checked={columnVisibility[col]}
                                    />
                                    <span class="truncate">{col}</span>
                                </label>
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}

            <div class="glass-panel border border-[var(--border-color)] rounded-xl bg-[var(--bg-primary)] overflow-hidden shadow-sm">
                <JournalTable
                    trades={sortedTrades || []}
                    bind:sortField
                    bind:sortDirection
                    bind:currentPage
                    bind:itemsPerPage
                    {columnVisibility}
                    {groupBySymbol}
                    onSort={(field) => handleSort(field as SortField)}
                    onDeleteTrade={(id) => confirmDeleteTrade(id)}
                    onPageChange={(page) => (currentPage = page)}
                    onOpenTradeDetail={openTradeDetail}
                />
            </div>

            <!-- Bottom Action Toolbar (Export / Import / Clear) -->
            <div class="flex flex-wrap items-center justify-between gap-4 mt-6 pt-4 border-t border-[var(--border-color)]">
                <div class="flex flex-wrap items-center gap-2">
                    <button
                        class="btn-success text-xs py-2 px-3 rounded-lg flex items-center gap-1.5"
                        onclick={app.exportToCSV}
                    >
                        {@html icons.export}
                        <span>{$_("journal.export")}</span>
                    </button>
                    <button
                        class="btn-accent text-xs py-2 px-3 rounded-lg flex items-center gap-1.5"
                        onclick={() => document.getElementById("import-csv-input")?.click()}
                    >
                        {@html icons.import}
                        <span>{$_("journal.import")}</span>
                    </button>
                    <input
                        type="file"
                        id="import-csv-input"
                        class="hidden"
                        onchange={handleImportCsv}
                    />
                </div>

                <div>
                    <button
                        class="btn-danger text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 opacity-80 hover:opacity-100"
                        onclick={app.clearJournal}
                    >
                        {@html icons.delete}
                        <span>{$_("journal.clearAll")}</span>
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- TAB 3: DEEP-DIVE ANALYTICS -->
    {#if activeMainTab === "deepDive"}
        <div class="deepdive-view">
            <JournalDeepDive
                {themeColors}
                onfilterDateChange={(data) => handleDateFilterChange(data)}
            />
        </div>
    {/if}

    <!-- Trade Detail Drawer -->
    <TradeDetailDrawer
        trade={activeTradeForDetail}
        isOpen={isDrawerOpen}
        availableTags={allAvailableTags}
        onClose={() => {
            isDrawerOpen = false;
            activeTradeIdForDetail = null;
        }}
        onUpdateTrade={(id: number | string, data: Partial<JournalEntry>) => app.updateTrade(id, data)}
        onUploadScreenshot={(id: number | string, file: File) => handleScreenshotUpload(id, file)}
    />
</div>

<style>
    .journal-content-wrapper {
        color: var(--text-primary);
    }

    .tab-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.85rem;
        border-radius: var(--radius-lg);
        border: 1px solid transparent;
        background: transparent;
        color: var(--text-secondary);
        font-size: 0.85rem;
        font-weight: var(--font-semibold);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .tab-btn:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
    }

    .tab-btn.active {
        background: var(--bg-secondary);
        color: var(--text-primary);
        border-color: var(--border-color);
        box-shadow: var(--shadow-sm);
    }

    .tab-icon {
        font-size: var(--text-base);
    }

    .tab-badge {
        font-size: 0.7rem;
        padding: 0.1rem 0.4rem;
        border-radius: var(--radius-full);
        background: var(--bg-tertiary);
        color: var(--text-primary);
        font-family: monospace;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-4px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .animate-fade-in {
        animation: fadeIn 0.15s ease-out;
    }
</style>
