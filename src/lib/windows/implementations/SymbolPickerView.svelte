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
    import { onMount, untrack } from "svelte";
    import { CONSTANTS, icons } from "../../../lib/constants";
    const majorsSet = new Set(CONSTANTS.MAJORS);
    import { _ } from "../../../locales/i18n";
    import { tradeState } from "../../../stores/trade.svelte";
    import { app } from "../../../services/app";
    import { bitunixWs } from "../../../services/bitunixWs";
    import { uiState } from "../../../stores/ui.svelte";
    import { marketState } from "../../../stores/market.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import { apiService } from "../../../services/apiService";
    import { windowManager } from "../WindowManager.svelte";
    import type { SymbolPickerWindow } from "./SymbolPickerWindow.svelte";

    interface Props {
        window: SymbolPickerWindow;
    }

    let { window: win }: Props = $props();

    // Ref for A11y focus management
    let searchInputRef: HTMLInputElement | undefined = $state();

    let searchQuery = $state("");
    let viewMode = $state<"favorites" | "gainers" | "volatile" | "all">(
        "favorites",
    );
    let sortMode = $state<"alpha" | "gainers" | "losers" | "volume">("alpha");
    let favoriteSet = $derived(new Set(settingsState.favoriteSymbols || []));

    // Filter States
    let snapshot = $state<Record<string, any>>({});
    let isSnapshotLoading = $state(false);
    let minVolumeStr = $state("0");
    let hideAlts = $state(false);
    let favSet = $derived(new Set(settingsState.favoriteSymbols || []));

    const symbols = CONSTANTS.SUGGESTED_SYMBOLS;

    // Load Snapshot
    onMount(() => {
        isSnapshotLoading = true;
        apiService
            .fetchMarketSnapshot("bitunix")
            .then((data) => {
                const map: any = {};
                data.forEach((t) => (map[t.symbol] = t));
                snapshot = map;
                isSnapshotLoading = false;
            })
            .catch((e) => {
                console.error("Snapshot failed", e);
                isSnapshotLoading = false;
            });

        // Autofocus search
        setTimeout(() => searchInputRef?.focus(), 100);
    });

    let sortedAndFilteredSymbols = $derived.by(() => {
        let result = [];

        // 1. Initial Set: Filter by Search OR Constants (USDT)
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = symbols.filter((s) => s.toLowerCase().includes(q));
        } else {
            result = [...symbols];
        }

        // 2. Filter: Hide Alts (Only Majors)
        if (hideAlts) {
            result = result.filter((s) => majorsSet.has(s));
        }

        // 3. Filter: Min Volume
        const minVol = parseFloat(minVolumeStr);
        if (minVol > 0) {
            result = result.filter((s) => {
                const data = snapshot[s];
                if (!data) return false;
                return Number(data.quoteVolume || 0) >= minVol;
            });
        }

        // 4. View Mode
        if (!searchQuery) {
            if (viewMode === "favorites") {
                // optimized: using derived favSet
                result = result.filter((s) => favSet.has(s));
            } else if (viewMode === "volatile") {
                result = result.filter((s) => {
                    const change = Number(snapshot[s]?.priceChangePercent || 0);
                    return Math.abs(change) >= 5;
                });
            }
        }

        // 5. Sorting
        const effectiveSort =
            viewMode === "gainers" && !searchQuery ? "gainers" : sortMode;

        if (effectiveSort === "gainers") {
            result.sort((a, b) => {
                const changeA = Number(snapshot[a]?.priceChangePercent || 0);
                const changeB = Number(snapshot[b]?.priceChangePercent || 0);
                return changeB - changeA;
            });
        } else if (effectiveSort === "losers") {
            result.sort((a, b) => {
                const changeA = Number(snapshot[a]?.priceChangePercent || 0);
                const changeB = Number(snapshot[b]?.priceChangePercent || 0);
                return changeA - changeB;
            });
        } else if (effectiveSort === "volume") {
            result.sort((a, b) => {
                const volA = Number(snapshot[a]?.quoteVolume || 0);
                const volB = Number(snapshot[b]?.quoteVolume || 0);
                return volB - volA;
            });
        } else {
            result.sort();
        }

        return result;
    });

    // Lazy Subscription Management
    let previousSubs = new Set<string>();

    $effect(() => {
        // Subscribe to top 50 visible symbols
        const visible = sortedAndFilteredSymbols.slice(0, 50);
        const newSubs = new Set(visible);

        // Diffing
        previousSubs.forEach((s) => {
            if (!newSubs.has(s)) bitunixWs.unsubscribe(s, "ticker");
        });
        newSubs.forEach((s) => {
            if (!previousSubs.has(s)) bitunixWs.subscribe(s, "ticker");
        });

        previousSubs = newSubs;

        return () => {
            previousSubs.forEach((s) => bitunixWs.unsubscribe(s, "ticker"));
        };
    });

    function getChangePercent(s: string) {
        const live = marketState.data[s]?.priceChangePercent;
        if (live !== undefined && live !== null)
            return Number(live);
        const snap = snapshot[s]?.priceChangePercent;
        return snap ? Number(snap) : null;
    }

    function selectSymbol(s: string) {
        tradeState.update((state) => ({ ...state, symbol: s }));
        app.fetchAllAnalysisData(s, true);
        win.closeWith(s);
        windowManager.close(win.id);
    }

    function toggleFavorite(e: MouseEvent, symbol: string) {
        e.stopPropagation();
        const favs = settingsState.favoriteSymbols || [];
        if (favs.includes(symbol)) {
            settingsState.favoriteSymbols = favs.filter((f) => f !== symbol);
        } else {
            if (favs.length >= 12) {
                uiState.showError($_("symbolPicker.maxFavorites"));
                return;
            }
            settingsState.favoriteSymbols = [...favs, symbol];
        }
    }

    function isFavorite(symbol: string) {
        return favSet.has(symbol);
    }

    function handleGlobalKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            windowManager.close(win.id);
        } else if (document.activeElement !== searchInputRef) {
            if (
                e.key.length === 1 ||
                e.key === "Backspace" ||
                e.key === "Delete"
            ) {
                if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                    searchInputRef?.focus();
                }
            }
        }
    }

    onMount(() => {
        window.addEventListener("keydown", handleGlobalKeydown);
        return () => window.removeEventListener("keydown", handleGlobalKeydown);
    });
</script>

<div class="symbol-picker-content p-4">
    <div class="search-header flex flex-col gap-3 mb-4">
        <div class="flex items-center justify-between">
            <div class="flex gap-2">
                <button
                    class="header-btn"
                    class:active={viewMode === "favorites"}
                    onclick={() => (viewMode = "favorites")}
                    title={$_("symbolPicker.favorites")}
                >
                    <span class="icon">★</span>
                </button>
                <button
                    class="header-btn"
                    class:active={viewMode === "gainers"}
                    onclick={() => (viewMode = "gainers")}
                    title={$_("symbolPicker.gainers")}
                >
                    <span class="icon">📈</span>
                </button>
                <button
                    class="header-btn"
                    class:active={viewMode === "volatile"}
                    onclick={() => (viewMode = "volatile")}
                    title={$_("symbolPicker.volatile")}
                >
                    <span class="icon">🔥</span>
                </button>
                <button
                    class="header-btn"
                    class:active={viewMode === "all"}
                    onclick={() => (viewMode = "all")}
                    title={$_("symbolPicker.all")}
                >
                    <span class="label uppercase text-xs">{$_("symbolPicker.allShort")}</span>
                </button>
            </div>

            <div class="text-xs opacity-50 font-mono">
                {sortedAndFilteredSymbols.length} Pairs
            </div>
        </div>

        <div class="relative">
            <input
                bind:this={searchInputRef}
                type="text"
                bind:value={searchQuery}
                placeholder={$_("symbolPicker.searchPlaceholder")}
                class="input-field w-full px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
                autocomplete="off"
            />
        </div>

        <div
            class="flex items-center gap-4 text-xs text-[var(--text-secondary)]"
        >
            <div class="flex items-center gap-2">
                <span class="uppercase tracking-wider opacity-60">Vol:</span>
                <select
                    bind:value={minVolumeStr}
                    class="bg-transparent border border-[var(--border-color)] rounded px-2 py-0.5 outline-none"
                >
                    <option value="0">{$_("symbolPicker.allShort")}</option>
                    <option value="1000000">1M+</option>
                    <option value="10000000">10M+</option>
                    <option value="50000000">50M+</option>
                </select>
            </div>

            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" bind:checked={hideAlts} />
                <span class="uppercase tracking-wider opacity-60"
                    >Majors Only</span
                >
            </label>

            <div class="flex items-center gap-1.5 ml-auto">
                <button
                    class="sort-pill"
                    class:active={sortMode === "alpha"}
                    onclick={() => (sortMode = "alpha")}>AZ</button
                >
                <button
                    class="sort-pill"
                    class:active={sortMode === "gainers"}
                    onclick={() => (sortMode = "gainers")}>%↑</button
                >
                <button
                    class="sort-pill"
                    class:active={sortMode === "volume"}
                    onclick={() => (sortMode = "volume")}>{$_("symbolPicker.volShort")}</button
                >
            </div>
        </div>
    </div>

    <div class="symbol-grid overflow-y-auto max-h-[500px] scrollbar-thin pr-1">
        {#if sortedAndFilteredSymbols.length === 0}
            <div class="text-center py-12 opacity-30">
                {$_("symbolPicker.noSymbolsFound")}
            </div>
        {:else}
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {#each sortedAndFilteredSymbols as s}
                    {@const change = getChangePercent(s)}
                    <div
                        role="button"
                        tabindex="0"
                        class="symbol-item flex flex-col items-center justify-center p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-all cursor-pointer relative"
                        onclick={() => selectSymbol(s)}
                        onkeydown={(e) => e.key === "Enter" && selectSymbol(s)}
                    >
                        <button
                            class="absolute top-1 right-1 p-1 opacity-40 hover:opacity-100 transition-opacity"
                            onclick={(e) => toggleFavorite(e, s)}
                        >
                            {@html isFavorite(s)
                                ? icons.starFilled
                                : icons.starEmpty}
                        </button>

                        <span class="font-bold text-sm tracking-tight">{s}</span
                        >

                        {#if change !== null}
                            <span
                                class="text-[10px] mt-1 px-1.5 py-0.5 rounded {change >=
                                0
                                    ? 'text-green-400 bg-green-400/10'
                                    : 'text-red-400 bg-red-400/10'}"
                            >
                                {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                            </span>
                        {:else}
                            <span class="text-[10px] mt-1 opacity-30">--%</span>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>

<style>
    .symbol-picker-content {
        color: var(--text-primary);
    }

    .header-btn {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 4px 10px;
        cursor: pointer;
        transition: all 0.2s;
        color: var(--text-secondary);
    }

    .header-btn:hover,
    .header-btn.active {
        background: var(--accent-color);
        color: white;
        border-color: var(--accent-color);
    }

    .sort-pill {
        background: none;
        border: none;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .sort-pill.active {
        background: var(--accent-color);
        color: white;
    }

    .symbol-item:hover {
        background: rgba(var(--accent-color-rgb), 0.1);
        transform: translateY(-2px);
    }

    .scrollbar-thin::-webkit-scrollbar {
        width: 4px;
    }
    .scrollbar-thin::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
    }
</style>
