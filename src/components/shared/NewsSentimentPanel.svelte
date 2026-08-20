<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
-->

<script lang="ts">
  import { untrack } from "svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { newsStore } from "../../stores/news.svelte";
  import { windowManager } from "../../lib/windows/WindowManager.svelte";
  import { _ } from "../../locales/i18n";
  import { slide } from "svelte/transition";
  import type { NewsItem } from "../../services/newsService";
  import { frameSupportService } from "../../services/frameSupportService";

  interface Props {
    symbol?: string; // Optional: filter news by symbol
    variant?: "sidebar" | "main"; // Display variant
  }

  let { symbol, variant = "main" }: Props = $props();

  function getStorageKey(v: string) {
    return `cachy_news_sentiment_expanded_${v}`;
  }

  function getInitialExpanded(v: string): boolean {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
      const saved = localStorage.getItem(getStorageKey(v));
      if (saved !== null) {
        return saved === "true";
      }
    } catch {
      // Ignore
    }
    return false;
  }

  // Local state persisted across reloads
  let isExpanded = $state(false);

  $effect(() => {
    isExpanded = getInitialExpanded(variant);
  });

  // Derived state from store (filtered when In-App Window mode is chosen)
  let rawNews = $derived(newsStore.news);
  let news = $derived.by(() => {
    if (settingsState.newsOpenBehavior === "window") {
      return rawNews.filter((item) => !frameSupportService.isDomainFrameBlocked(item.url));
    }
    return rawNews;
  });
  let analysis = $derived(newsStore.sentiment);
  let isLoading = $derived(newsStore.isLoading);

  // Color mapping based on score
  let sentimentColor = $derived.by(() => {
    if (!analysis) return "var(--text-secondary)";
    if (analysis.score > 0.15) return "var(--color-long)";
    if (analysis.score < -0.15) return "var(--color-short)";
    return "var(--text-secondary)";
  });

  let gaugePercentage = $derived.by(() => {
    if (!analysis) return 50;
    // Map -1 to 1 into 0 to 100
    return Math.min(Math.max((analysis.score + 1) * 50, 0), 100);
  });

  // Track initial symbol to prevent auto-fetching if it was passed via props
  let hasAutoFetched = false;

  // Auto-refresh when symbol changes and news analysis is enabled
  $effect(() => {
    // Only auto-fetch ONCE on mount if symbol is present, or subsequently when symbol explicitly changes
    if (symbol && settingsState.enableNewsAnalysis) {
      if (!hasAutoFetched) {
        hasAutoFetched = true;
        untrack(() => {
          newsStore.refresh(symbol);
        });
      } else {
        // If symbol explicitly changes after mount
        if (!newsStore.isLoading || newsStore.lastSymbol !== symbol) {
          newsStore.refresh(symbol);
        }
      }
    }
  });

  function toggleExpand() {
    isExpanded = !isExpanded;
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        localStorage.setItem(getStorageKey(variant), String(isExpanded));
      } catch {
        // Ignore
      }
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleExpand();
    }
  }

  function handleRefresh(e: Event) {
    e.stopPropagation();
    newsStore.refresh(symbol, true);
  }

  function handleArticleClick(e: MouseEvent, item: NewsItem) {
    e.preventDefault();
    if (settingsState.newsOpenBehavior === "new_tab") {
      window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }

    const displayTitle = item.title ? `News: ${item.title}` : $_("dashboard.article");
    windowManager.openIframe(item.url, displayTitle, {
      width: 640,
      height: 360,
      minWidth: 320,
      minHeight: 180,
      showOpenInNewTab: true,
      allowZoom: true,
      storageKey: "news_article",
      description: item.description,
      source: item.source,
      published_at: item.published_at,
    });
  }

  function handleDirectNewTab(e: MouseEvent, url: string) {
    e.stopPropagation();
    e.preventDefault();
    window.open(url, "_blank", "noopener,noreferrer");
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
        <span class="text-sm">📰</span>
        <span
          class="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]"
        >
          {$_("dashboard.marketSentiment")}
        </span>
      </div>

      <div class="flex items-center gap-2">
        {#if isLoading}
          <div
            class="animate-spin w-3.5 h-3.5 border-2 border-[var(--accent-color)] border-t-transparent rounded-full"
          ></div>
        {/if}

        <button
          type="button"
          onclick={handleRefresh}
          class="p-1 hover:bg-[var(--bg-secondary)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer border-0 bg-transparent"
          title={$_("dashboard.refreshNews")}
          aria-label={$_("dashboard.refreshNews")}
        >
          <svg
            class="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            ></path>
          </svg>
        </button>

        <span
          class="text-xs text-[var(--text-secondary)] transform transition-transform duration-200"
          style:transform={isExpanded ? "rotate(180deg)" : "rotate(0deg)"}
        >
          ▼
        </span>
      </div>
    </div>

    <!-- Body -->
    {#if isExpanded}
      <div
        class="p-3 flex flex-col gap-3 bg-[var(--bg-primary)] border-t border-[var(--border-color)]"
        transition:slide={{ duration: 200 }}
      >
        {#if !settingsState.enableNewsAnalysis}
          <div class="text-center py-2 text-[var(--text-secondary)] text-xs">
            <p>{$_("dashboard.connectNews")}</p>
            <button
              type="button"
              onclick={() => uiState.toggleSettingsModal(true)}
              class="mt-2 text-[var(--accent-color)] underline cursor-pointer text-xs bg-transparent border-0"
            >
              {$_("dashboard.configure")}
            </button>
          </div>
        {:else if isLoading && news.length === 0}
          <div
            class="flex items-center justify-center gap-2 py-4 text-[var(--text-secondary)] text-xs"
          >
            <div
              class="animate-spin w-4 h-4 border-2 border-[var(--accent-color)] border-t-transparent rounded-full"
            ></div>
            <span>{$_("dashboard.analyzing")}</span>
          </div>
        {:else if news.length > 0}
          <!-- Sentiment Gauge Small -->
          {#if analysis}
            <div
              class="flex flex-col gap-1 bg-[var(--bg-tertiary)] p-2 rounded border border-[var(--border-color)]"
            >
              <div class="flex justify-between items-center">
                <span class="text-[10px] text-[var(--text-secondary)]"
                  >Regime</span
                >
                <span class="text-[10px] font-bold" style:color={sentimentColor}
                  >{analysis.regime} ({(analysis.score * 100).toFixed(
                    0,
                  )}%)</span
                >
              </div>
              <div
                class="w-full h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden"
              >
                <div
                  class="h-full transition-all duration-1000"
                  style:width="{gaugePercentage}%"
                  style:background={sentimentColor}
                ></div>
              </div>
            </div>
          {/if}

          <div
            class="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar"
          >
            {#each news.slice(0, 5) as item}
              <div
                class="group flex items-start justify-between p-1.5 hover:bg-[var(--bg-tertiary)] rounded transition-colors border border-transparent hover:border-[var(--border-color)] text-left w-full cursor-pointer"
                onclick={(e) => handleArticleClick(e, item)}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === "Enter" && handleArticleClick(e as unknown as MouseEvent, item)}
              >
                <div class="flex-1 pr-1">
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
                </div>
                <button
                  type="button"
                  onclick={(e) => handleDirectNewTab(e, item.url)}
                  title={$_("dashboard.openInNewTab")}
                  class="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--bg-secondary)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all cursor-pointer flex-shrink-0"
                  aria-label={$_("dashboard.openInNewTab")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-2 text-[var(--text-secondary)] text-xs">
            {$_("journal.noData")}
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
            {$_("dashboard.marketSentiment")}
          </h3>
          <p class="text-xs text-[var(--text-secondary)]">
            {symbol
              ? `News & Sentiment for ${symbol}`
              : "Global Market Sentiment"}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        {#if analysis}
          <div class="text-right hidden sm:block">
            <span class="text-xs font-bold block" style:color={sentimentColor}>
              {analysis.regime}
            </span>
            <span class="text-[10px] text-[var(--text-secondary)]">
              Score: {(analysis.score * 100).toFixed(0)}%
            </span>
          </div>
        {/if}

        <span
          class="text-sm text-[var(--text-secondary)] transform transition-transform duration-200"
          style:transform={isExpanded ? "rotate(180deg)" : "rotate(0deg)"}
        >
          ▼
        </span>
      </div>
    </button>

    {#if isExpanded}
      <div
        class="mt-4 pt-4 border-t border-[var(--border-color)] flex flex-col gap-4"
        transition:slide={{ duration: 200 }}
      >
        <div class="flex justify-between items-center">
          <span class="text-xs text-[var(--text-secondary)] font-medium">
            {news.length} Articles Analyzed
          </span>
          <button
            type="button"
            onclick={handleRefresh}
            class="btn-action text-xs flex items-center gap-1.5 py-1 px-2.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors border border-[var(--border-color)]"
          >
            <span>🔄</span> Refresh
          </button>
        </div>

        {#if !settingsState.enableNewsAnalysis}
          <div class="text-center py-4 text-[var(--text-secondary)] text-sm">
            <p>{$_("dashboard.connectNews")}</p>
            <button
              type="button"
              onclick={() => uiState.toggleSettingsModal(true)}
              class="btn-primary-action mt-2 text-xs py-1.5 px-3 rounded"
            >
              {$_("dashboard.configure")}
            </button>
          </div>
        {:else if isLoading && news.length === 0}
          <div
            class="flex items-center justify-center gap-2 py-8 text-[var(--text-secondary)]"
          >
            <div
              class="animate-spin w-5 h-5 border-2 border-[var(--accent-color)] border-t-transparent rounded-full"
            ></div>
            <span class="text-sm">{$_("dashboard.analyzing")}</span>
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
              <div
                class="group flex items-start justify-between p-2 hover:bg-[var(--bg-secondary)] rounded transition-colors border border-transparent hover:border-[var(--border-color)] text-left w-full cursor-pointer"
                onclick={(e) => handleArticleClick(e, item)}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === "Enter" && handleArticleClick(e as unknown as MouseEvent, item)}
              >
                <div class="flex-1 pr-2">
                  <span class="text-sm font-medium leading-tight block group-hover:text-[var(--accent-color)]"
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
                </div>
                <button
                  type="button"
                  onclick={(e) => handleDirectNewTab(e, item.url)}
                  title={$_("dashboard.openInNewTab")}
                  class="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer flex-shrink-0"
                  aria-label={$_("dashboard.openInNewTab")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-4 text-[var(--text-secondary)] text-sm">
            {$_("dashboard.noNews")}
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
