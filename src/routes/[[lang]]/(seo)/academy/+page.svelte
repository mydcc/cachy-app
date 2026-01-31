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
   import { onMount } from "svelte";
   import { page } from '$app/stores';
   import { _ } from "../../../../locales/i18n";
   import CandlestickPatternsView from "../../../../components/shared/CandlestickPatternsView.svelte";
   import ChartPatternsView from "../../../../components/shared/ChartPatternsView.svelte";
   import de from '../../../../locales/locales/de.json';
   import en from '../../../../locales/locales/en.json';

   let activeTab = $state("chartPatterns");

   onMount(() => {
      const stored = localStorage.getItem("academy_active_tab");
      if (stored === "chartPatterns" || stored === "candlestickPatterns") {
         activeTab = stored;
      }
   });

   function setTab(tab: string) {
      activeTab = tab;
      localStorage.setItem("academy_active_tab", tab);
   }

   let lang = $derived($page.params.lang || 'en');
   let dict = $derived(lang === 'de' ? de : en);
   let title = $derived(dict.academy?.title || "Trading Academy");
</script>

<svelte:head>
  <title>{title} - Cachy</title>
</svelte:head>

<div class="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[var(--bg-primary)]">
      <!-- Tab Header -->
      <div
         class="flex border-b border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)] p-2 gap-2"
      >
         <button
            class="flex-1 py-3 text-center text-xs font-black uppercase tracking-widest rounded-md transition-all {activeTab ===
            'chartPatterns'
               ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] shadow-sm border border-[var(--border-color)]'
               : 'text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--accent-color)] opacity-70 hover:opacity-100'}"
            onclick={() => setTab("chartPatterns")}
         >
            {$_("chartPatterns.title") || "Chart Patterns"}
         </button>
         <button
            class="flex-1 py-3 text-center text-xs font-black uppercase tracking-widest rounded-md transition-all {activeTab ===
            'candlestickPatterns'
               ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] shadow-sm border border-[var(--border-color)]'
               : 'text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--accent-color)] opacity-70 hover:opacity-100'}"
            onclick={() => setTab("candlestickPatterns")}
         >
            {$_("candlestickPatterns.title") || "Candlestick Patterns"}
         </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-hidden p-4 md:p-6">
         {#if activeTab === "chartPatterns"}
            <ChartPatternsView />
         {:else}
            <CandlestickPatternsView />
         {/if}
      </div>
</div>
