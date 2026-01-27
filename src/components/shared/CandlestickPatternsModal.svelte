<script lang="ts">
  import { onMount } from "svelte";
  import ModalFrame from "./ModalFrame.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { _ } from "../../locales/i18n";
  import { CANDLESTICK_PATTERNS, type PatternDefinition } from "../../services/candlestickPatterns";
  import CandlestickChart from "./CandlestickChart.svelte";
  import { marked } from "marked";
  import markedKatex from "marked-katex-extension";
  import "katex/dist/katex.min.css"; // Import KaTeX styles for formulas
  import { tradeState } from "../../stores/trade.svelte"; // For potential integration later

  // Setup Markdown with KaTeX
  marked.use(markedKatex({ throwOnError: false }));

  let searchQuery = $state("");
  let selectedCategory = $state("All");
  let selectedPatternId = $state(CANDLESTICK_PATTERNS.length > 0 ? CANDLESTICK_PATTERNS[0].id : null);

  // Derived filtered list
  let filteredPatterns = $derived(CANDLESTICK_PATTERNS.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All" || p.type === selectedCategory;
      return matchesSearch && matchesCategory;
  }));

  // Categories
  const categories = ["All", ...new Set(CANDLESTICK_PATTERNS.map(p => p.type))].sort();

  // Current Pattern
  let currentPattern = $derived(CANDLESTICK_PATTERNS.find(p => p.id === selectedPatternId) || CANDLESTICK_PATTERNS[0]);

  function selectPattern(id: string) {
      selectedPatternId = id;
  }

  function getLocalizedText(patternId: string, key: string): string {
      // Try to get from i18n, fallback to English/Default
      // Key format: candlestickPatterns.{id}.{key}
      const i18nKey = `candlestickPatterns.${patternId}.${key}` as any;
      const text = $_(i18nKey);

      // If translation missing (returns key), try to find in raw data if available (but raw data is in service, not i18n)
      // Actually we pushed the content to i18n.
      // If text equals key, it means missing.
      if (text === i18nKey) {
          return "Translation missing...";
      }
      return text;
  }

  function renderMarkdown(text: string) {
      return marked.parse(text);
  }

</script>

{#if uiState.showCandlestickPatternsModal}
  <ModalFrame
    isOpen={true}
    title={$_("candlestickPatterns.title") || "Candlestick Patterns Academy"}
    onclose={() => uiState.toggleCandlestickPatternsModal(false)}
    extraClasses="modal-size-xl"
  >
    <div class="flex flex-col md:flex-row h-[70vh] gap-4">
        <!-- Sidebar -->
        <div class="w-full md:w-1/3 flex flex-col gap-4 border-r border-[var(--border-color)] pr-4">
            <!-- Search & Filter -->
            <div class="flex flex-col gap-2">
                <input
                    type="text"
                    placeholder="Search patterns..."
                    bind:value={searchQuery}
                    class="input-field w-full px-3 py-2 rounded-md text-sm bg-[var(--bg-tertiary)] border border-[var(--border-color)] focus:border-[var(--accent-color)] outline-none"
                />
                <select
                    bind:value={selectedCategory}
                    class="input-field w-full px-3 py-2 rounded-md text-sm bg-[var(--bg-tertiary)] border border-[var(--border-color)] outline-none"
                >
                    {#each categories as cat}
                        <option value={cat}>{cat}</option>
                    {/each}
                </select>
            </div>

            <!-- List -->
            <div class="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                {#each filteredPatterns as pattern}
                    <button
                        class="text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-[var(--bg-tertiary)] flex justify-between items-center"
                        class:bg-[var(--accent-color)]={selectedPatternId === pattern.id}
                        class:text-[var(--btn-accent-text)]={selectedPatternId === pattern.id}
                        onclick={() => selectPattern(pattern.id)}
                    >
                        <span>{pattern.name}</span>
                        {#if pattern.type.includes("Bullish")}
                            <span class="w-2 h-2 rounded-full bg-[var(--success-color)]" title="Bullish"></span>
                        {:else if pattern.type.includes("Bearish")}
                            <span class="w-2 h-2 rounded-full bg-[var(--danger-color)]" title="Bearish"></span>
                        {:else}
                            <span class="w-2 h-2 rounded-full bg-[var(--text-tertiary)]" title="Neutral/Indecision"></span>
                        {/if}
                    </button>
                {/each}
                {#if filteredPatterns.length === 0}
                    <div class="text-center text-[var(--text-tertiary)] text-sm py-4">No patterns found.</div>
                {/if}
            </div>
        </div>

        <!-- Main Content -->
        <div class="w-full md:w-2/3 flex flex-col gap-6 overflow-y-auto custom-scrollbar px-2">
            {#if currentPattern}
                <!-- Header -->
                <div>
                    <div class="flex justify-between items-start">
                        <h2 class="text-2xl font-bold text-[var(--accent-color)]">{currentPattern.name}</h2>
                        <span class="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                            {currentPattern.type}
                        </span>
                    </div>
                </div>

                <!-- Chart Visualization -->
                <div class="w-full">
                    <CandlestickChart pattern={currentPattern} />
                </div>

                <!-- Details -->
                <div class="flex flex-col gap-6 text-[var(--text-primary)]">

                    <!-- Description -->
                    <div class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]">
                        <h3 class="text-sm font-bold uppercase text-[var(--text-secondary)] mb-2">Description</h3>
                        <div class="prose dark:prose-invert text-sm max-w-none">
                            {@html renderMarkdown(getLocalizedText(currentPattern.id, 'description'))}
                        </div>
                    </div>

                    <!-- Interpretation -->
                    <div class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]">
                        <h3 class="text-sm font-bold uppercase text-[var(--text-secondary)] mb-2">Interpretation</h3>
                        <div class="prose dark:prose-invert text-sm max-w-none">
                            {@html renderMarkdown(getLocalizedText(currentPattern.id, 'interpretation'))}
                        </div>
                    </div>

                    <!-- Indicator Combination / Formula -->
                    <div class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)]">
                        <h3 class="text-sm font-bold uppercase text-[var(--text-secondary)] mb-2">Strategy & Indicators</h3>
                        <div class="prose dark:prose-invert text-sm max-w-none">
                            {@html renderMarkdown(getLocalizedText(currentPattern.id, 'indicatorCombination') || "No specific strategy data available.")}
                        </div>
                    </div>

                </div>
            {/if}
        </div>
    </div>
  </ModalFrame>
{/if}

<style>
    .input-field {
        transition: all 0.2s;
    }
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 3px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }

    /* Markdown Styles specifically for formulas */
    :global(.katex) {
        font-size: 1.1em;
    }
</style>
