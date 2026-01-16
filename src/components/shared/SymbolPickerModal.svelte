<script lang="ts">
    import { modalManager } from "../../services/modalManager";
    import { CONSTANTS } from "../../lib/constants";
    import { _ } from "../../locales/i18n";
    import ModalFrame from "./ModalFrame.svelte";
    import { updateTradeStore } from "../../stores/tradeStore";
    import { app } from "../../services/app";

    let isOpen = $state(false);
    let searchQuery = $state("");

    modalManager.subscribe((state) => {
        isOpen = state.isOpen && state.type === "symbolPicker";
    });

    const symbols = CONSTANTS.SUGGESTED_SYMBOLS;

    let filteredSymbols = $derived.by(() => {
        if (!searchQuery) return symbols;
        return symbols.filter((s) =>
            s.toLowerCase().includes(searchQuery.toLowerCase()),
        );
    });

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
</script>

<ModalFrame
    {isOpen}
    title="Symbol auswählen"
    on:close={handleClose}
    extraClasses="modal-size-md"
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
                autofocus
            />
        </div>

        <div class="symbol-grid scrollbar-thin overflow-y-auto max-h-[60vh]">
            {#if filteredSymbols.length === 0}
                <div class="text-center py-8 text-[var(--text-secondary)]">
                    Keine Symbole gefunden.
                </div>
            {:else}
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {#each filteredSymbols as s}
                        <button
                            class="symbol-item p-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--accent-color)] hover:text-white transition-all text-sm font-medium border border-[var(--border-color)]"
                            onclick={() => selectSymbol(s)}
                        >
                            {s}
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
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        min-height: 3rem;
    }

    .search-container {
        border-bottom: 1px solid var(--border-color);
    }
</style>
