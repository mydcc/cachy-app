<script lang="ts">
  import { onMount } from "svelte";
  import ModalFrame from "./ModalFrame.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { _ } from "../../locales/i18n";
  import { CANDLESTICK_PATTERNS, type PatternDefinition } from "../../services/candlestickPatterns";
  import CandlestickChart from "./CandlestickChart.svelte";
  import { marked } from "marked";
  import markedKatex from "marked-katex-extension";
  import "katex/dist/katex.min.css";

  // Setup Markdown with KaTeX
  try {
      marked.use(markedKatex({ throwOnError: false }));
  } catch (e) {
      console.warn("Marked KaTeX extension might already be registered", e);
  }

  let searchQuery = $state("");
  let selectedCategory = $state("All");
  let selectedPatternId = $state(CANDLESTICK_PATTERNS.length > 0 ? CANDLESTICK_PATTERNS[0].id : null);

  // Favorites State
  let favorites = $state<Set<string>>(new Set());

  onMount(() => {
      const stored = localStorage.getItem("candlestick_favorites");
      if (stored) {
          try {
              favorites = new Set(JSON.parse(stored));
          } catch (e) {
              console.error("Failed to parse favorites", e);
          }
      }
  });

  function toggleFavorite(id: string) {
      const newFavorites = new Set(favorites);
      if (newFavorites.has(id)) {
          newFavorites.delete(id);
      } else {
          newFavorites.add(id);
      }
      favorites = newFavorites;
      localStorage.setItem("candlestick_favorites", JSON.stringify([...newFavorites]));
  }

  // Derived filtered list
  let filteredPatterns = $derived(CANDLESTICK_PATTERNS.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesCategory = true;
      if (selectedCategory === "Favorites") {
          matchesCategory = favorites.has(p.id);
      } else if (selectedCategory !== "All") {
          matchesCategory = p.type === selectedCategory;
      }

      return matchesSearch && matchesCategory;
  }));

  // Categories: Favorites first, then All, then others
  const categories = $derived([
      "All",
      "Favorites",
      ...new Set(CANDLESTICK_PATTERNS.map(p => p.type))
  ].sort((a, b) => {
      // Keep All and Favorites at top
      if (a === "All") return -1;
      if (b === "All") return 1;
      if (a === "Favorites") return -1;
      if (b === "Favorites") return 1;
      return a.localeCompare(b);
  }));

  // Current Pattern
  let currentPattern = $derived(CANDLESTICK_PATTERNS.find(p => p.id === selectedPatternId) || CANDLESTICK_PATTERNS[0]);

  function selectPattern(id: string) {
      selectedPatternId = id;
  }

  function getLocalizedText(patternId: string, key: string): string {
      const i18nKey = `candlestickPatterns.${patternId}.${key}` as any;
      const text = $_(i18nKey);
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
    extraClasses="modal-size-instructions"
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
                        <div class="flex items-center gap-2 truncate">
                             {#if favorites.has(pattern.id)}
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3 text-[var(--warning-color)] flex-shrink-0">
                                  <path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" />
                                </svg>
                             {/if}
                             <span class="truncate">{pattern.name}</span>
                        </div>

                        {#if pattern.type.includes("Bullish")}
                            <span class="w-2 h-2 rounded-full bg-[var(--success-color)] flex-shrink-0" title="Bullish"></span>
                        {:else if pattern.type.includes("Bearish")}
                            <span class="w-2 h-2 rounded-full bg-[var(--danger-color)] flex-shrink-0" title="Bearish"></span>
                        {:else}
                            <span class="w-2 h-2 rounded-full bg-[var(--text-tertiary)] flex-shrink-0" title="Neutral/Indecision"></span>
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
                        <div class="flex items-center gap-3">
                            <h2 class="text-2xl font-bold text-[var(--accent-color)]">{currentPattern.name}</h2>
                            <button
                                class="p-1 hover:bg-[var(--bg-secondary)] rounded transition-colors"
                                onclick={() => toggleFavorite(currentPattern.id)}
                                title={favorites.has(currentPattern.id) ? "Remove from Favorites" : "Add to Favorites"}
                            >
                                {#if favorites.has(currentPattern.id)}
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-[var(--warning-color)]">
                                      <path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" />
                                    </svg>
                                {:else}
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-[var(--text-tertiary)]">
                                      <path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.563.045.797.777.388 1.18l-4.204 4.152a.563.563 0 00-.161.503l1.26 5.289a.562.562 0 01-.84.62l-4.738-2.868a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.62l1.26-5.289a.563.563 0 00-.161-.503L3.038 10.577a.562.562 0 01.388-1.18l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                    </svg>
                                {/if}
                            </button>
                        </div>

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
