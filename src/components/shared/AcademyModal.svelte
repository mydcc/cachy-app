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
   import ModalFrame from "./ModalFrame.svelte";
   import { uiState } from "../../stores/ui.svelte";
   import { _ } from "../../locales/i18n";
   import CandlestickPatternsView from "./CandlestickPatternsView.svelte";
   import ChartPatternsView from "./ChartPatternsView.svelte";

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
</script>

{#if uiState.showAcademyModal}
   <ModalFrame
      isOpen={true}
      title="Trading Academy"
      onclose={() => uiState.toggleAcademyModal(false)}
      extraClasses="modal-size-instructions flex flex-col"
      bodyClass="flex flex-col h-[80vh] overflow-hidden"
   >
      <!-- Tab Header -->
      <div
         class="flex border-b border-[var(--border-color)] mb-4 shrink-0 bg-[var(--bg-secondary)] rounded-t-lg"
      >
         <button
            class="flex-1 py-3 text-center text-xs font-black uppercase tracking-widest border-b-2 transition-all {activeTab ===
            'chartPatterns'
               ? 'border-[var(--accent-color)] text-[var(--accent-color)] bg-[var(--bg-tertiary)] opacity-100'
               : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--accent-color)] opacity-60 hover:opacity-100'}"
            onclick={() => setTab("chartPatterns")}
         >
            {$_("chartPatterns.title") || "Chart Patterns"}
         </button>
         <button
            class="flex-1 py-3 text-center text-xs font-black uppercase tracking-widest border-b-2 transition-all {activeTab ===
            'candlestickPatterns'
               ? 'border-[var(--accent-color)] text-[var(--accent-color)] bg-[var(--bg-tertiary)] opacity-100'
               : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--accent-color)] opacity-60 hover:opacity-100'}"
            onclick={() => setTab("candlestickPatterns")}
         >
            {$_("candlestickPatterns.title") || "Candlestick Patterns"}
         </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-hidden">
         {#if activeTab === "chartPatterns"}
            <ChartPatternsView />
         {:else}
            <CandlestickPatternsView />
         {/if}
      </div>
   </ModalFrame>
{/if}
