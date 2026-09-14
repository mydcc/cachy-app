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

<!--
  Shared Academy tab bar (window + SEO route). WAI-ARIA tab pattern:
  `tablist` container, `tab` buttons with `aria-selected`, arrow-key
  navigation with focus management. `idPrefix` keeps tab/panel ids unique
  when more than one Academy view is mounted.
-->

<script lang="ts">
   import { _ } from "../../locales/i18n";
   import type { AcademyTab } from "../../lib/academy/useAcademyTabs.svelte";

   interface Props {
      activeTab: AcademyTab;
      onTabChange: (tab: AcademyTab) => void;
      idPrefix?: string;
   }

   let { activeTab, onTabChange, idPrefix = "academy" }: Props = $props();

   const TABS: AcademyTab[] = ["chartPatterns", "candlestickPatterns"];

   let tablistEl: HTMLDivElement | null = $state(null);

   function tabId(tab: AcademyTab): string {
      return `${idPrefix}-tab-${tab}`;
   }

   function panelId(tab: AcademyTab): string {
      return `${idPrefix}-panel-${tab}`;
   }

   function focusTab(index: number) {
      const tabs = tablistEl?.querySelectorAll<HTMLElement>('[role="tab"]');
      const el = tabs?.[index];
      el?.focus();
      const tab = TABS[index];
      if (tab && tab !== activeTab) {
         onTabChange(tab);
      }
   }

   function handleKeydown(event: KeyboardEvent) {
      const current = TABS.indexOf(activeTab);
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
         event.preventDefault();
         const delta = event.key === "ArrowRight" ? 1 : -1;
         focusTab((current + delta + TABS.length) % TABS.length);
      } else if (event.key === "Home") {
         event.preventDefault();
         focusTab(0);
      } else if (event.key === "End") {
         event.preventDefault();
         focusTab(TABS.length - 1);
      }
   }
</script>

<div
   role="tablist"
   tabindex={-1}
   aria-label={$_("academy.title")}
   bind:this={tablistEl}
   onkeydown={handleKeydown}
   class="flex flex-wrap border-b border-[var(--border-color)] mb-4 shrink-0 bg-[var(--bg-secondary)] rounded-t-lg p-1 gap-1"
>
   {#each TABS as tab}
      {@const selected = activeTab === tab}
      <button
         role="tab"
         id={tabId(tab)}
         aria-selected={selected}
         aria-controls={panelId(tab)}
         tabindex={selected ? 0 : -1}
         class="flex-1 min-w-[140px] py-2.5 text-center text-xs font-black uppercase tracking-widest rounded-md transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)] {selected
            ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--accent-color)] opacity-70 hover:opacity-100'}"
         onclick={() => onTabChange(tab)}
      >
         {#if tab === "chartPatterns"}
            {$_("chartPatterns.title") || "Chart Patterns"}
         {:else}
            {$_("candlestickPatterns.title") || "Candlestick Patterns"}
         {/if}
      </button>
   {/each}
</div>
