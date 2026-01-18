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
  import { _ } from "../../locales/i18n";
  import { clickOutside } from "../../lib/actions/clickOutside";

  interface Props {
    tags?: string[];
    availableTags?: string[];
    tradeId: number;
    onTagsChange: (newTags: string[]) => void;
  }

  let {
    tags = [],
    availableTags = [],
    tradeId,
    onTagsChange,
  }: Props = $props();

  let tagInput = $state("");
  let showSuggestions = $state(false);

  // Ensure tags is always an array for local usage
  let safeTags = $derived(Array.isArray(tags) ? tags : []);

  // Filter available tags: exclude already added tags and match input
  let filteredTags = $derived(
    availableTags
      .filter((t) => !safeTags.includes(t))
      .filter((t) => t.toLowerCase().includes(tagInput.toLowerCase())),
  );

  function addTag(tagToAdd: string = tagInput) {
    const cleaned = tagToAdd.trim();
    if (cleaned) {
      if (!safeTags.includes(cleaned)) {
        onTagsChange([...safeTags, cleaned]);
      }
      tagInput = "";
      showSuggestions = false;
    }
  }

  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Escape") {
      showSuggestions = false;
    }
  }

  function removeTag(tagToRemove: string) {
    onTagsChange(safeTags.filter((t) => t !== tagToRemove));
  }

  function selectSuggestion(tag: string) {
    addTag(tag);
  }
</script>

<div
  class="tag-container input-field rounded-md flex flex-wrap items-center gap-1.5 w-full min-w-[150px] relative"
>
  {#each safeTags as tag}
    <span
      class="bg-[var(--bg-secondary)] text-[var(--text-primary)] text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 border border-[var(--border-color)] whitespace-nowrap"
    >
      #{tag}
      <button
        class="hover:text-[var(--danger-color)] cursor-pointer leading-none"
        onclick={(e) => {
          e.stopPropagation();
          removeTag(tag);
        }}>×</button
      >
    </span>
  {/each}
  <input
    id="journal-entry-tag-input-{tradeId}"
    name="journalEntryTagInput"
    type="text"
    class="bg-transparent outline-none flex-grow min-w-[50px] text-xs journal-tag-input"
    placeholder={safeTags.length === 0 ? "+" : ""}
    bind:value={tagInput}
    onkeydown={handleTagKeydown}
    onfocus={() => (showSuggestions = true)}
    onclick={(e) => e.stopPropagation()}
  />

  {#if showSuggestions && filteredTags.length > 0 && tagInput.length > 0}
    <div
      class="absolute top-full left-0 mt-1 w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md shadow-lg z-50 max-h-40 overflow-y-auto"
      use:clickOutside={{
        enabled: showSuggestions,
        callback: () => (showSuggestions = false),
      }}
    >
      {#each filteredTags as suggestion}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <button
          type="button"
          class="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--bg-tertiary)] cursor-pointer text-[var(--text-primary)] bg-transparent border-0"
          onclick={(e) => {
            e.stopPropagation();
            selectSuggestion(suggestion);
          }}
        >
          #{suggestion}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .journal-tag-input:focus {
    border-color: var(--accent-color);
  }

  /* Inherit input styles but override for compact table view */
  .tag-container {
    min-height: 32px;
    padding: 0.25rem 0.5rem;
  }
</style>
