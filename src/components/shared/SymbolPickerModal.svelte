<script lang="ts">
    import { modalManager } from "../../services/modalManager";
    import { CONSTANTS } from "../../lib/constants";
    import { _ } from "../../locales/i18n";
    import ModalFrame from "./ModalFrame.svelte";
    import { updateTradeStore } from "../../stores/tradeStore";
    import { app } from "../../services/app";
    import { bitunixWs } from "../../services/bitunixWs";
    import { marketStore } from "../../stores/marketStore";

    let isOpen = $state(false);
    let searchQuery = $state("");

    modalManager.subscribe((state) => {
        isOpen = state.isOpen && state.type === "symbolPicker";
    });

    const symbols = CONSTANTS.SUGGESTED_SYMBOLS;

    let filteredSymbols = $derived.by(() => {
        if (!searchQuery) return symbols;
        const q = searchQuery.toLowerCase();
        return symbols.filter((s) => s.toLowerCase().includes(q));
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

        <div
            class="symbol-grid scrollbar-thin overflow-y-auto max-h-[60vh] pr-1"
        >
            {#if filteredSymbols.length === 0}
                <div class="text-center py-8 text-[var(--text-secondary)]">
                    Keine Symbole gefunden.
                </div>
            {:else}
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {#each filteredSymbols as s}
                        {@const change = getChangePercent(s)}
                        <button
                            class="symbol-item group relative flex flex-col items-center justify-center p-3 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--accent-color)] hover:text-white transition-all duration-200 border border-[var(--border-color)] overflow-hidden"
                            onclick={() => selectSymbol(s)}
                        >
                            <span
                                class="symbol-name text-sm font-bold tracking-tight mb-1"
                                >{s}</span
                            >

                            {#if change !== null}
                                <span
                                    class="change-badge text-[10px] font-mono px-1.5 py-0.5 rounded-md
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
                        </button>
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
        min-height: 4.5rem;
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
</style>
