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
  import { settingsState } from "../../stores/settings.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { quizState } from "../../stores/quiz.svelte";
  import { windowManager } from "../../lib/windows/WindowManager.svelte";
  import { _ } from "../../locales/i18n";
  import Tooltip from "./Tooltip.svelte";
  import { trackClick, type TrackClickParams } from "../../actions/tracking";
  import {
    getSurfaceEntries,
  } from "../../lib/navigation/entry-points";
  import type {
    Entry,
    EntryContext,
    SurfaceEntry,
    WindowState,
  } from "../../lib/navigation/entry-points";
  import { resolveEntryIcon } from "../../lib/navigation/icons";
  import { openEntry } from "../../lib/navigation/open-entry";

  let viewportWidth = $state(
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );

  function windowState(type: string): WindowState {
    const win = windowManager.windows.find((entry) => entry.windowType === type);
    if (!win) return "closed";
    return win.isMinimized ? "minimized" : "open";
  }

  // Surface adapter: the registry stays pure; this is the only place that
  // reads the stores for the rail's conditions.
  let context = $derived.by((): EntryContext => {
    const activeAccount = settingsState.accounts.find(
      (account) => account.id === settingsState.activeAccountId,
    );
    return {
      settings: {
        showTechnicals: settingsState.showTechnicals,
        showSidebars: settingsState.showSidebars,
        showMarketOverview: settingsState.showMarketOverview,
        showSidebarActivity: settingsState.showSidebarActivity,
        showMarketSentiment: settingsState.showMarketSentiment,
      },
      entitlement: { pro: settingsState.entitlement.isPro },
      accounts: {
        activeId: settingsState.activeAccountId,
        activeExchange: activeAccount?.exchange ?? null,
        count: settingsState.accounts.length,
      },
      windows: {
        journal: windowState("journal"),
        settings: windowState("settings"),
        academy: windowState("academy"),
      },
      viewportWidth,
      ui: { showAssistant: uiState.showAssistant },
      derived: {
        // Available as a settings getter. `isTechnicalsVisible` is page-local
        // state in `+page.svelte`; the rail cannot see it, which is part of
        // why it deliberately ignores `enabled` (BUG-0715).
        effectiveShowSidebarActivity:
          settingsState.effectiveShowSidebarActivity,
      },
      data: {},
    };
  });

  let railEntries = $derived(getSurfaceEntries("rail", context));
  let destinationEntries = $derived(
    railEntries.filter((item) => item.placement.group === "destinations"),
  );
  let panelEntries = $derived(
    railEntries.filter((item) => item.placement.group === "panels"),
  );

  function label(entry: Entry): string {
    return $_(entry.labels.title ?? entry.labels.label);
  }

  function track(entry: Entry): TrackClickParams | undefined {
    return entry.telemetryName
      ? {
          category: "Navigation",
          action: "Click",
          name: entry.telemetryName,
        }
      : undefined;
  }
</script>

<svelte:window onresize={() => (viewportWidth = window.innerWidth)} />

<aside
  class="fixed left-0 z-50 flex flex-col gap-2 p-2 bg-[var(--bg-secondary)] rounded-r-2xl border-y border-r border-[var(--border-color)] shadow-xl transition-all duration-300"
  style="top: 38vh;"
>
  {#snippet railControl(item: SurfaceEntry)}
    {@const count = item.entry.countProvider?.() ?? 0}
    <button
      class="control-btn"
      class:active={item.active}
      onclick={() => openEntry(item.entry)}
      title={label(item.entry)}
      aria-label={count > 0 && item.entry.countLabel
        ? $_(item.entry.countLabel, {
            values: { label: label(item.entry), count },
          })
        : label(item.entry)}
      use:trackClick={track(item.entry)}
    >
      {@html resolveEntryIcon(item.entry.icon)}
      {#if count > 0}
        <!-- Text, not colour alone: the number is the state. -->
        <span class="rail-badge bg-danger-paired" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      {/if}
    </button>
  {/snippet}

  {#each destinationEntries as item (item.entry.id)}
    {#if item.entry.id === "academy"}
      <div class="relative w-full flex justify-center">
        {@render railControl(item)}
        {#if quizState.questions.length > 0}
          {@const progress = Math.min(
            100,
            (quizState.knownQuestionIds.size / 52) * 100,
          )}
          <div class="absolute -left-[0.25rem] top-1/2 -translate-y-1/2 z-10">
            <Tooltip text="{quizState.knownQuestionIds.size}/52">
              <div
                class="flex flex-col h-[28px] w-[3px] rounded-full overflow-hidden shadow-sm"
              >
                <div
                  class="bg-[var(--danger-color)] w-full transition-all duration-500"
                  style:height="{100 - progress}%"
                ></div>
                <div
                  class="bg-[var(--success-color)] w-full transition-all duration-500"
                  style:height="{progress}%"
                ></div>
              </div>
            </Tooltip>
          </div>
        {/if}
      </div>
    {:else}
      {@render railControl(item)}
    {/if}
  {/each}

  {#if panelEntries.length > 0}
    <div class="h-px w-full bg-[var(--border-color)] my-1"></div>
  {/if}

  {#each panelEntries as item (item.entry.id)}
    {@render railControl(item)}
  {/each}
</aside>

<style>
  .control-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
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

  .rail-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    padding: 0 3px;
    border-radius: 999px;
    font-size: 9px;
    line-height: 16px;
    text-align: center;
    font-weight: 600;
  }

  .control-btn :global(svg) {
    width: 20px;
    height: 20px;
  }
</style>
