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
    import { uiState } from "../../stores/ui.svelte";
    import { analysisState } from "../../stores/analysis.svelte";
    import { settingsState } from "../../stores/settings.svelte";
    import { marketState } from "../../stores/market.svelte";
    import { marketWatcher } from "../../services/marketWatcher"; // Use existing service
    import { onMount } from "svelte";
    import { _ } from "../../locales/i18n";
    import { fade } from "svelte/transition";
    import { Decimal } from "decimal.js";

    // Icons
    const ICONS = {
        bullish: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-[var(--success-color)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>`,
        bearish: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-[var(--danger-color)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>`,
        neutral: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14" /></svg>`,
        loading: `<svg class="animate-spin h-5 w-5 text-[var(--accent-color)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`,
    };

    let sortedResults = $derived.by(() => {
        // Show ALL favorites, not just analyzed ones
        return settingsState.favoriteSymbols
            .map((sym) => {
                const data = analysisState.results[sym];
                if (data) return data;
                // Placeholder for unanalyzed symbols
                return {
                    symbol: sym,
                    confluenceScore: 0,
                    rsi1h: "50",
                    price: "0",
                    change24h: "0",
                    trend4h: "neutral",
                    condition: "neutral",
                    trends: {
                        "15m": "neutral",
                        "1h": "neutral",
                        "4h": "neutral",
                        "1d": "neutral",
                    },
                };
            })
            .sort(
                (a: any, b: any) =>
                    (b.confluenceScore || 0) - (a.confluenceScore || 0),
            );
    });

    // Effect: Subscribe to live data for displayed symbols when modal is open
    // Optimized with diffing to prevent unnecessary unsubs/subs when sort order changes
    let previousSymbols = new Set<string>();

    // Market Internals Derived Values
    let totalAssets = $derived(sortedResults.length || 1);
    let marketAvgRsi = $derived(
        sortedResults.reduce((acc, item) => acc + parseFloat(item.rsi1h), 0) /
            totalAssets,
    );
    let marketBullishPercent = $derived(
        (analysisState.bullishCount / totalAssets) * 100,
    );

    $effect(() => {
        if (uiState.showMarketDashboardModal) {
            const currentSymbols = new Set(
                sortedResults.map((item) => item.symbol),
            );

            // 1. Unsubscribe symbols that are no longer present
            for (const sym of previousSymbols) {
                if (!currentSymbols.has(sym)) {
                    marketWatcher.unregister(sym, "ticker");
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
        } else {
            // Cleanup all when modal is closed
            if (previousSymbols.size > 0) {
                for (const sym of previousSymbols) {
                    marketWatcher.unregister(sym, "ticker");
                }
                previousSymbols.clear();
            }
        }
    });

    // Cleanup on destroy
    $effect(() => {
        return () => {
            for (const sym of previousSymbols) {
                marketWatcher.unregister(sym, "ticker");
            }
            previousSymbols.clear();
        };
    });

    function getLivePrice(item: any) {
        // Try live data first, fall back to analysis snapshot
        const live = marketState.data[item.symbol];
        if (live && live.lastPrice) {
            return new Decimal(live.lastPrice).toString();
        }
        return item.price;
    }

    function getLiveChange(item: any) {
        const live = marketState.data[item.symbol];
        if (
            live &&
            live.priceChangePercent !== undefined &&
            live.priceChangePercent !== null
        ) {
            return new Decimal(live.priceChangePercent).toNumber();
        }
        return parseFloat(item.change24h);
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
            <!-- Market Internals Header -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div
                    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                >
                    <div
                        class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-1"
                    >
                        {$_("app.marketDashboard.marketHeat")}
                    </div>
                    <div class="flex items-end gap-2">
                        <span class="text-2xl font-bold">
                            {marketAvgRsi.toFixed(0)}
                        </span>
                        <span class="text-xs text-[var(--text-secondary)] mb-1"
                            >{$_("app.marketDashboard.avgRsi")}</span
                        >
                    </div>
                    <!-- Simple Heat Bar -->
                    <div
                        class="h-1 bg-[var(--bg-primary)] rounded-full mt-2 overflow-hidden"
                    >
                        <div
                            class="h-full bg-gradient-to-r from-[var(--success-color)] via-[var(--warning-color)] to-[var(--danger-color)]"
                            style="width: {marketAvgRsi}%"
                        ></div>
                    </div>
                </div>

                <div
                    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                >
                    <div
                        class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-1"
                    >
                        {$_("app.marketDashboard.marketBreadth")}
                    </div>
                    <div class="flex items-end gap-2">
                        <span
                            class="text-2xl font-bold {marketBullishPercent > 50
                                ? 'text-[var(--success-color)]'
                                : 'text-[var(--danger-color)]'}"
                        >
                            {marketBullishPercent.toFixed(0)}%
                        </span>
                        <span class="text-xs text-[var(--text-secondary)] mb-1"
                            >{$_("app.marketDashboard.bullish")}</span
                        >
                    </div>
                    <div
                        class="h-1 bg-[var(--bg-primary)] rounded-full mt-2 flex overflow-hidden"
                    >
                        <div
                            class="h-full bg-[var(--success-color)]"
                            style="width: {marketBullishPercent}%"
                        ></div>
                        <div
                            class="h-full bg-[var(--danger-color)]"
                            style="width: {100 - marketBullishPercent}%"
                        ></div>
                    </div>
                </div>

                <div
                    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                >
                    <div
                        class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-1"
                    >
                        {$_("app.marketDashboard.topOpportunity")}
                    </div>
                    <div
                        class="text-lg font-bold truncate text-[var(--accent-color)]"
                    >
                        {sortedResults[0]?.symbol || "Scanning..."}
                    </div>
                    <div class="text-xs text-[var(--text-secondary)]">
                        Score: {sortedResults[0]?.confluenceScore.toFixed(0) ||
                            0}/100
                    </div>
                </div>

                <div
                    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                >
                    <div
                        class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-1"
                    >
                        {$_("app.marketDashboard.status")}
                    </div>
                    <div
                        class="text-sm font-bold flex items-center gap-2 h-full pb-4"
                    >
                        {#if analysisState.isAnalyzing}
                            {@html ICONS.loading}
                            <span
                                class="animate-pulse text-[var(--accent-color)]"
                                >{$_("dashboard.analyzing")}</span
                            >
                        {:else}
                            <span
                                class="text-[var(--success-color)] flex items-center gap-2"
                            >
                                <span class="relative flex h-2 w-2">
                                    <span
                                        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
                                    ></span>
                                    <span
                                        class="relative inline-flex rounded-full h-2 w-2 bg-green-500"
                                    ></span>
                                </span>
                                Live
                            </span>
                        {/if}
                    </div>
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
                    <div class="col-span-3">{$_("journal.deepDive.charts.labels.topAsset")}</div>
                    <div class="col-span-2 text-right">{$_("dashboard.price")}</div>
                    <div class="col-span-4 text-center">
                        {$_("app.marketDashboard.trendMatrix.trend")}
                    </div>
                    <div class="col-span-2 text-right">{$_("app.marketDashboard.trendMatrix.rsi")}</div>
                    <div class="col-span-1 text-center">{$_("app.marketDashboard.trendMatrix.score")}</div>
                </div>

                <!-- Table Body -->
                <div class="overflow-y-auto custom-scrollbar flex-1">
                    {#each sortedResults as item (item.symbol)}
                        {@const liveChange = getLiveChange(item)}
                        {@const livePrice = getLivePrice(item)}
                        {@const rsiNum = parseFloat(item.rsi1h)}
                        {@const trends = item.trends || {
                            "15m": "neutral",
                            "1h": "neutral",
                            "4h": item.trend4h,
                            "1d": "neutral",
                        }}

                        <div
                            class="grid grid-cols-12 gap-2 p-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-primary)] transition-colors items-center text-sm group"
                        >
                            <!-- Asset -->
                            <div class="col-span-3 font-bold flex flex-col">
                                <span
                                    class="group-hover:text-[var(--accent-color)] transition-colors"
                                    >{item.symbol}</span
                                >
                            </div>

                            <!-- Price -->
                            <div class="col-span-2 text-right flex flex-col">
                                <span class="font-mono"
                                    >${formatPrice(livePrice)}</span
                                >
                                <span
                                    class="text-xs {liveChange >= 0
                                        ? 'text-[var(--success-color)]'
                                        : 'text-[var(--danger-color)]'}"
                                >
                                    {liveChange > 0
                                        ? "+"
                                        : ""}{liveChange.toFixed(2)}%
                                </span>
                            </div>

                            <!-- Trend Matrix Cells -->
                            <div
                                class="col-span-4 flex items-center justify-center gap-1"
                            >
                                <!-- 15m -->
                                <div
                                    class="w-2 h-6 rounded-sm {trends['15m'] ===
                                    'bullish'
                                        ? 'bg-[var(--success-color)]'
                                        : trends['15m'] === 'bearish'
                                          ? 'bg-[var(--danger-color)]'
                                          : 'bg-[var(--text-secondary)]/20'}"
                                    title="15m Trend"
                                ></div>
                                <!-- 1h -->
                                <div
                                    class="w-2 h-6 rounded-sm {trends['1h'] ===
                                    'bullish'
                                        ? 'bg-[var(--success-color)]'
                                        : trends['1h'] === 'bearish'
                                          ? 'bg-[var(--danger-color)]'
                                          : 'bg-[var(--text-secondary)]/20'}"
                                    title="1h Trend"
                                ></div>
                                <!-- 4h -->
                                <div
                                    class="w-3 h-8 rounded-sm {trends['4h'] ===
                                    'bullish'
                                        ? 'bg-[var(--success-color)]'
                                        : trends['4h'] === 'bearish'
                                          ? 'bg-[var(--danger-color)]'
                                          : 'bg-[var(--text-secondary)]/20'} ring-2 ring-[var(--bg-tertiary)]"
                                    title="4h Trend (Major)"
                                ></div>
                                <!-- 1d -->
                                <div
                                    class="w-2 h-6 rounded-sm {trends['1d'] ===
                                    'bullish'
                                        ? 'bg-[var(--success-color)]'
                                        : trends['1d'] === 'bearish'
                                          ? 'bg-[var(--danger-color)]'
                                          : 'bg-[var(--text-secondary)]/20'}"
                                    title="1d Trend"
                                ></div>
                            </div>

                            <!-- RSI -->
                            <div
                                class="col-span-2 text-right font-mono {rsiNum >
                                70
                                    ? 'text-[var(--danger-color)]'
                                    : rsiNum < 30
                                      ? 'text-[var(--success-color)]'
                                      : 'text-[var(--text-secondary)]'}"
                            >
                                {rsiNum.toFixed(1)}
                            </div>

                            <!-- Score -->
                            <div class="col-span-1 flex justify-center">
                                <div
                                    class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                                >
                                    {item.confluenceScore.toFixed(0)}
                                </div>
                            </div>
                        </div>
                    {:else}
                        <div
                            class="p-8 text-center text-[var(--text-secondary)]"
                        >
                            {#if settingsState.favoriteSymbols.length === 0}
                                No favorites selected. Add symbols to your
                                favorites list.
                            {:else}
                                Waiting for analysis data...
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </ModalFrame>
{/if}
