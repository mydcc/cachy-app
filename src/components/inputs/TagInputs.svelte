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
  import { tradeState } from "../../stores/trade.svelte";
  import { journalState } from "../../stores/journal.svelte";
  import { _ } from "../../locales/i18n";

  interface Props {
    tags?: string[];
  }

  let { tags = [] }: Props = $props();

  let tagInput = $state("");

  const DEFAULT_TAG_SUGGESTIONS = ["breakout", "trend", "reversal", "scalp", "support"];

  // Compute top 5 most frequently used tags from journal history
  const topFrequentTags = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const entry of journalState.entries) {
      if (Array.isArray(entry.tags)) {
        for (const t of entry.tags) {
          const clean = t?.trim();
          if (clean) {
            counts[clean] = (counts[clean] || 0) + 1;
          }
        }
      }
    }

    // Sort by frequency descending
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    // If fewer than 5 user tags exist, offer sensible trading defaults
    const pool = Array.from(new Set([...sorted, ...DEFAULT_TAG_SUGGESTIONS]));

    // Exclude tags already attached to the current trade
    return pool.filter((t) => !tags.includes(t)).slice(0, 4);
  });

  function addTag() {
    const cleaned = tagInput.trim();
    if (cleaned) {
      if (!tags.includes(cleaned)) {
        tradeState.update((s) => ({ ...s, tags: [...s.tags, cleaned] }));
      }
      tagInput = "";
    }
  }

  function selectChip(chip: string) {
    if (!tags.includes(chip)) {
      tradeState.update((s) => ({ ...s, tags: [...s.tags, chip] }));
    }
  }

  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  }

  function removeTag(tagToRemove: string) {
    tradeState.update((s) => ({
      ...s,
      tags: s.tags.filter((t: string) => t !== tagToRemove),
    }));
  }
</script>

<!-- Tags Input -->
<div class="mb-2 relative">
  <label for="tag-input" class="sr-only"
    >{$_("dashboard.tradeSetupInputs.tagsLabel")}</label
  >
  <div
    class="input-field w-full px-2.5 py-1.5 rounded-md flex flex-nowrap items-center gap-1.5 min-h-[38px] overflow-x-auto"
  >
    {#each tags as tag}
      <span
        class="bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-1 border border-[var(--border-color)] flex-shrink-0"
      >
        #{tag}
        <button
          class="hover:text-[var(--danger-color)] text-xs opacity-70 hover:opacity-100 transition-opacity ml-0.5"
          onclick={() => removeTag(tag)}
          aria-label={`${$_("common.aria.removeTag")} ${tag}`}>×</button
        >
      </span>
    {/each}
    <input
      id="tag-input"
      name="tagInput"
      type="text"
      class="bg-transparent outline-none flex-grow min-w-[70px] text-sm text-[var(--text-primary)]"
      placeholder={tags.length === 0
        ? $_("dashboard.tradeSetupInputs.tagsPlaceholder")
        : ""}
      bind:value={tagInput}
      onkeydown={handleTagKeydown}
      onblur={addTag}
    />
  </div>

  <!-- Suggested / Most frequent tag chips -->
  {#if topFrequentTags.length > 0}
    <div class="flex flex-wrap items-center gap-1 mt-1.5">
      {#each topFrequentTags as chip}
        <button
          type="button"
          class="tag-chip text-[11px] leading-tight px-2 py-0.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--accent-color)] hover:border-[var(--accent-color)] hover:bg-[var(--bg-secondary)] transition-all cursor-pointer flex items-center gap-0.5"
          onclick={() => selectChip(chip)}
        >
          <span class="opacity-40 text-[9px]">+</span>#{chip}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .input-field:focus {
    box-shadow: var(--shadow-card);
    border-color: var(--accent-color);
    z-index: 10;
  }
</style>
