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
    import { modalState } from "../../stores/modal.svelte";
    import { CONSTANTS, icons } from "../../lib/constants";
    import { _ } from "../../locales/i18n";
    import ModalFrame from "./ModalFrame.svelte";
    import { tradeState } from "../../stores/trade.svelte";
    import { app } from "../../services/app";
    import { bitunixWs } from "../../services/bitunixWs";
    import { uiState } from "../../stores/ui.svelte";
    import { settingsState } from "../../stores/settings.svelte";
    import { apiService } from "../../services/apiService";
    import { marketState } from "../../stores/market.svelte";
    import { Decimal } from "decimal.js";

    let isOpen = $state(false);
    let searchQuery = $state("");
    let viewMode = $state<"favorites" | "gainers" | "volatile" | "all">(
        "favorites",
    );
    let sortMode = $state<"alpha" | "gainers" | "losers" | "volume">("alpha");

    // Filter States
    let snapshot = $state<Record<string, any>>({});
    let isSnapshotLoading = $state(false);
    let minVolumeStr = $state("0");
    let hideAlts = $state(false);

    $effect(() => {
        isOpen =
            modalState.state.isOpen && modalState.state.type === "symbolPicker";
    });

    const symbols = CONSTANTS.SUGGESTED_SYMBOLS;

    // Load Snapshot
    $effect(() => {
        if (isOpen) {
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
        }
    });

    let sortedAndFilteredSymbols = $derived.by(() => {
        let result = [];

        // 1. Initial Set: Filter by Search OR Constants (USDT)
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = symbols.filter((s) => s.toLowerCase().includes(q));
        } else {
            // Basic list
            result = [...symbols];
        }

        // 2. Filter: Hide Alts (Only Majors)
        if (hideAlts) {
            const majors = new Set(CONSTANTS.MAJORS);
            result = result.filter((s) => majors.has(s));
        }

        // 3. Filter: Min Volume (using Snapshot)
        const minVol = parseFloat(minVolumeStr);
        if (minVol > 0) {
            result = result.filter((s) => {
                const data = snapshot[s];
                if (!data) return false; // No data yet = hide? or show? -> Hide if filtering
                return data.quoteVolume.gte(minVol);
            });
        }

        // 4. View Mode
        if (!searchQuery) {
            if (viewMode === "favorites") {
                const favs = settingsState.favoriteSymbols || [];
                result = result.filter((s) => favs.includes(s));
            } else if (viewMode === "volatile") {
                result = result.filter((s) => {
                    // Prefer snapshot for static filtering
                    const change =
                        snapshot[s]?.priceChangePercent?.toNumber() || 0;
                    return Math.abs(change) >= 5;
                });
            }
        }

        // 5. Sorting
        const effectiveSort =
            viewMode === "gainers" && !searchQuery ? "gainers" : sortMode;

        if (effectiveSort === "gainers") {
            result.sort((a, b) => {
                const changeA =
                    snapshot[a]?.priceChangePercent?.toNumber() || 0;
                const changeB =
                    snapshot[b]?.priceChangePercent?.toNumber() || 0;
                return changeB - changeA;
            });
        } else if (effectiveSort === "losers") {
            result.sort((a, b) => {
                const changeA =
                    snapshot[a]?.priceChangePercent?.toNumber() || 0;
                const changeB =
                    snapshot[b]?.priceChangePercent?.toNumber() || 0;
                return changeA - changeB;
            });
        } else if (effectiveSort === "volume") {
            result.sort((a, b) => {
                const volA = snapshot[a]?.quoteVolume?.toNumber() || 0;
                const volB = snapshot[b]?.quoteVolume?.toNumber() || 0;
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
        if (!isOpen) {
            if (previousSubs.size > 0) {
                previousSubs.forEach((s) => bitunixWs.unsubscribe(s, "ticker"));
                previousSubs = new Set();
            }
            return;
        }

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

        // Cleanup on unmount handled by return logic below
        // (Svelte 5 effects don't return cleanup in the same way, we use a separate effect for component destroy?)
        // Actually Svelte 5 $effect returns a cleanup function logic is cleaner differently.
        // We will add a cleanup effect.
    });

    $effect(() => {
        return () => {
            // Global Cleanup
            Array.from(previousSubs).forEach((s) =>
                bitunixWs.unsubscribe(s, "ticker"),
            );
        };
    });

    function getChangePercent(s: string) {
        // Prioritize Live Data, Fallback to Snapshot
        const live = marketState.data[s]?.priceChangePercent;
        if (live !== undefined && live !== null) return live.toNumber();
        const snap = snapshot[s]?.priceChangePercent;
        return snap ? snap.toNumber() : null;
    }

    function selectSymbol(s: string) {
        tradeState.update((state) => ({ ...state, symbol: s }));
        app.fetchAllAnalysisData(s, true);
        modalState.handleModalConfirm(s);
        searchQuery = "";
    }

    function handleClose() {
        modalState.handleModalConfirm(false);
        searchQuery = "";
    }

    function toggleFavorite(e: MouseEvent, symbol: string) {
        e.stopPropagation();
        const favs = settingsState.favoriteSymbols || [];
        if (favs.includes(symbol)) {
            settingsState.favoriteSymbols = favs.filter((f) => f !== symbol);
        } else {
            if (favs.length >= 12) {
                uiState.showError("Maximal 12 Favoriten erlaubt.");
                return;
            }
            settingsState.favoriteSymbols = [...favs, symbol];
        }
    }

    function isFavorite(symbol: string) {
        return (settingsState.favoriteSymbols || []).includes(symbol);
    }

    function handleGlobalKeydown(e: KeyboardEvent) {
        if (!isOpen) return;

        const input = document.querySelector(
            ".symbol-picker-container input",
        ) as HTMLInputElement;
        if (!input) return;

        if (document.activeElement !== input) {
            if (
                e.key.length === 1 ||
                e.key === "Backspace" ||
                e.key === "Delete"
            ) {
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                input.focus();
            }
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
        } else if (e.key === "Escape") {
            handleClose();
        }
    }

    $effect(() => {
        if (isOpen) {
            window.addEventListener("keydown", handleGlobalKeydown);
            setTimeout(() => {
                const input = document.querySelector(
                    ".symbol-picker-container input",
                ) as HTMLInputElement;
                input?.focus();
            }, 60);
        } else {
            window.removeEventListener("keydown", handleGlobalKeydown);
        }
        return () => {
            window.removeEventListener("keydown", handleGlobalKeydown);
            const subs = Array.from(previousSubs); // Capture for closure
            subs.forEach((s) => bitunixWs.unsubscribe(s, "ticker"));
        };
    });
</script>

<ModalFrame
    {isOpen}
    title="Symbol auswählen"
    onclose={handleClose}
    extraClasses="modal-size-lg"
>
    {#snippet headerExtra()}
        <div class="flex gap-2">
            <button
                class="header-btn"
                class:active={viewMode === "favorites"}
                onclick={() => (viewMode = "favorites")}
                title="Favoriten"
            >
                <span class="icon">★</span>
            </button>
            <button
                class="header-btn"
                class:active={viewMode === "gainers"}
                onclick={() => (viewMode = "gainers")}
                title="Top Gainers"
            >
                <span class="icon">📈</span>
            </button>
            <button
                class="header-btn"
                class:active={viewMode === "volatile"}
                onclick={() => (viewMode = "volatile")}
                title="Volatile (>5%)"
            >
                <span class="icon">🔥</span>
            </button>
            <button
                class="header-btn"
                class:active={viewMode === "all"}
                onclick={() => (viewMode = "all")}
                title="Alle Symbole"
            >
                <span class="label">ALL</span>
            </button>
        </div>
    {/snippet}

    <div class="symbol-picker-container">
        <div
            class="search-container mb-4 sticky top-0 bg-[var(--bg-secondary)] pb-2 z-10"
        >
            <input
                type="text"
                bind:value={searchQuery}
                placeholder="Suchen..."
                class="input-field w-full px-4 py-2 rounded-md"
                autocomplete="off"
            />

            <div
                class="flex items-center gap-4 mt-2 text-sm text-[var(--text-secondary)]"
            >
                <!-- Volume Filter -->
                <div class="flex items-center gap-2">
                    <span class="text-xs font-medium uppercase tracking-wider"
                        >Min Vol</span
                    >
                    <select
                        bind:value={minVolumeStr}
                        class="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs focus:ring-1 focus:ring-[var(--accent-color)] outline-none"
                    >
                        <option value="0">All</option>
                        <option value="1000000">1M</option>
                        <option value="5000000">5M</option>
                        <option value="10000000">10M</option>
                        <option value="50000000">50M</option>
                    </select>
                </div>

                <!-- Alt Filter -->
                <label
                    class="flex items-center gap-2 cursor-pointer hover:text-white transition-colors"
                >
                    <input
                        type="checkbox"
                        bind:checked={hideAlts}
                        class="checkbox checkbox-xs border-[var(--border-color)]"
                    />
                    <span class="text-xs font-medium uppercase tracking-wider"
                        >Hide Alts</span
                    >
                </label>

                <div class="h-4 w-[1px] bg-[var(--border-color)] mx-1"></div>

                <!-- Sort Options -->
                <div class="flex items-center gap-1.5">
                    <button
                        class="sort-pill"
                        class:active={sortMode === "alpha"}
                        onclick={() => (sortMode = "alpha")}
                        title="A-Z">AZ</button
                    >
                    <button
                        class="sort-pill"
                        class:active={sortMode === "gainers"}
                        onclick={() => (sortMode = "gainers")}
                        title="Gainers">%↑</button
                    >
                    <button
                        class="sort-pill"
                        class:active={sortMode === "losers"}
                        onclick={() => (sortMode = "losers")}
                        title="Losers">%↓</button
                    >
                    <button
                        class="sort-pill"
                        class:active={sortMode === "volume"}
                        onclick={() => (sortMode = "volume")}
                        title="Volume">VOL</button
                    >
                </div>

                <!-- Loading State -->
                {#if isSnapshotLoading}
                    <span
                        class="animate-pulse text-[var(--accent-color)] ml-auto text-xs"
                        >Syncing Market...</span
                    >
                {:else}
                    <span class="ml-auto text-xs opacity-50"
                        >{sortedAndFilteredSymbols.length} Pairs</span
                    >
                {/if}
            </div>
        </div>

        <div class="symbol-grid scrollbar-thin overflow-y-auto h-[65vh] pr-1">
            {#if sortedAndFilteredSymbols.length === 0}
                <div class="text-center py-8 text-[var(--text-secondary)]">
                    Keine Symbole gefunden.
                </div>
            {:else}
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {#each sortedAndFilteredSymbols as s}
                        {@const change = getChangePercent(s)}
                        <div
                            role="button"
                            tabindex="0"
                            class="symbol-item cursor-pointer group relative flex flex-col items-center justify-center p-3 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--accent-color)] hover:text-white transition-all duration-200 border border-[var(--border-color)] overflow-hidden"
                            onclick={() => selectSymbol(s)}
                            onkeydown={(e) =>
                                e.key === "Enter" && selectSymbol(s)}
                        >
                            <button
                                class="absolute top-1 right-1 p-1 rounded-full text-[var(--text-tertiary)] hover:text-yellow-400 hover:bg-white/10 transition-colors z-20"
                                onclick={(e) => toggleFavorite(e, s)}
                            >
                                {@html isFavorite(s)
                                    ? icons.starFilled
                                    : icons.starEmpty}
                            </button>
                            <span
                                class="symbol-name text-base font-bold tracking-tight mb-1"
                                >{s}</span
                            >

                            {#if change !== null}
                                <span
                                    class="change-badge text-sm font-mono px-2 py-1 rounded-md w-full text-center
                                    {change > 0
                                        ? 'bg-green-500/20 text-green-400 group-hover:bg-white/20 group-hover:text-white'
                                        : change < 0
                                          ? 'bg-red-500/20 text-red-400 group-hover:bg-white/20 group-hover:text-white'
                                          : 'bg-gray-500/20 text-gray-400 group-hover:text-white'}"
                                >
                                    {change > 0 ? "+" : ""}{change.toFixed(2)}%
                                </span>
                            {:else}
                                <span
                                    class="text-[10px] text-[var(--text-secondary)] group-hover:text-white/70"
                                    >--%</span
                                >
                            {/if}

                            <!-- Hover Effekt Glow -->
                            <div
                                class="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-white pointer-events-none"
                            ></div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</ModalFrame>

<style>
    .scrollbar-thin::-webkit-scrollbar {
        width: 6px;
    }
    .scrollbar-thin::-webkit-scrollbar-track {
        background: transparent;
    }
    .scrollbar-thin::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 3px;
    }
    .scrollbar-thin::-webkit-scrollbar-thumb:hover {
        background: var(--text-secondary);
    }

    .symbol-item {
        min-height: 5.5rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        color: var(--text-primary);
    }

    .symbol-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        border-color: rgba(255, 255, 255, 0.2);
        /* VIP Theme Support: Use the button accent text color on hover */
        color: var(--btn-accent-text, white) !important;
    }

    /* Target badges specifically on hover for high contrast */
    .symbol-item:hover .change-badge {
        background-color: rgba(0, 0, 0, 0.1) !important;
        color: inherit !important;
    }

    :global(.modal-size-lg) {
        max-width: 850px !important;
        width: 95% !important;
    }

    .search-container {
        border-bottom: 1px solid var(--border-color);
    }

    .change-badge {
        transition: all 0.2s ease;
    }

    .header-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.75rem;
        border-radius: 0.5rem;
        background-color: var(--bg-tertiary);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
        font-size: 0.875rem;
        font-weight: 500;
        transition: all 0.2s ease;
        cursor: pointer;
    }

    .header-btn:hover {
        background-color: var(--accent-color);
        color: var(--btn-accent-text);
        border-color: var(--accent-color);
    }

    .header-btn.active {
        background-color: var(--accent-color);
        color: var(--btn-accent-text);
    }

    .header-btn .icon {
        font-size: 1rem;
    }

    .header-btn .label {
        font-family: "Inter", monospace;
    }
</style>
