<script lang="ts">
    import { _ } from '../../locales/i18n';

    export let tags: string[] = [];
    export let onTagsChange: (newTags: string[]) => void;

    let tagInput = '';

    function addTag() {
        const cleaned = tagInput.trim();
        if (cleaned) {
            if (!tags.includes(cleaned)) {
                onTagsChange([...tags, cleaned]);
            }
            tagInput = '';
        }
    }

    function handleTagKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag();
        }
    }

    function removeTag(tagToRemove: string) {
        onTagsChange(tags.filter(t => t !== tagToRemove));
    }
</script>

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

<div class="tag-container input-field rounded-md flex flex-wrap items-center gap-1.5 w-full min-w-[150px]">
    {#each tags || [] as tag}
        <span class="bg-[var(--bg-secondary)] text-[var(--text-primary)] text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 border border-[var(--border-color)] whitespace-nowrap">
            #{tag}
            <button class="hover:text-[var(--danger-color)] cursor-pointer leading-none" on:click|stopPropagation={() => removeTag(tag)}>×</button>
        </span>
    {/each}
    <input
        type="text"
        class="bg-transparent outline-none flex-grow min-w-[50px] text-xs journal-tag-input"
        placeholder={(!tags || tags.length === 0) ? '+' : ''}
        bind:value={tagInput}
        on:keydown={handleTagKeydown}
        on:blur={addTag}
        on:click|stopPropagation
    />
</div>
