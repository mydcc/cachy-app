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
    import ModalFrame from "./ModalFrame.svelte";
    import { untrack } from "svelte";
    import { uiState } from "../../stores/ui.svelte";
    import {
        analysisState,
        type SymbolAnalysis,
    } from "../../stores/analysis.svelte";
    import { settingsState } from "../../stores/settings.svelte";
    import { marketState } from "../../stores/market.svelte";
    import { marketWatcher } from "../../services/marketWatcher"; // Use existing service
    import { tradeState } from "../../stores/trade.svelte";
    import { app } from "../../services/app";
    import { toastService } from "../../services/toastService.svelte";
    import { isMobileDevice } from "../../services/capabilityDetection";
    import { _ } from "../../locales/i18n";
    import { Decimal } from "decimal.js";
    import Tooltip from "./Tooltip.svelte";
    import {
        buildRows,
        marketHeat,
        marketBreadth,
        topOpportunity,
        signalFor,
        trendCellClass,
        type DashboardRow,
    } from "../../lib/marketDashboard";

    // Icons
    const ICONS = {
        bullish: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-[var(--success-color)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>`,
        bearish: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-[var(--danger-color)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>`,
        neutral: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14" /></svg>`,
        loading: `<svg class="animate-spin h-5 w-5 text-[var(--accent-color)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`,
    };

    type Row = DashboardRow;

    // All row/aggregate rules live in lib/marketDashboard.ts so they can be
    // tested directly -- they decide whether a user sees a trading signal or
    // the absence of one, which is not a distinction to leave untested.
    let rows: Row[] = $derived(
        buildRows(
            settingsState.favoriteSymbols,
            analysisState.results,
            settingsState.analyzeAllFavorites,
        ),
    );

    let analysedRows = $derived(rows.filter((r) => r.analysed));
    let avgRsi = $derived(marketHeat(rows));
    let breadth = $derived(marketBreadth(rows));
    let topPick = $derived(topOpportunity(rows));

    /** One-word reading of marketHeat -- a bare "62" forces every user to
     *  re-derive overbought/oversold from memory. */
    let heatZone = $derived.by(() => {
        if (avgRsi === null) return null;
        if (avgRsi >= 70) return $_("app.marketDashboard.zoneOverbought");
        if (avgRsi <= 30) return $_("app.marketDashboard.zoneOversold");
        return $_("app.marketDashboard.zoneNeutral");
    });

    /** Mobile: which row's score reasoning is expanded (touch has no hover,
     *  so the badge becomes a tap-to-expand toggle). */
    let expandedSymbol = $state<string | null>(null);

    // Initial desktop window size: wide enough that the trend-matrix table
    // (md+ layout) opens as a table instead of its narrow card fallback,
    // without eating the whole viewport. Read once per mount -- this
    // component mounts only while its window is open.
    const modalWidth =
        typeof window !== "undefined"
            ? Math.min(1160, Math.round(window.innerWidth * 0.94))
            : 1160;
    const modalHeight =
        typeof window !== "undefined"
            ? Math.min(820, Math.round(window.innerHeight * 0.9))
            : 820;

    const TONE_COLOR: Record<string, string> = {
        bullish: "var(--success-color)",
        bearish: "var(--danger-color)",
        flat: "var(--text-secondary)",
    };

    /** Localised label + colour for a row's confluence level. */
    function signalOf(analysis: SymbolAnalysis | undefined) {
        const { key, tone } = signalFor(analysis);
        return { label: $_(key), color: TONE_COLOR[tone] };
    }

    /** Row-specific reasoning straight from ConfluenceAnalyzer. The generic
     *  scale explainer lives ONCE in the column header -- repeating it on
     *  every row was noise, not information. */
    function scoreTooltip(analysis: SymbolAnalysis | undefined): string {
        const reasons = analysis?.confluenceReasons;
        if (!reasons || reasons.length === 0) {
            return $_("app.marketDashboard.scoreExplainer");
        }
        return `${$_("app.marketDashboard.scoreReasons")}\n${reasons.join("\n")}`;
    }

    function fundingOf(symbol: string): string | null {
        const rate = marketState.data[symbol]?.fundingRate;
        if (rate === null || rate === undefined) return null;
        return `${new Decimal(rate).times(100).toFixed(4)}%`;
    }

    function volumeOf(symbol: string): string | null {
        const vol = marketState.data[symbol]?.quoteVolume;
        if (vol === null || vol === undefined) return null;
        const d = new Decimal(vol);
        if (d.gte(1_000_000_000)) return `$${d.div(1_000_000_000).toFixed(2)}B`;
        if (d.gte(1_000_000)) return `$${d.div(1_000_000).toFixed(1)}M`;
        if (d.gte(1_000)) return `$${d.div(1_000).toFixed(1)}K`;
        return `$${d.toFixed(0)}`;
    }

    // Row click = load this symbol into the calculator, exactly like the
    // favourite tiles do (MarketOverview.loadToCalculator). Desktop keeps
    // this window open -- it is a monitoring surface and rows stay
    // comparable across picks. Mobile closes after an analysed pick,
    // because the maximized list would hide the calculator reacting.
    let activeSymbol = $derived(tradeState.symbol?.toUpperCase() ?? "");

    function selectRow(row: Row): void {
        if (!row.symbol) return;
        const upper = row.symbol.toUpperCase();
        const price = marketState.data[row.symbol]?.lastPrice;
        tradeState.update((s) => {
            const next = {
                ...s,
                symbol: upper,
                useAtrSl: true,
                atrMode: "auto" as "auto" | "manual",
            };
            if (price) {
                next.entryPrice = new Decimal(price).toString();
            }
            return next;
        });
        app.fetchAllAnalysisData(upper);
        toastService.success(
            $_("app.marketDashboard.symbolLoaded", {
                values: { symbol: upper },
            }),
        );
        if (isMobileDevice() && row.analysed) {
            uiState.toggleMarketDashboardModal(false);
        }
    }

    function onRowKeydown(e: KeyboardEvent, row: Row): void {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectRow(row);
        }
    }

    // Effect: Subscribe to live data for displayed symbols when modal is open
    // Optimized with diffing to prevent unnecessary unsubs/subs when sort order changes
    let previousSymbols = new Set<string>();

    $effect(() => {
        const isModalOpen = uiState.showMarketDashboardModal;

        if (isModalOpen) {
            // Keep the row list tracked so the effect re-runs when it changes
            const currentSymbols = new Set(rows.map((row) => row.symbol));

            untrack(() => {

                // 1. Unsubscribe symbols that are no longer present
                for (const sym of previousSymbols) {
                    if (!currentSymbols.has(sym)) {
                        marketWatcher.unregister(sym, "ticker");
                        marketWatcher.unregister(sym, "price");
                    }
                }

                // 2. Subscribe to new symbols
                for (const sym of currentSymbols) {
                    if (!previousSymbols.has(sym)) {
                        marketWatcher.register(sym, "ticker");
                        marketWatcher.register(sym, "price");
                    }
                }

                previousSymbols = currentSymbols;
            });
        } else {
            untrack(() => {
                // Cleanup all when modal is closed
                if (previousSymbols.size > 0) {
                    for (const sym of previousSymbols) {
                        marketWatcher.unregister(sym, "ticker");
                        marketWatcher.unregister(sym, "price");
                    }
                    previousSymbols.clear();
                }
            });
        }
    });

    // Cleanup on destroy
    $effect(() => {
        return () => {
            for (const sym of previousSymbols) {
                marketWatcher.unregister(sym, "ticker");
                marketWatcher.unregister(sym, "price");
            }
            previousSymbols.clear();
        };
    });

    function getLivePrice(row: Row): string | null {
        // Live ticker first, analysis snapshot second, nothing third.
        //
        // Returning null rather than "0" matters: a price of $0.000000 next to
        // a 0.00% change reads as a real quote for a worthless asset, which is
        // how every unanalysed row looked before.
        const live = marketState.data[row.symbol];
        if (live && live.lastPrice) {
            return new Decimal(live.lastPrice).toString();
        }
        return row.analysis?.price ?? null;
    }

    function getLiveChange(row: Row): number | null {
        const live = marketState.data[row.symbol];
        if (
            live &&
            live.priceChangePercent !== undefined &&
            live.priceChangePercent !== null
        ) {
            return new Decimal(live.priceChangePercent).toNumber();
        }
        const snapshot = row.analysis?.change24h;
        return snapshot === undefined ? null : parseFloat(snapshot);
    }

    function formatPrice(price: string | number) {
        const p = typeof price === "string" ? parseFloat(price) : price;
        if (isNaN(p)) return "0.00";
        return p < 1
            ? p.toFixed(6)
            : p.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
              });
    }
</script>

{#if uiState.showMarketDashboardModal}
    <ModalFrame
        isOpen={true}
        title={$_("app.marketDashboard.title") || "Global Market Overview"}
        showBackdrop={false}
        width={modalWidth}
        height={modalHeight}
        onclose={() => uiState.toggleMarketDashboardModal(false)}
    >
        <div class="space-y-3 sm:space-y-6">
            <!-- Status strip: one slim line -- the space goes to data -->
            <div
                class="flex items-center justify-between gap-2 text-[11px] px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
            >
                <div class="flex items-center gap-2 min-w-0">
                    {#if analysisState.isAnalyzing}
                        {@html ICONS.loading}
                        <span class="animate-pulse text-[var(--accent-color)]"
                            >{$_("dashboard.analyzing")}</span
                        >
                    {:else}
                        <span
                            class="relative flex shrink-0"
                            style="width: var(--indicator-size); height: var(--indicator-size);"
                        >
                            <span
                                class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                style="background-color: var(--success-color);"
                            ></span>
                            <span
                                class="relative inline-flex rounded-full h-full w-full"
                                style="background-color: var(--success-color);"
                            ></span>
                        </span>
                        <span class="text-[var(--success-color)] font-semibold"
                            >{$_("app.marketDashboard.live")}</span
                        >
                    {/if}
                </div>
                <span class="text-[var(--text-secondary)] truncate text-[10px] sm:text-[11px]">
                    {$_("app.marketDashboard.analysedCompact", {
                        values: {
                            analysed: analysedRows.length,
                            total: settingsState.favoriteSymbols.length,
                        },
                    })}
                </span>
            </div>

            <!-- Market Internals Header -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                <div
                    class="bg-[var(--bg-tertiary)] p-2.5 sm:p-4 rounded-xl border border-[var(--border-color)] flex flex-col justify-between"
                >
                    <div
                        class="text-[10px] sm:text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-0.5 sm:mb-1 flex items-center gap-1 truncate"
                    >
                        <span class="truncate">{$_("app.marketDashboard.marketHeat")}</span>
                        <Tooltip text={$_("app.marketDashboard.marketHeatHint")}>
                            <span class="cursor-help opacity-60">?</span>
                        </Tooltip>
                    </div>
                    {#if avgRsi === null}
                        <div class="text-lg sm:text-2xl font-bold text-[var(--text-secondary)]">
                            —
                        </div>
                        <div class="text-[10px] sm:text-xs text-[var(--text-secondary)] truncate">
                            {$_("app.marketDashboard.noData")}
                        </div>
                    {:else}
                        <div class="flex items-baseline sm:items-end gap-1 sm:gap-2">
                            <span class="text-lg sm:text-2xl font-bold">
                                {avgRsi.toFixed(0)}
                            </span>
                            <span
                                class="text-[10px] sm:text-xs font-semibold truncate"
                                class:text-[var(--danger-color)]={avgRsi >= 70}
                                class:text-[var(--success-color)]={avgRsi <= 30}
                                class:text-[var(--text-secondary)]={avgRsi > 30 && avgRsi < 70}
                            >
                                {heatZone}
                            </span>
                        </div>
                        <div
                            class="h-1 bg-[var(--bg-primary)] rounded-full mt-1.5 sm:mt-2 overflow-hidden"
                        >
                            <div
                                class="h-full bg-gradient-to-r from-[var(--success-color)] via-[var(--warning-color)] to-[var(--danger-color)]"
                                style="width: {avgRsi}%"
                            ></div>
                        </div>
                    {/if}
                </div>

                <div
                    class="bg-[var(--bg-tertiary)] p-2.5 sm:p-4 rounded-xl border border-[var(--border-color)] flex flex-col justify-between"
                >
                    <div
                        class="text-[10px] sm:text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-0.5 sm:mb-1 flex items-center gap-1 truncate"
                    >
                        <span class="truncate">{$_("app.marketDashboard.marketBreadth")}</span>
                        <Tooltip text={$_("app.marketDashboard.marketBreadthHint")}>
                            <span class="cursor-help opacity-60">?</span>
                        </Tooltip>
                    </div>
                    {#if breadth === null}
                        <div class="text-lg sm:text-2xl font-bold text-[var(--text-secondary)]">
                            —
                        </div>
                        <div class="text-[10px] sm:text-xs text-[var(--text-secondary)] truncate">
                            {$_("app.marketDashboard.noData")}
                        </div>
                    {:else}
                        <div class="flex items-baseline sm:items-end gap-1 sm:gap-2">
                            <span
                                class="text-lg sm:text-2xl font-bold {breadth.percent > 50
                                    ? 'text-[var(--success-color)]'
                                    : 'text-[var(--danger-color)]'}"
                            >
                                {breadth.percent.toFixed(0)}%
                            </span>
                            <span class="text-[10px] sm:text-xs text-[var(--text-secondary)] truncate">
                                {$_("app.marketDashboard.bullishOf", {
                                    values: {
                                        bullish: breadth.bullish,
                                        total: breadth.measured,
                                    },
                                })}
                            </span>
                        </div>
                        <div
                            class="h-1 bg-[var(--bg-primary)] rounded-full mt-1.5 sm:mt-2 flex overflow-hidden"
                        >
                            <div
                                class="h-full bg-[var(--success-color)]"
                                style="width: {breadth.percent}%"
                            ></div>
                            <div
                                class="h-full bg-[var(--danger-color)]"
                                style="width: {100 - breadth.percent}%"
                            ></div>
                        </div>
                    {/if}
                </div>

                <div
                    class="bg-[var(--bg-tertiary)] p-2.5 sm:p-4 rounded-xl border border-[var(--border-color)] flex flex-col justify-between"
                >
                    <div
                        class="text-[10px] sm:text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-0.5 sm:mb-1 flex items-center gap-1 truncate"
                    >
                        <span class="truncate">{$_("app.marketDashboard.topOpportunity")}</span>
                        <Tooltip text={$_("app.marketDashboard.topOpportunityHint")}>
                            <span class="cursor-help opacity-60">?</span>
                        </Tooltip>
                    </div>
                    {#if topPick}
                        {@const signal = signalOf(topPick.analysis)}
                        <div
                            class="text-sm sm:text-lg font-bold truncate text-[var(--accent-color)]"
                        >
                            {topPick.symbol}
                        </div>
                        <div class="text-[10px] sm:text-xs font-semibold truncate" style="color: {signal.color}">
                            {signal.label}
                            <span class="text-[var(--text-secondary)] font-normal hidden sm:inline">
                                · {$_("app.marketDashboard.trendMatrix.score")}
                                {topPick.analysis?.confluenceScore.toFixed(0)}/100
                            </span>
                        </div>
                    {:else}
                        <div class="text-sm sm:text-lg font-bold text-[var(--text-secondary)] truncate">
                            {$_("app.marketDashboard.scanning")}
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Trend Matrix Table. Height is only capped from md up -- on
                 phones the maximized window's own scroll is the single
                 boundary (nested scroll containers read as broken here). -->
            <div
                class="bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-color)] overflow-hidden flex flex-col md:max-h-[60vh]"
            >
                <!-- Mobile trend legend: names the pill order ONCE instead of
                     repeating a "TREND" label inside every card -->
                <div
                    class="md:hidden px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]"
                >
                    {$_("app.marketDashboard.trendLegend")}
                </div>
                <!-- Desktop Table Header (hidden on mobile < md) -->
                <div
                    class="hidden md:grid grid-cols-12 gap-2 p-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs font-bold text-[var(--text-secondary)] uppercase sticky top-0 z-10"
                >
                    <div class="col-span-2">{$_("journal.deepDive.charts.labels.topAsset")}</div>
                    <div class="col-span-2 text-right">{$_("dashboard.price")}</div>
                    <div class="col-span-3 text-center">
                        {$_("app.marketDashboard.trendMatrix.trend")}
                    </div>
                    <div class="col-span-2 text-right">{$_("app.marketDashboard.funding")}</div>
                    <div class="col-span-3 text-right flex items-center justify-end gap-1">
                        {$_("app.marketDashboard.signal")}
                        <Tooltip text={$_("app.marketDashboard.scoreExplainer")}>
                            <span class="cursor-help opacity-60 normal-case">?</span>
                        </Tooltip>
                    </div>
                </div>

                <!-- Table Body & Mobile Cards Container -->
                <div class="overflow-y-auto custom-scrollbar flex-1">
                    {#each rows as row (row.symbol)}
                        {@const liveChange = getLiveChange(row)}
                        {@const livePrice = getLivePrice(row)}
                        {@const rsiNum = row.analysis ? parseFloat(row.analysis.rsi1h) : null}
                        {@const trends = row.analysis?.trends}
                        {@const signal = signalOf(row.analysis)}
                        {@const isPartial = row.analysis?.quality === "partial"}

                        <!-- DESKTOP ROW (>= md: 768px). Click selects:
                             loads the symbol into the calculator; the window
                             intentionally stays open on desktop. -->
                        <div
                            class="hidden md:grid grid-cols-12 gap-2 p-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-primary)] transition-colors items-center text-sm group cursor-pointer row-selectable {row.analysed
                                ? ''
                                : 'opacity-60'}"
                            class:row-selected={activeSymbol ===
                                row.symbol.toUpperCase()}
                            role="button"
                            tabindex="0"
                            aria-pressed={activeSymbol ===
                                row.symbol.toUpperCase()}
                            title={$_("app.marketDashboard.selectRow")}
                            onclick={() => selectRow(row)}
                            onkeydown={(e) => onRowKeydown(e, row)}
                        >
                            <!-- Asset -->
                            <div class="col-span-2 font-bold flex flex-col min-w-0">
                                <span
                                    class="truncate group-hover:text-[var(--accent-color)] transition-colors"
                                    >{row.symbol}</span
                                >
                                {#if activeSymbol === row.symbol.toUpperCase()}
                                    <span
                                        class="text-[10px] font-semibold text-[var(--accent-color)] flex items-center gap-1"
                                        aria-hidden="true"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="10"
                                            height="10"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="3"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            ><polyline points="20 6 9 17 4 12" /></svg
                                        >
                                    </span>
                                {/if}
                                {#if row.outOfScope}
                                    <Tooltip text={$_("app.marketDashboard.notAnalysedHint")}>
                                        <span
                                            class="text-[10px] font-normal text-[var(--text-secondary)] cursor-help"
                                            >{$_("app.marketDashboard.noData")}</span
                                        >
                                    </Tooltip>
                                {:else if isPartial}
                                    <Tooltip text={$_("app.marketDashboard.partialHint")}>
                                        <span
                                            class="text-[10px] font-normal text-[var(--warning-color)] cursor-help"
                                            >{$_("app.marketDashboard.partial")}</span
                                        >
                                    </Tooltip>
                                {/if}
                            </div>

                            <!-- Price -->
                            <div class="col-span-2 text-right flex flex-col">
                                {#if livePrice === null}
                                    <span class="font-mono text-[var(--text-secondary)]">—</span>
                                {:else}
                                    <span class="font-mono">${formatPrice(livePrice)}</span>
                                {/if}
                                {#if liveChange !== null}
                                    <span
                                        class="text-xs {liveChange >= 0
                                            ? 'text-[var(--success-color)]'
                                            : 'text-[var(--danger-color)]'}"
                                    >
                                        {liveChange > 0 ? "+" : ""}{liveChange.toFixed(2)}%
                                    </span>
                                {/if}
                            </div>

                            <!-- Trend Matrix Cells -->
                            <div
                                class="col-span-3 flex items-center justify-center gap-1"
                            >
                                <div
                                    class="w-2 h-6 rounded-sm {trendCellClass(trends?.['15m'])}"
                                    title={trends?.['15m'] === undefined || trends?.['15m'] === 'unknown'
                                        ? $_("app.marketDashboard.trendUnknown")
                                        : $_("app.marketDashboard.trendMatrix.trend15m")}
                                ></div>
                                <div
                                    class="w-2 h-6 rounded-sm {trendCellClass(trends?.['1h'])}"
                                    title={trends?.['1h'] === undefined || trends?.['1h'] === 'unknown'
                                        ? $_("app.marketDashboard.trendUnknown")
                                        : $_("app.marketDashboard.trendMatrix.trend1h")}
                                ></div>
                                <div
                                    class="w-3 h-8 rounded-sm {trendCellClass(trends?.['4h'])} ring-2 ring-[var(--bg-tertiary)]"
                                    title={trends?.['4h'] === undefined || trends?.['4h'] === 'unknown'
                                        ? $_("app.marketDashboard.trendUnknown")
                                        : $_("app.marketDashboard.trendMatrix.trend4h")}
                                ></div>
                                <div
                                    class="w-2 h-6 rounded-sm {trendCellClass(trends?.['1d'])}"
                                    title={trends?.['1d'] === undefined || trends?.['1d'] === 'unknown'
                                        ? $_("app.marketDashboard.trendUnknown")
                                        : $_("app.marketDashboard.trendMatrix.trend1d")}
                                ></div>
                            </div>

                            <!-- Funding / 24h volume. Volume is secondary:
                                 it only earns its line from xl up, so the
                                 md-xl range does not cram this column. -->
                            <div class="col-span-2 text-right flex flex-col">
                                <span class="font-mono text-xs">
                                    {fundingOf(row.symbol) ?? "—"}
                                </span>
                                <span
                                    class="hidden xl:block text-[10px] text-[var(--text-secondary)]"
                                >
                                    {volumeOf(row.symbol) ?? "—"}
                                </span>
                            </div>

                            <!-- Signal: the level leads, the score supports it -->
                            <div class="col-span-3 flex items-center justify-end gap-2">
                                {#if !row.analysed}
                                    <span class="text-xs text-[var(--text-secondary)] italic">
                                        {$_("app.marketDashboard.noData")}
                                    </span>
                                {:else}
                                    <Tooltip text={scoreTooltip(row.analysis)}>
                                        <div class="flex items-center gap-2 cursor-help">
                                            <div class="flex flex-col items-end">
                                                <span
                                                    class="text-xs font-bold whitespace-nowrap"
                                                    style="color: {signal.color}"
                                                >
                                                    {signal.label}
                                                </span>
                                                {#if rsiNum !== null}
                                                    <span
                                                        class="hidden xl:block text-[10px] font-mono {rsiNum > 70
                                                            ? 'text-[var(--danger-color)]'
                                                            : rsiNum < 30
                                                              ? 'text-[var(--success-color)]'
                                                              : 'text-[var(--text-secondary)]'}"
                                                    >
                                                        RSI {rsiNum.toFixed(1)}
                                                    </span>
                                                {/if}
                                            </div>
                                            <div
                                                class="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border bg-[var(--bg-secondary)]"
                                                style="border-color: {signal.color}"
                                            >
                                                {row.analysis?.confluenceScore.toFixed(0)}
                                            </div>
                                        </div>
                                    </Tooltip>
                                {/if}
                            </div>
                        </div>

                        <!-- MOBILE CARD ROW (< md: 768px). Same selection
                             semantics as desktop; closes after an analysed
                             pick so the user sees the calculator react. -->
                        <div
                            class="md:hidden p-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-primary)] transition-colors flex flex-col gap-2.5 cursor-pointer row-selectable {row.analysed
                                ? ''
                                : 'opacity-60'}"
                            class:row-selected={activeSymbol ===
                                row.symbol.toUpperCase()}
                            role="button"
                            tabindex="0"
                            aria-pressed={activeSymbol ===
                                row.symbol.toUpperCase()}
                            title={$_("app.marketDashboard.selectRow")}
                            onclick={() => selectRow(row)}
                            onkeydown={(e) => onRowKeydown(e, row)}
                        >
                            <!-- Top Tier: Symbol + Price/Change + Confluence Badge -->
                            <div class="flex items-center justify-between gap-2">
                                <!-- Symbol & scope badge -->
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="font-bold text-sm sm:text-base text-[var(--text-primary)] truncate">{row.symbol}</span>
                                    {#if row.outOfScope}
                                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] shrink-0">{$_("app.marketDashboard.noData")}</span>
                                    {:else if isPartial}
                                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--warning-color)] shrink-0">{$_("app.marketDashboard.partial")}</span>
                                    {/if}
                                </div>

                                <div class="flex items-center gap-3 shrink-0">
                                    <!-- Live Price & 24h Change -->
                                    <div class="text-right flex flex-col items-end">
                                        {#if livePrice === null}
                                            <span class="font-mono text-xs sm:text-sm text-[var(--text-secondary)]">—</span>
                                        {:else}
                                            <span class="font-mono font-semibold text-xs sm:text-sm text-[var(--text-primary)]">${formatPrice(livePrice)}</span>
                                        {/if}
                                        {#if liveChange !== null}
                                            <span
                                                class="text-[11px] font-semibold {liveChange >= 0
                                                    ? 'text-[var(--success-color)]'
                                                    : 'text-[var(--danger-color)]'}"
                                            >
                                                {liveChange > 0 ? "+" : ""}{liveChange.toFixed(2)}%
                                            </span>
                                        {/if}
                                    </div>

                                    <!-- Confluence Signal & Score. Touch has no
                                         hover: tapping the badge expands the
                                         score reasoning inline instead. -->
                                    {#if row.analysed}
                                        <button
                                            type="button"
                                            class="flex items-center gap-1.5 cursor-pointer"
                                            title={scoreTooltip(row.analysis)}
                                            aria-expanded={expandedSymbol === row.symbol}
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                expandedSymbol =
                                                    expandedSymbol === row.symbol ? null : row.symbol;
                                            }}
                                        >
                                            <div class="flex flex-col items-end">
                                                <span class="text-[11px] font-bold whitespace-nowrap" style="color: {signal.color}">
                                                    {signal.label}
                                                </span>
                                                {#if rsiNum !== null}
                                                    <span
                                                        class="text-[9px] font-mono {rsiNum > 70
                                                            ? 'text-[var(--danger-color)]'
                                                            : rsiNum < 30
                                                              ? 'text-[var(--success-color)]'
                                                              : 'text-[var(--text-secondary)]'}"
                                                    >
                                                        RSI {rsiNum.toFixed(1)}
                                                    </span>
                                                {/if}
                                            </div>
                                            <div
                                                class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border bg-[var(--bg-secondary)]"
                                                style="border-color: {signal.color}"
                                            >
                                                {row.analysis?.confluenceScore.toFixed(0)}
                                            </div>
                                        </button>
                                    {:else}
                                        <span class="text-xs text-[var(--text-secondary)] italic">
                                            {$_("app.marketDashboard.noData")}
                                        </span>
                                    {/if}
                                </div>
                            </div>

                            <!-- Bottom Tier: Trend Matrix Pills + Funding & Volume -->
                            <div class="flex items-center justify-between pt-1.5 border-t border-[var(--border-color)] border-opacity-40 text-xs text-[var(--text-secondary)]">
                                <!-- Trend Matrix pills (order: 15m · 1h · 4h · 1d -- see legend) -->
                                <div class="flex items-center gap-1.5">
                                    <div class="flex items-center gap-1">
                                        <div
                                            class="w-2 h-4 rounded-xs {trendCellClass(trends?.['15m'])}"
                                            title={trends?.['15m'] === undefined || trends?.['15m'] === 'unknown'
                                                ? $_("app.marketDashboard.trendUnknown")
                                                : $_("app.marketDashboard.trendMatrix.trend15m")}
                                        ></div>
                                        <div
                                            class="w-2 h-4 rounded-xs {trendCellClass(trends?.['1h'])}"
                                            title={trends?.['1h'] === undefined || trends?.['1h'] === 'unknown'
                                                ? $_("app.marketDashboard.trendUnknown")
                                                : $_("app.marketDashboard.trendMatrix.trend1h")}
                                        ></div>
                                        <div
                                            class="w-2.5 h-5 rounded-xs {trendCellClass(trends?.['4h'])} ring-1 ring-[var(--bg-tertiary)]"
                                            title={trends?.['4h'] === undefined || trends?.['4h'] === 'unknown'
                                                ? $_("app.marketDashboard.trendUnknown")
                                                : $_("app.marketDashboard.trendMatrix.trend4h")}
                                        ></div>
                                        <div
                                            class="w-2 h-4 rounded-xs {trendCellClass(trends?.['1d'])}"
                                            title={trends?.['1d'] === undefined || trends?.['1d'] === 'unknown'
                                                ? $_("app.marketDashboard.trendUnknown")
                                                : $_("app.marketDashboard.trendMatrix.trend1d")}
                                        ></div>
                                    </div>
                                </div>

                                <!-- Funding Rate & Quote Volume -->
                                <div class="flex items-center gap-2 font-mono text-[11px]">
                                    {#if fundingOf(row.symbol)}
                                        <span>{$_("app.marketDashboard.funding")}: <strong class="text-[var(--text-primary)]">{fundingOf(row.symbol)}</strong></span>
                                    {/if}
                                    {#if volumeOf(row.symbol)}
                                        <span class="hidden xs:inline">• Vol: <strong class="text-[var(--text-primary)]">{volumeOf(row.symbol)}</strong></span>
                                    {/if}
                                </div>
                            </div>

                            <!-- Expanded score reasoning (mobile tap detail) -->
                            {#if expandedSymbol === row.symbol && row.analysed}
                                <div
                                    class="pt-1.5 text-[10px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-line border-t border-[var(--border-color)]"
                                >
                                    {(row.analysis?.confluenceReasons ?? []).join("\n")}
                                </div>
                            {/if}
                        </div>
                    {:else}
                        <div
                            class="p-8 text-center text-[var(--text-secondary)]"
                        >
                            {#if settingsState.favoriteSymbols.length === 0}
                                {$_("app.marketDashboard.noFavorites")}
                            {:else}
                                {$_("app.marketDashboard.waitingAnalysis")}
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </ModalFrame>
{/if}

<style>
    .row-selectable:focus-visible {
        outline: 2px solid var(--accent-color);
        outline-offset: -2px;
    }
    .row-selected {
        background: color-mix(in srgb, var(--accent-color), transparent 92%);
        box-shadow: inset 3px 0 0 var(--accent-color);
    }
</style>
