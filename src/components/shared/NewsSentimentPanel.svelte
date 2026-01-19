<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
-->

<script lang="ts">
  import { onMount } from "svelte";
  import {
    newsService,
    type NewsItem,
    type SentimentAnalysis,
  } from "../../services/newsService";
  import { settingsState } from "../../stores/settings.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { icons } from "../../lib/constants";
  import { _ } from "../../locales/i18n";
  import CachyIcon from "./CachyIcon.svelte";
  import { fade, slide } from "svelte/transition";

  interface Props {
    symbol?: string; // Optional: filter news by symbol
    variant?: "default" | "sidebar";
  }

  let { symbol, variant = "default" }: Props = $props();

  let news = $state<NewsItem[]>([]);
  let analysis = $state<SentimentAnalysis | null>(null);
  let isLoading = $state(false);
  let isExpanded = $state(false);
  let error = $state<string | null>(null);

  // Computed visual properties
  let sentimentColor = $derived(
    !analysis
      ? "var(--text-secondary)"
      : analysis.score > 0.3
        ? "var(--success-color)"
        : analysis.score < -0.3
          ? "var(--danger-color)"
          : "var(--warning-color)",
  );

  let gaugePercentage = $derived(
    !analysis ? 50 : ((analysis.score + 1) / 2) * 100,
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
      news = (await newsService.fetchNews(symbol)) || []; // Robust fallback
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
    if (
      settingsState.enableNewsAnalysis &&
      (settingsState.cryptoPanicApiKey || settingsState.newsApiKey)
    ) {
      loadData();
    }
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleExpand();
    }
  }
</script>

{#if variant === "sidebar"}
  <div
    class="news-sentiment-panel-sidebar bg-[var(--bg-secondary)] rounded-xl shadow-lg border border-[var(--border-color)] flex flex-col transition-all duration-300 relative z-20 w-full overflow-hidden mt-3"
  >
    <!-- Header / Toggle -->
    <div
      class="p-3 flex justify-between items-center bg-[var(--bg-tertiary)] cursor-pointer select-none border-b border-[var(--border-color)]"
      onclick={toggleExpand}
      onkeydown={handleKeydown}
      role="button"
      tabindex="0"
      aria-expanded={isExpanded}
    >
      <div class="flex items-center gap-2">
        <span class="text-lg">📰</span>
        <h3 class="font-bold text-sm text-[var(--text-primary)]">
          Market Sentiment
        </h3>
      </div>
      <div class="flex items-center gap-2">
        {#if analysis && !isExpanded}
          <span
            class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--bg-primary)]"
            style:color={sentimentColor}
          >
            {analysis.regime}
          </span>
        {/if}
        <div
          class="text-[var(--text-secondary)] transform transition-transform duration-200"
          class:rotate-180={isExpanded}
        >
          {@html icons.chevronDown}
        </div>
      </div>
    </div>

    {#if isExpanded}
      <div transition:slide class="p-3">
        {#if error === "no_api_key"}
          <div class="text-center py-2">
            <p class="text-[10px] text-[var(--text-secondary)] mb-2">
              Setup API Keys in Settings
            </p>
            <button
              class="btn-primary-action text-[10px] px-2 py-1 rounded"
              onclick={() => uiState.toggleSettingsModal(true)}
            >
              Configure
            </button>
          </div>
        {:else if isLoading}
          <div class="flex justify-center py-4">
            <div
              class="w-5 h-5 border-2 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"
            ></div>
          </div>
        {:else if news.length > 0}
          {#if analysis}
            <div
              class="mb-3 bg-[var(--bg-tertiary)] p-2 rounded border-l-3"
              style:border-color={sentimentColor}
            >
              <p
                class="text-xs italic text-[var(--text-primary)] leading-tight"
              >
                "{analysis.summary}"
              </p>
              <div class="mt-2 flex items-center justify-between">
                <span class="text-[10px] font-bold" style:color={sentimentColor}
                  >{analysis.regime} ({(analysis.score * 100).toFixed(
                    0,
                  )}%)</span
                >
                <div
                  class="w-12 h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden relative"
                >
                  <div
                    class="h-full absolute left-0 top-0 transition-all duration-1000"
                    style:width="{gaugePercentage}%"
                    style:background={sentimentColor}
                  ></div>
                </div>
              </div>
            </div>
          {/if}

          <div
            class="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar"
          >
            {#each news.slice(0, 5) as item}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                class="group block p-1.5 hover:bg-[var(--bg-tertiary)] rounded transition-colors border border-transparent hover:border-[var(--border-color)]"
              >
                <div
                  class="text-[11px] font-medium group-hover:text-[var(--accent-color)] leading-snug"
                >
                  {item.title}
                </div>
                <div class="flex justify-between items-center mt-1">
                  <span class="text-[9px] text-[var(--text-tertiary)]"
                    >{item.source}</span
                  >
                  <span class="text-[9px] text-[var(--text-tertiary)]"
                    >{new Date(item.published_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}</span
                  >
                </div>
              </a>
            {/each}
          </div>
        {:else}
          <div class="text-center py-2 text-[var(--text-secondary)] text-xs">
            No data.
          </div>
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <div
    class="news-sentiment-panel glass-panel rounded-xl p-4 mt-4 border border-[var(--border-color)]"
  >
    <button
      type="button"
      class="w-full flex items-center justify-between cursor-pointer bg-transparent border-0 p-0 text-left"
      onclick={toggleExpand}
    >
      <div class="flex items-center gap-3">
        <div class="icon-wrapper text-2xl">📰</div>
        <div>
          <h3
            class="font-bold text-sm uppercase tracking-wider text-[var(--text-primary)]"
          >
            Market Sentiment
          </h3>
          {#if error === "no_api_key"}
            <span class="text-xs text-[var(--text-secondary)]"
              >Setup API Keys in Settings</span
            >
          {:else if isLoading}
            <span class="text-xs text-[var(--text-secondary)]"
              >Analyzing external world...</span
            >
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
          <div
            class="w-16 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden relative"
          >
            <div
              class="h-full absolute left-0 top-0 transition-all duration-1000 ease-out"
              style:width="{gaugePercentage}%"
              style:background={sentimentColor}
            ></div>
            <div
              class="absolute left-1/2 top-0 w-0.5 h-full bg-[var(--text-primary)] opacity-30"
            ></div>
          </div>
        {/if}
        <div
          class="p-1 hover:bg-[var(--bg-secondary)] rounded transition-colors"
        >
          {@html isExpanded ? icons.chevronUp : icons.chevronDown}
        </div>
      </div>
    </button>

    {#if isExpanded}
      <div
        transition:slide
        class="mt-4 border-t border-[var(--border-color)] pt-4"
      >
        {#if error === "no_api_key"}
          <div class="text-center py-4">
            <p class="text-sm text-[var(--text-secondary)] mb-2">
              Connect your news APIs to view sentiment analysis.
            </p>
            <button
              class="btn-primary-action text-xs px-3 py-2 rounded"
              onclick={() => uiState.toggleSettingsModal(true)}
              >Configure</button
            >
          </div>
        {:else if news.length > 0}
          {#if analysis}
            <div
              class="mb-4 bg-[var(--bg-secondary)] p-3 rounded-lg border-l-4"
              style:border-color={sentimentColor}
            >
              <p
                class="text-sm italic text-[var(--text-primary)] leading-relaxed"
              >
                "{analysis.summary}"
              </p>
            </div>
          {/if}
          <div
            class="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar"
          >
            {#each news.slice(0, 5) as item}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                class="block p-2 hover:bg-[var(--bg-secondary)] rounded transition-colors border border-transparent hover:border-[var(--border-color)]"
              >
                <span class="text-sm font-medium leading-tight block"
                  >{item.title}</span
                >
                <span
                  class="text-[10px] text-[var(--text-secondary)] mt-1 block"
                  >{item.source} • {new Date(
                    item.published_at,
                  ).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}</span
                >
              </a>
            {/each}
          </div>
        {:else}
          <div class="text-center py-4 text-[var(--text-secondary)] text-sm">
            No news found.
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

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
