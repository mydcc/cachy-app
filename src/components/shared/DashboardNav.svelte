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
  import DOMPurify from "dompurify";

  interface Props {
    activePreset: string;
    /** The strip's destinations. The owning surface reads them from the
     *  entry-point registry; this primitive does not own a default list. */
    presets: { id: string; label: string; icon?: string }[];
    onselect?: (id: string) => void;
  }

  let { activePreset, presets, onselect }: Props = $props();
</script>

<div
  class="flex flex-wrap gap-2 mb-4 border-b border-[var(--border-color)] pb-2 overflow-x-auto"
>
  {#each presets as preset}
    <!-- FEAT-0613 escape: journal deep-dive tab strip; the shared tab bar is
         FEAT-0607's, so this strip stays journal-local until that lands -->
    <button
      class="flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap
            {activePreset === preset.id
        ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-b-2 border-[var(--accent-color)] font-bold'
        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'}"
      onclick={() => onselect?.(preset.id)}
    >
      {#if preset.icon}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html DOMPurify.sanitize(preset.icon)}
      {/if}
      <span>{preset.label}</span>
    </button>
  {/each}
</div>
