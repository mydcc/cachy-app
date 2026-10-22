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
  One tab bar for the settings window (FEAT-0607).

  The window had two navigation languages: a left rail in `SettingsContent`
  and a row of pills in `VisualsTab`. Both are navigation; neither looked like
  the other, and a reader could not tell whether the difference meant
  anything. This component carries both as two variants of one contract, so a
  new tab bar picks a variant instead of inventing a third look.

  The DOM keeps the ARIA tab pattern the rail already had (`tablist` /
  `tab` / `aria-selected`). Keyboard navigation and roving focus are
  deliberately not added here — FEAT-0605's N8 measures the current state
  first, and a missing behaviour becomes its own BUG rather than a silent
  side effect of a styling item.

  The sub-tab decision (FEAT-0607 AC8): keep sub-tabs, as this same component
  with `variant="pills"`. `VisualsTab` is the only user today; the reason to
  share the component is that the sub-tab row and the main rail are the same
  interaction, not that a second caller already exists.
-->

<script lang="ts">
  export interface TabEntry {
    id: string;
    label: string;
    /** Inline SVG path markup. Rail only; pills render labels alone. */
    icon?: string;
  }

  interface Props {
    tabs: TabEntry[];
    active: string;
    onSelect: (id: string) => void;
    /** `rail` is the window's left navigation; `pills` is a compact sub-tab row. */
    variant?: "rail" | "pills";
    ariaLabel: string;
  }

  let { tabs, active, onSelect, variant = "rail", ariaLabel }: Props = $props();

  function select(id: string, event: MouseEvent) {
    onSelect(id);
    // The bar scrolls horizontally on narrow windows — keep the chosen tab in
    // view when the click came from a partially hidden button.
    (event.currentTarget as HTMLElement | null)?.scrollIntoView({
      inline: "center",
      block: "nearest",
    });
  }

  const rail =
    "flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible md:overflow-y-auto w-full md:w-52 border-b md:border-b-0 md:border-r border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)] py-0 md:py-2 custom-scrollbar";
  const pills =
    "flex gap-2 overflow-x-auto border-b border-[var(--border-color)] pb-2 shrink-0 custom-scrollbar";
</script>

<div class={variant === "rail" ? rail : pills} role="tablist" aria-label={ariaLabel}>
  {#each tabs as tab (tab.id)}
    {@const isActive = active === tab.id}
    <!-- FEAT-0611 escape: navigation tab carrying role="tab" and aria-selected; this is the tab-bar component itself (FEAT-0607), not an action button -->
    <button
      class="tab-btn {variant === 'rail'
        ? 'flex items-center gap-2 md:gap-3 px-4 md:px-4 py-3 text-sm font-semibold transition-all text-left focus:outline-none whitespace-nowrap group ' +
          (isActive
            ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)] shadow-inner'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/50 border-b-2 md:border-b-0 md:border-l-2 border-transparent')
        : 'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ' +
          (isActive
            ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]')}"
      onclick={(event) => select(tab.id, event)}
      role="tab"
      aria-selected={isActive}
    >
      {#if variant === "rail" && tab.icon}
        <span
          class="tab-icon transition-transform group-hover:scale-110"
          class:text-[var(--accent-color)]={isActive}
          class:text-[var(--text-secondary)]={!isActive}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            {@html tab.icon}
          </svg>
        </span>
      {/if}
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 10px;
  }
</style>
