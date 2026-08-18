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

    /** The score's own reasoning, already computed by ConfluenceAnalyzer. */
    function scoreTooltip(analysis: SymbolAnalysis | undefined): string {
        const explainer = $_("app.marketDashboard.scoreExplainer");
        const reasons = analysis?.confluenceReasons;
        if (!reasons || reasons.length === 0) return explainer;
        return `${explainer}\n\n${$_("app.marketDashboard.scoreBasis")}:\n${reasons.join("\n")}`;
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
        onclose={() => uiState.toggleMarketDashboardModal(false)}
    >
        <div class="space-y-6">
            <!-- Status strip: one line, so the space goes to data instead -->
            <div
                class="flex items-center justify-between gap-3 text-xs px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
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
                <span class="text-[var(--text-secondary)] truncate">
                    {$_("app.marketDashboard.analysedOf", {
                        values: {
                            analysed: analysedRows.length,
                            total: settingsState.favoriteSymbols.length,
                        },
                    })}
                </span>
            </div>

            <!-- Market Internals Header -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                >
                    <div
                        class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-1 flex items-center gap-1"
                    >
                        {$_("app.marketDashboard.marketHeat")}
                        <Tooltip text={$_("app.marketDashboard.marketHeatHint")}>
                            <span class="cursor-help opacity-60">?</span>
                        </Tooltip>
                    </div>
                    {#if avgRsi === null}
                        <div class="text-2xl font-bold text-[var(--text-secondary)]">
                            —
                        </div>
                        <div class="text-xs text-[var(--text-secondary)]">
                            {$_("app.marketDashboard.noData")}
                        </div>
                    {:else}
                        <div class="flex items-end gap-2">
                            <span class="text-2xl font-bold">
                                {avgRsi.toFixed(0)}
                            </span>
                            <span class="text-xs text-[var(--text-secondary)] mb-1"
                                >{$_("app.marketDashboard.avgRsi")}</span
                            >
                        </div>
                        <div
                            class="h-1 bg-[var(--bg-primary)] rounded-full mt-2 overflow-hidden"
                        >
                            <div
                                class="h-full bg-gradient-to-r from-[var(--success-color)] via-[var(--warning-color)] to-[var(--danger-color)]"
                                style="width: {avgRsi}%"
                            ></div>
                        </div>
                    {/if}
                </div>

                <div
                    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                >
                    <div
                        class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-1 flex items-center gap-1"
                    >
                        {$_("app.marketDashboard.marketBreadth")}
                        <Tooltip text={$_("app.marketDashboard.marketBreadthHint")}>
                            <span class="cursor-help opacity-60">?</span>
                        </Tooltip>
                    </div>
                    {#if breadth === null}
                        <div class="text-2xl font-bold text-[var(--text-secondary)]">
                            —
                        </div>
                        <div class="text-xs text-[var(--text-secondary)]">
                            {$_("app.marketDashboard.noData")}
                        </div>
                    {:else}
                        <div class="flex items-end gap-2">
                            <span
                                class="text-2xl font-bold {breadth.percent > 50
                                    ? 'text-[var(--success-color)]'
                                    : 'text-[var(--danger-color)]'}"
                            >
                                {breadth.percent.toFixed(0)}%
                            </span>
                            <span class="text-xs text-[var(--text-secondary)] mb-1">
                                {$_("app.marketDashboard.bullish")} · n={breadth.sample}
                            </span>
                        </div>
                        <div
                            class="h-1 bg-[var(--bg-primary)] rounded-full mt-2 flex overflow-hidden"
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
                    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                >
                    <div
                        class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-1 flex items-center gap-1"
                    >
                        {$_("app.marketDashboard.topOpportunity")}
                        <Tooltip text={$_("app.marketDashboard.topOpportunityHint")}>
                            <span class="cursor-help opacity-60">?</span>
                        </Tooltip>
                    </div>
                    {#if topPick}
                        {@const signal = signalOf(topPick.analysis)}
                        <div
                            class="text-lg font-bold truncate text-[var(--accent-color)]"
                        >
                            {topPick.symbol}
                        </div>
                        <div class="text-xs font-semibold" style="color: {signal.color}">
                            {signal.label}
                            <span class="text-[var(--text-secondary)] font-normal">
                                · {$_("app.marketDashboard.trendMatrix.score")}
                                {topPick.analysis?.confluenceScore.toFixed(0)}/100
                            </span>
                        </div>
                    {:else}
                        <div class="text-lg font-bold text-[var(--text-secondary)]">
                            {$_("app.marketDashboard.scanning")}
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Trend Matrix Table -->
            <div
                class="bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-color)] overflow-hidden flex flex-col max-h-[60vh]"
            >
                <!-- Table Header -->
                <div
                    class="grid grid-cols-12 gap-2 p-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs font-bold text-[var(--text-secondary)] uppercase sticky top-0 z-10"
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

                <!-- Table Body -->
                <div class="overflow-y-auto custom-scrollbar flex-1">
                    {#each rows as row (row.symbol)}
                        {@const liveChange = getLiveChange(row)}
                        {@const livePrice = getLivePrice(row)}
                        {@const rsiNum = row.analysis ? parseFloat(row.analysis.rsi1h) : null}
                        {@const trends = row.analysis?.trends}
                        {@const signal = signalOf(row.analysis)}
                        {@const isPartial = row.analysis?.quality === "partial"}

                        <div
                            class="grid grid-cols-12 gap-2 p-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-primary)] transition-colors items-center text-sm group {row.analysed
                                ? ''
                                : 'opacity-60'}"
                        >
                            <!-- Asset -->
                            <div class="col-span-2 font-bold flex flex-col min-w-0">
                                <span
                                    class="truncate group-hover:text-[var(--accent-color)] transition-colors"
                                    >{row.symbol}</span
                                >
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

                            <!-- Funding / 24h volume -->
                            <div class="col-span-2 text-right flex flex-col">
                                <span class="font-mono text-xs">
                                    {fundingOf(row.symbol) ?? "—"}
                                </span>
                                <span class="text-[10px] text-[var(--text-secondary)]">
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
                                                        class="text-[10px] font-mono {rsiNum > 70
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
