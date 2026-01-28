<script lang="ts">
  import { settingsState } from "../../stores/settings.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { quizState } from "../../stores/quiz.svelte";
  import { _ } from "../../locales/i18n";
  import { icons } from "../../lib/constants";
  import Tooltip from "./Tooltip.svelte";
  import { trackClick } from "../../lib/actions";

  // Additional Icons not in constants (or defined locally for specificity)
  const ICONS = {
    dashboard: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`,
    overview: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zM2.5 2a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zm6.5.5A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zM1 10.5A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zm6.5.5A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3z"/></svg>`,
    sentiment: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`, // Activity/Lightning bolt for sentiment/energy
    academy: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 14l9-5-9-5-9 5 9 5z" /><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" /></svg>`,
    chartPatterns: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 3v18h18" /></svg>`
  };
</script>

<aside
  class="fixed left-0 z-50 flex flex-col gap-2 p-2 bg-[var(--bg-secondary)] rounded-r-2xl border-y border-r border-[var(--border-color)] shadow-xl transition-all duration-300"
  style="top: 38vh;"
>
  <!-- Dashboard Button -->
  <button
    class="control-btn"
    onclick={() => uiState.toggleMarketDashboardModal(true)}
    title={$_("marketDashboard.buttonTitle") || "Market Overview"}
    use:trackClick={{
        category: "Navigation",
        action: "Click",
        name: "OpenMarketDashboard",
    }}
  >
    {@html ICONS.dashboard}
  </button>

  <!-- Settings Button -->
  <button
    class="control-btn"
    onclick={() => uiState.toggleSettingsModal(true)}
    title={$_("settings.title") || "Settings"}
    use:trackClick={{
        category: "Navigation",
        action: "Click",
        name: "OpenSettings",
    }}
  >
    {@html icons.settings}
  </button>

  <!-- Academy Button -->
  <div class="relative w-full flex justify-center">
    <button
      class="control-btn"
      onclick={() => uiState.toggleAcademyModal(true)}
      title={$_("academy.title") || "Trading Academy"}
      use:trackClick={{
        category: "Navigation",
        action: "Click",
        name: "OpenAcademy",
      }}
    >
      {@html ICONS.academy}
    </button>
    <!-- Quiz Progress Bar -->
    {#if quizState.questions.length > 0}
      <div
        class="absolute left-[2px] bottom-1 w-[2px] bg-[var(--success-color)] rounded-full transition-all duration-500"
        style:height="{(quizState.knownQuestionIds.size /
          quizState.questions.length) *
          28}px"
      ></div>
    {/if}
  </div>

  <div class="h-px w-full bg-[var(--border-color)] my-1"></div>

  <!-- Technicals Toggle -->
  <button
    class="control-btn"
    class:active={settingsState.showTechnicals}
    onclick={() => (settingsState.showTechnicals = !settingsState.showTechnicals)}
    title={$_("settings.showTechnicals") || "Toggle Technicals"}
  >
    {@html icons.chart}
  </button>

  <!-- Market Overview Toggle -->
  <button
    class="control-btn"
    class:active={settingsState.showMarketOverview}
    onclick={() => (settingsState.showMarketOverview = !settingsState.showMarketOverview)}
    title="Toggle Market Tiles"
  >
    {@html ICONS.overview}
  </button>

  <!-- Sentiment Toggle -->
  <button
    class="control-btn"
    class:active={settingsState.showMarketSentiment}
    onclick={() => (settingsState.showMarketSentiment = !settingsState.showMarketSentiment)}
    title="Toggle Market Sentiment"
  >
    {@html ICONS.sentiment}
  </button>
</aside>

<style>
  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 0.5rem;
    color: var(--text-secondary);
    transition: all 0.2s ease;
  }

  .control-btn:hover {
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
    transform: scale(1.05);
  }

  .control-btn.active {
    background-color: var(--bg-tertiary);
    color: var(--accent-color);
  }

  .control-btn :global(svg) {
    width: 20px;
    height: 20px;
  }
</style>
