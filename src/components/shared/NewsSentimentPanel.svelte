<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { newsService, type NewsItem, type SentimentAnalysis } from "../../services/newsService";
  import { settingsState } from "../../stores/settings.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { icons } from "../../lib/constants";
  import { _ } from "../../locales/i18n";
  import CachyIcon from "./CachyIcon.svelte";
  import { fade, slide } from "svelte/transition";

  interface Props {
    symbol?: string; // Optional: filter news by symbol
  }

  let { symbol }: Props = $props();

  let news = $state<NewsItem[]>([]);
  let analysis = $state<SentimentAnalysis | null>(null);
  let isLoading = $state(false);
  let isExpanded = $state(false);
  let error = $state<string | null>(null);

  // Computed visual properties
  let sentimentColor = $derived(
    !analysis ? "var(--text-secondary)" :
    analysis.score > 0.3 ? "var(--success-color)" :
    analysis.score < -0.3 ? "var(--danger-color)" :
    "var(--warning-color)"
  );

  let gaugePercentage = $derived(
    !analysis ? 50 : ((analysis.score + 1) / 2) * 100
  );

  async function loadData() {
    if (!settingsState.enableNewsAnalysis) return;

    if (!settingsState.cryptoPanicApiKey && !settingsState.newsApiKey) {
      error = "no_api_key";
      return;
    }

    isLoading = true;
    error = null;

    try {
      news = await newsService.fetchNews(symbol) || []; // Robust fallback
      if (news && news.length > 0) {
        analysis = await newsService.analyzeSentiment(news);
      }
    } catch (e) {
      console.error("News load error:", e);
      error = "fetch_error";
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    // Only load if enabled and keys are present
    if (settingsState.enableNewsAnalysis && (settingsState.cryptoPanicApiKey || settingsState.newsApiKey)) {
        loadData();
    }
  });

  function toggleExpand() {
    isExpanded = !isExpanded;
  }
</script>

<div class="news-sentiment-panel glass-panel rounded-xl p-4 mt-4 border border-[var(--border-color)]">
  <button
    type="button"
    class="w-full flex items-center justify-between cursor-pointer bg-transparent border-0 p-0 text-left"
    onclick={toggleExpand}
  >
    <div class="flex items-center gap-3">
        <div class="icon-wrapper text-2xl">
           📰
        </div>
        <div>
             <h3 class="font-bold text-sm uppercase tracking-wider text-[var(--text-primary)]">
                Market Sentiment
             </h3>
             {#if error === "no_api_key"}
                <span class="text-xs text-[var(--text-secondary)]">Setup API Keys in Settings</span>
             {:else if isLoading}
                <span class="text-xs text-[var(--text-secondary)]">Analyzing external world...</span>
             {:else if analysis}
                 <span class="text-xs font-bold" style:color={sentimentColor}>
                    {analysis.regime} ({(analysis.score * 100).toFixed(0)}%)
                 </span>
             {:else}
                 <span class="text-xs text-[var(--text-secondary)]">No data</span>
             {/if}
        </div>
    </div>

    <div class="flex items-center gap-2">
         {#if analysis}
            <!-- Mini Gauge -->
            <div class="w-16 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden relative">
                <div
                    class="h-full absolute left-0 top-0 transition-all duration-1000 ease-out"
                    style:width="{gaugePercentage}%"
                    style:background={sentimentColor}
                ></div>
                <!-- Center Marker -->
                <div class="absolute left-1/2 top-0 w-0.5 h-full bg-[var(--text-primary)] opacity-30"></div>
            </div>
         {/if}
         <div class="p-1 hover:bg-[var(--bg-secondary)] rounded transition-colors">
            {@html isExpanded ? icons.chevronUp : icons.chevronDown}
         </div>
    </div>
  </button>

  {#if isExpanded}
    <div transition:slide class="mt-4 border-t border-[var(--border-color)] pt-4">
        {#if error === "no_api_key"}
            <div class="text-center py-4">
                <p class="text-sm text-[var(--text-secondary)] mb-2">To enable FinRL-powered sentiment analysis:</p>
                <button
                    class="btn-primary-action text-xs px-3 py-2 rounded"
                    onclick={() => uiState.toggleSettingsModal(true)}
                >
                    Configure News API Keys
                </button>
            </div>
        {:else if news.length > 0}
            <!-- AI Summary -->
            {#if analysis}
                <div class="mb-4 bg-[var(--bg-secondary)] p-3 rounded-lg border-l-4" style:border-color={sentimentColor}>
                    <p class="text-sm italic text-[var(--text-primary)]">"{analysis.summary}"</p>
                    {#if analysis.keyFactors && analysis.keyFactors.length > 0}
                        <div class="mt-2 flex flex-wrap gap-2">
                            {#each analysis.keyFactors as factor}
                                <span class="text-[10px] uppercase font-bold px-2 py-1 rounded bg-[var(--bg-primary)] opacity-80">
                                    {factor}
                                </span>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- News List -->
            <h4 class="text-xs font-bold uppercase text-[var(--text-secondary)] mb-2">Latest Headlines</h4>
            <div class="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                {#each news.slice(0, 5) as item}
                    <a href={item.url} target="_blank" rel="noopener noreferrer" class="group block p-2 hover:bg-[var(--bg-secondary)] rounded transition-colors">
                        <div class="flex justify-between items-start gap-2">
                            <span class="text-sm font-medium group-hover:text-[var(--accent-color)] leading-tight">
                                {item.title}
                            </span>
                            <span class="text-[10px] text-[var(--text-tertiary)] shrink-0">
                                {new Date(item.published_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                        </div>
                        <span class="text-[10px] text-[var(--text-secondary)] mt-1 block">
                            {item.source}
                        </span>
                    </a>
                {/each}
            </div>

            <div class="mt-3 text-center">
                 <button class="text-xs text-link" onclick={loadData} disabled={isLoading}>
                    {isLoading ? "Refreshing..." : "Refresh Analysis"}
                 </button>
            </div>

        {:else}
             <div class="text-center py-4 text-[var(--text-secondary)] text-sm">
                No news found.
             </div>
        {/if}
    </div>
  {/if}
</div>

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 2px;
    }
</style>
