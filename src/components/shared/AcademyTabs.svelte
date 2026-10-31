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
  No `aria-controls`: only the active panel is rendered, so an inactive
  tab would reference an ID that is not in the DOM.

  BUG-0762: the bar is a single scrollable line, never wrapped. Labels
  switch at the @4xl container step (short form below); the full label
  remains the accessible name, so the announced name is width-independent.
-->

<script lang="ts">
   import { _ } from "../../locales/i18n";
   import type { TranslationKey } from "../../locales/schema";
   import { ACADEMY_TABS, type AcademyTab } from "../../lib/academy/useAcademyTabs.svelte";

   interface Props {
      activeTab: AcademyTab;
      onTabChange: (tab: AcademyTab) => void;
      idPrefix?: string;
   }

   let { activeTab, onTabChange, idPrefix = "academy" }: Props = $props();

   /* Exhaustive by type, so a tab cannot be added without a label. */
   const TAB_LABELS: Record<AcademyTab, TranslationKey> = {
      chartPatterns: "chartPatterns.title",
      candlestickPatterns: "candlestickPatterns.title",
      indicators: "indicatorLessons.title",
      marketStructure: "academy.structure.title",
   };

   /*
    * BUG-0762: narrow containers get the short form. Each short label is a
    * substring of its full label, so the visible text stays inside the
    * accessible name at every container width (WCAG 2.5.3).
    */
   const TAB_SHORT_LABELS: Record<AcademyTab, TranslationKey> = {
      chartPatterns: "chartPatterns.shortTitle",
      candlestickPatterns: "candlestickPatterns.shortTitle",
      indicators: "indicatorLessons.shortTitle",
      marketStructure: "academy.structure.shortTitle",
   };

   let tablistEl: HTMLDivElement | null = $state(null);

   /*
    * Review follow-up (BUG-0762): the short labels still exceed a 360px
    * window, so a restored tab can sit outside the visible strip while its
    * panel renders. Scroll the selected tab into view on selection change;
    * no listener is registered, so there is nothing to clean up.
    */
   $effect(() => {
      void activeTab;
      const selected = tablistEl?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (selected && typeof selected.scrollIntoView === "function") {
         selected.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
   });

   function tabId(tab: AcademyTab): string {
      return `${idPrefix}-tab-${tab}`;
   }

   function focusTab(index: number) {
      const tabs = tablistEl?.querySelectorAll<HTMLElement>('[role="tab"]');
      const el = tabs?.[index];
      el?.focus();
      const tab = ACADEMY_TABS[index];
      if (tab && tab !== activeTab) {
         onTabChange(tab);
      }
   }

   function handleKeydown(event: KeyboardEvent) {
      const current = ACADEMY_TABS.indexOf(activeTab);
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
         event.preventDefault();
         const delta = event.key === "ArrowRight" ? 1 : -1;
         focusTab((current + delta + ACADEMY_TABS.length) % ACADEMY_TABS.length);
      } else if (event.key === "Home") {
         event.preventDefault();
         focusTab(0);
      } else if (event.key === "End") {
         event.preventDefault();
         focusTab(ACADEMY_TABS.length - 1);
      }
   }
</script>

<div
   role="tablist"
   tabindex={-1}
   aria-label={$_("academy.title")}
   bind:this={tablistEl}
   onkeydown={handleKeydown}
   class="flex border-b border-[var(--border-color)] mb-4 shrink-0 bg-[var(--bg-secondary)] rounded-t-lg p-1 gap-1 overflow-x-auto"
>
   {#each ACADEMY_TABS as tab (tab)}
      {@const selected = activeTab === tab}
      <button
         role="tab"
         id={tabId(tab)}
         aria-selected={selected}
         aria-label={$_(TAB_LABELS[tab])}
         tabindex={selected ? 0 : -1}
         class="grow shrink-0 basis-0 whitespace-nowrap py-2.5 px-2 text-center text-xs font-black uppercase tracking-widest rounded-md transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)] {selected
            ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)] opacity-70 hover:opacity-100'}"
         onclick={() => onTabChange(tab)}
      >
         <span class="@4xl:hidden">{$_(TAB_SHORT_LABELS[tab])}</span>
         <span class="hidden @4xl:inline">{$_(TAB_LABELS[tab])}</span>
      </button>
   {/each}
</div>
