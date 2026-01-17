<script lang="ts">
    import { modalManager } from "../../services/modalManager";
    import { CONSTANTS, icons } from "../../lib/constants";
    import { _ } from "../../locales/i18n";
    import ModalFrame from "./ModalFrame.svelte";
    import { updateTradeStore } from "../../stores/tradeStore";
    import { app } from "../../services/app";
    import { bitunixWs } from "../../services/bitunixWs";
    import { marketStore } from "../../stores/marketStore";
    import { settingsStore } from "../../stores/settingsStore";

    let isOpen = $state(false);
    let searchQuery = $state("");
    let viewMode = $state<"favorites" | "gainers" | "volatile" | "all">(
        "favorites",
    );
    let sortMode = $state<"alpha" | "gainers" | "losers">("alpha");

    modalManager.subscribe((state) => {
        isOpen = state.isOpen && state.type === "symbolPicker";
    });

    const symbols = CONSTANTS.SUGGESTED_SYMBOLS;

    let sortedAndFilteredSymbols = $derived.by(() => {
        let result = [];

        // 1. Basis-Filterung (Suche oder ViewMode)
        if (searchQuery) {
            // Bei Suche global suchen
            const q = searchQuery.toLowerCase();
            result = symbols.filter((s) => s.toLowerCase().includes(q));
        } else {
            // Kein Suchbegriff -> ViewMode anwenden
            if (viewMode === "favorites") {
                const favs = $settingsStore.favoriteSymbols || [];
                result = symbols.filter((s) => favs.includes(s));
            } else if (viewMode === "all") {
                result = [...symbols];
            } else {
                result = [...symbols]; // Für gainers/volatile erstmal alle nehmen
            }
        }

        // 2. Spezial-Filter (Volatile) - nur wenn kein expliziter "All/Adv" mode
        if (viewMode === "volatile" && !searchQuery) {
            result = result.filter((s) => {
                const change = Math.abs(getChangePercent(s) || 0);
                return change >= 5; // Mindestens 5%
            });
        }

        // 3. Sortierung
        // Bei "Gainers" ViewMode erzwingen wir Sortierung, sonst nutzen wir sortMode
        const effectiveSort =
            viewMode === "gainers" && !searchQuery ? "gainers" : sortMode;

        if (effectiveSort === "gainers" || effectiveSort === "losers") {
            result.sort((a, b) => {
                const changeA = getChangePercent(a) || 0;
                const changeB = getChangePercent(b) || 0;
                return effectiveSort === "gainers"
                    ? changeB - changeA
                    : changeA - changeB;
            });
        } else {
            // Alpha sort (default)
            result.sort();
        }

        return result;
    });

    function getChangePercent(s: string) {
        const data = $marketStore[s];
        if (!data || !data.priceChangePercent) return null;
        return data.priceChangePercent.toNumber();
    }

    function selectSymbol(s: string) {
        updateTradeStore((state) => ({ ...state, symbol: s }));
        app.fetchAllAnalysisData(s, true);
        modalManager._handleModalConfirm(s);
        searchQuery = "";
    }

    function handleClose() {
        modalManager._handleModalConfirm(false);
        searchQuery = "";
    }

    function toggleFavorite(e: MouseEvent, symbol: string) {
        e.stopPropagation();
        settingsStore.update((s) => {
            const favs = s.favoriteSymbols || [];
            if (favs.includes(symbol)) {
                return {
                    ...s,
                    favoriteSymbols: favs.filter((f) => f !== symbol),
                };
            } else {
                return { ...s, favoriteSymbols: [...favs, symbol] };
            }
        });
    }

    function isFavorite(symbol: string) {
        return ($settingsStore.favoriteSymbols || []).includes(symbol);
    }

    function handleGlobalKeydown(e: KeyboardEvent) {
        if (!isOpen) return;

        const input = document.querySelector(
            ".symbol-picker-container input",
        ) as HTMLInputElement;
        if (!input) return;

        // Redirect printable characters and basic search keys if not focused
        if (document.activeElement !== input) {
            // Check if it's a "printable" key or Backspace/Delete
            if (
                e.key.length === 1 ||
                e.key === "Backspace" ||
                e.key === "Delete"
            ) {
                // Ignore if CMD/CTRL/ALT is pressed
                if (e.ctrlKey || e.metaKey || e.altKey) return;

                input.focus();
            }
        }
    }

    $effect(() => {
        if (isOpen) {
            window.addEventListener("keydown", handleGlobalKeydown);
            // WebSocket Subscriptions for all suggested symbols
            symbols.forEach((s) => bitunixWs.subscribe(s, "ticker"));

            // Initial focus
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
            // Cleanup subscriptions.
            // We use the symbols list directly to ensure all picker subs are closed.
            symbols.forEach((s) => bitunixWs.unsubscribe(s, "ticker"));
        };
    });
</script>

<ModalFrame
    {isOpen}
    title="Symbol auswählen"
    on:close={handleClose}
    extraClasses="modal-size-lg"
>
    <svelte:fragment slot="header-extra">
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
    </svelte:fragment>

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
