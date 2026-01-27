<script lang="ts">
    import ModalFrame from "./ModalFrame.svelte";
    import { uiState } from "../../stores/ui.svelte";
    import { analysisState } from "../../stores/analysis.svelte";
    import { settingsState } from "../../stores/settings.svelte";
    import { onMount } from "svelte";
    import { _ } from "../../locales/i18n";
    import { fade } from "svelte/transition";

    // Icons
    const ICONS = {
        bullish: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-[var(--success-color)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>`,
        bearish: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-[var(--danger-color)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>`,
        neutral: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14" /></svg>`,
        loading: `<svg class="animate-spin h-5 w-5 text-[var(--accent-color)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`,
    };

    let sortedResults = $derived(analysisState.sortedByScore);

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
        title={$_("marketDashboard.title") || "Global Market Overview"}
        onclose={() => uiState.toggleMarketDashboardModal(false)}
    >
        <div class="space-y-6">
            <!-- Header Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div
                    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                >
                    <div
                        class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-1"
                    >
                        Total Assets
                    </div>
                    <div class="text-2xl font-bold">{sortedResults.length}</div>
                </div>
                <div
                    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                >
                    <div
                        class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-1"
                    >
                        Bullish / Bearish
                    </div>
                    <div class="text-2xl font-bold flex items-center gap-2">
                        <span class="text-[var(--success-color)]"
                            >{analysisState.bullishCount}</span
                        >
                        <span class="text-[var(--text-secondary)]">/</span>
                        <span class="text-[var(--danger-color)]"
                            >{analysisState.bearishCount}</span
                        >
                    </div>
                </div>
                <div
                    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                >
                    <div
                        class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-1"
                    >
                        Top Opportunity
                    </div>
                    <div
                        class="text-lg font-bold truncate text-[var(--accent-color)]"
                    >
                        {sortedResults[0]?.symbol || "N/A"}
                    </div>
                </div>
                <div
                    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]"
                >
                    <div
                        class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider mb-1"
                    >
                        Status
                    </div>
                    <div class="text-sm font-bold flex items-center gap-2">
                        {#if analysisState.isAnalyzing}
                            {@html ICONS.loading} Analyzing...
                        {:else}
                            <span class="text-[var(--success-color)]"
                                >● Live</span
                            >
                        {/if}
                    </div>
                </div>
            </div>

            <!-- Assets Grid -->
            <div
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2"
            >
                {#each sortedResults as item (item.symbol)}
                    {@const changeNum = parseFloat(item.change24h)}
                    {@const rsiNum = parseFloat(item.rsi1h)}
                    <div
                        class="bg-[var(--bg-tertiary)] rounded-xl p-4 border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-all group"
                    >
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <h3 class="font-bold text-lg">{item.symbol}</h3>
                                <div
                                    class="text-xs text-[var(--text-secondary)]"
                                >
                                    ${formatPrice(item.price)}
                                    <span
                                        class={changeNum >= 0
                                            ? "text-[var(--success-color)]"
                                            : "text-[var(--danger-color)]"}
                                    >
                                        ({changeNum > 0
                                            ? "+"
                                            : ""}{changeNum.toFixed(2)}%)
                                    </span>
                                </div>
                            </div>
                            <div class="flex flex-col items-end gap-1">
                                <div
                                    class="bg-[var(--bg-primary)] px-2 py-1 rounded text-xs font-bold border border-[var(--border-color)]"
                                >
                                    Score: {item.confluenceScore.toFixed(0)}
                                </div>
                                <div title="4h Trend">
                                    {@html item.trend4h === "bullish"
                                        ? ICONS.bullish
                                        : item.trend4h === "bearish"
                                          ? ICONS.bearish
                                          : ICONS.neutral}
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div class="bg-[var(--bg-primary)] p-2 rounded">
                                <span class="text-[var(--text-secondary)] block"
                                    >RSI (1h)</span
                                >
                                <span
                                    class="font-mono text-sm"
                                    class:text-[var(--danger-color)]={rsiNum >
                                        70}
                                    class:text-[var(--success-color)]={rsiNum <
                                        30}
                                >
                                    {rsiNum.toFixed(1)}
                                </span>
                            </div>
                            <div class="bg-[var(--bg-primary)] p-2 rounded">
                                <span class="text-[var(--text-secondary)] block"
                                    >Condition</span
                                >
                                <span
                                    class="font-bold uppercase text-[10px] tracking-wide"
                                    class:text-[var(--warning-color)]={item.condition ===
                                        "overbought" ||
                                        item.condition === "oversold"}
                                    class:text-[var(--accent-color)]={item.condition ===
                                        "trending"}
                                >
                                    {item.condition}
                                </span>
                            </div>
                        </div>
                    </div>
                {:else}
                    <div
                        class="col-span-full py-12 text-center text-[var(--text-secondary)]"
                    >
                        {#if settingsState.favoriteSymbols.length === 0}
                            No favorites selected. Add symbols to your favorites
                            to see them here.
                        {:else}
                            Waiting for data...
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    </ModalFrame>
{/if}
