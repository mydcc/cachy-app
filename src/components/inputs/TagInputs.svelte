<script lang="ts">
  import { updateTradeStore } from "../../stores/tradeStore";
  import { _ } from "../../locales/i18n";

  export let tags: string[] = [];

  let tagInput = "";

  function addTag() {
    const cleaned = tagInput.trim();
    if (cleaned) {
      if (!tags.includes(cleaned)) {
        // We update the store via the parent binding or store update
        updateTradeStore((s) => ({ ...s, tags: [...s.tags, cleaned] }));
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
    updateTradeStore((s) => ({
      ...s,
      tags: s.tags.filter((t) => t !== tagToRemove),
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
          on:click={() => removeTag(tag)}
          aria-label="Remove tag {tag}">×</button
        >
      </span>
    {/each}
    <input
      id="tag-input"
      name="tagInput"
      type="text"
      class="bg-transparent outline-none flex-grow min-w-[60px] text-sm"
      placeholder={tags.length === 0
        ? $_("dashboard.tradeSetupInputs.tagsPlaceholder")
        : ""}
      bind:value={tagInput}
      on:keydown={handleTagKeydown}
      on:blur={addTag}
    />
  </div>
</div>

<style>
  .input-field:focus {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border-color: var(--accent-color);
    z-index: 10;
  }
</style>
