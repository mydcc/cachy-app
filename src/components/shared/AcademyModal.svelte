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
               : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] opacity-60 hover:opacity-100'}"
            onclick={() => setTab("chartPatterns")}
         >
            {$_("chartPatterns.title") || "Chart Patterns"}
         </button>
         <button
            class="flex-1 py-3 text-center text-xs font-black uppercase tracking-widest border-b-2 transition-all {activeTab ===
            'candlestickPatterns'
               ? 'border-[var(--accent-color)] text-[var(--accent-color)] bg-[var(--bg-tertiary)] opacity-100'
               : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] opacity-60 hover:opacity-100'}"
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
