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
  import { _ as t } from "../../locales/i18n";

  interface Props {
    tags?: string[];
  }

  let { tags = [] }: Props = $props();

  let tagInput = $state("");

  function addTag() {
    const cleaned = tagInput.trim();
    if (cleaned) {
      if (!tags.includes(cleaned)) {
        // We update the store via the parent binding or store update
        tradeState.update((s) => ({ ...s, tags: [...s.tags, cleaned] }));
      }
      tagInput = "";
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
  <label for="tag-input" class="sr-only">Tags</label>
  <div
    class="input-field w-full px-4 py-2 rounded-md flex flex-wrap items-center gap-2 min-h-[42px]"
  >
    {#each tags as tag}
      <span
        class="bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs font-bold px-2 py-1 rounded flex items-center gap-1 border border-[var(--border-color)]"
      >
        #{tag}
        <button
          class="hover:text-[var(--danger-color)]"
          onclick={() => removeTag(tag)}
          aria-label="Remove tag {tag}">{$t("common.remove")}</button
        >
      </span>
    {/each}
    <input
      id="tag-input"
      name="tagInput"
      type="text"
      class="bg-transparent outline-none flex-grow min-w-[60px] text-sm"
      placeholder={tags.length === 0
        ? $t("dashboard.tradeSetupInputs.tagsPlaceholder")
        : ""}
      bind:value={tagInput}
      onkeydown={handleTagKeydown}
      onblur={addTag}
    />
  </div>
</div>

<style>
  .input-field:focus {
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.3),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border-color: var(--accent-color);
    z-index: 10;
  }
</style>
