<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { _ } from "../../../../locales/i18n";
  import { markdownLoader } from "../../../../services/markdownLoader";
  import * as en from "../../../../locales/locales/en.json";
  import * as de from "../../../../locales/locales/de.json";
  import SvelteMarkdown from 'svelte-markdown';
  import math from 'remark-math';
  import katex from 'rehype-katex';
  import 'katex/dist/katex.min.css';
  import { fade } from "svelte/transition";
  import type { TranslationKey } from "../../../../locales/i18n";

  let lang = $derived($page.params.lang || 'en');
  // Explicitly type the dict to allow dynamic access to 'academy'
  let dict = $derived(lang === 'de' ? (de as any) : (en as any));
  let title = $derived(dict.academy?.title || "Trading Academy");

  let modules = $state<any[]>([]);
  let selectedModule = $state<any>(null);
  let content = $state("");
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Hardcoded index for MVP - later load from JSON/CMS
  const index = [
    { id: "candlestick-patterns", titleKey: "candlestickPatterns.title", icon: "📊" },
    { id: "risk-management", titleKey: "risk.title", icon: "🛡️" }, // Placeholder keys
    { id: "market-structure", titleKey: "technicals.advancedTitle", icon: "🏗️" }
  ];

  async function loadModule(moduleId: string) {
    loading = true;
    selectedModule = index.find(m => m.id === moduleId);
    error = null;

    try {
      // Load markdown content
      // Note: Markdown files should be in static/content/academy/{lang}/{id}.md
      const path = `/instructions/academy/${lang}/${moduleId}.md`;
      const text = await markdownLoader.load(path);
      content = text;
    } catch (e) {
      console.error(e);
      error = "Failed to load content.";
      content = "";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    // Default load first module or welcome
    loadModule("candlestick-patterns");
  });
</script>

<div class="h-full flex flex-col md:flex-row overflow-hidden bg-[var(--bg-secondary)]">
  <!-- Sidebar -->
  <div class="w-full md:w-64 bg-[var(--bg-primary)] border-r border-[var(--border-color)] flex-shrink-0 flex flex-col">
    <div class="p-4 border-b border-[var(--border-color)]">
      <h2 class="font-bold text-lg text-[var(--text-primary)]">{title}</h2>
    </div>

    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      {#each index as mod}
        <button
          class="w-full text-left px-3 py-2 rounded hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2"
          class:bg-[var(--bg-tertiary)]={selectedModule?.id === mod.id}
          onclick={() => loadModule(mod.id)}
        >
          <span>{mod.icon}</span>
          <span class="text-sm font-medium text-[var(--text-primary)]">
            {$_(`academy.${mod.id}` as any) || $_(mod.titleKey as any) || mod.id}
          </span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Content Area -->
  <div class="flex-1 overflow-y-auto relative bg-[var(--bg-primary)]">
    {#if loading}
      <div class="absolute inset-0 flex items-center justify-center bg-[var(--bg-primary)] z-10" transition:fade>
        <div class="animate-spin h-8 w-8 border-2 border-[var(--accent-color)] border-t-transparent rounded-full"></div>
      </div>
    {/if}

    <div class="max-w-4xl mx-auto p-6 md:p-10">
      {#if error}
        <div class="p-4 bg-[var(--danger-color)]/10 border border-[var(--danger-color)]/20 rounded text-[var(--danger-color)]">
          {error}
        </div>
      {:else if content}
        <article class="prose prose-invert max-w-none prose-headings:text-[var(--text-primary)] prose-p:text-[var(--text-secondary)] prose-strong:text-[var(--text-primary)] prose-a:text-[var(--accent-color)]">
          <SvelteMarkdown {source} {content} options={{ remarkPlugins: [math], rehypePlugins: [katex] }} />
        </article>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Custom scrollbar for module list */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
</style>
