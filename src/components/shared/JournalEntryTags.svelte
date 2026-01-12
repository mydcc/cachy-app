<script lang="ts">
    import { _ } from '../../locales/i18n';
    import { clickOutside } from '../../lib/actions/clickOutside';

    export let tags: string[] = [];
    export let availableTags: string[] = [];
    export let onTagsChange: (newTags: string[]) => void;

    let tagInput = '';
    let showSuggestions = false;

    // Ensure tags is always an array for local usage
    $: safeTags = Array.isArray(tags) ? tags : [];

    // Filter available tags: exclude already added tags and match input
    $: filteredTags = availableTags
        .filter(t => !safeTags.includes(t))
        .filter(t => t.toLowerCase().includes(tagInput.toLowerCase()));

    function addTag(tagToAdd: string = tagInput) {
        const cleaned = tagToAdd.trim();
        if (cleaned) {
            if (!safeTags.includes(cleaned)) {
                onTagsChange([...safeTags, cleaned]);
            }
            tagInput = '';
            showSuggestions = false;
        }
    }

    function handleTagKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag();
        } else if (e.key === 'Escape') {
            showSuggestions = false;
        }
    }

    function removeTag(tagToRemove: string) {
        onTagsChange(safeTags.filter(t => t !== tagToRemove));
    }

    function selectSuggestion(tag: string) {
        addTag(tag);
        // Keep focus on input? Or just let it be.
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

<div class="tag-container input-field rounded-md flex flex-wrap items-center gap-1.5 w-full min-w-[150px] relative">
    {#each safeTags as tag}
        <span class="bg-[var(--bg-secondary)] text-[var(--text-primary)] text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 border border-[var(--border-color)] whitespace-nowrap">
            #{tag}
            <button class="hover:text-[var(--danger-color)] cursor-pointer leading-none" on:click|stopPropagation={() => removeTag(tag)}>×</button>
        </span>
    {/each}
    <input
        type="text"
        class="bg-transparent outline-none flex-grow min-w-[50px] text-xs journal-tag-input"
        placeholder={safeTags.length === 0 ? '+' : ''}
        bind:value={tagInput}
        on:keydown={handleTagKeydown}
        on:focus={() => showSuggestions = true}
        on:click|stopPropagation
    />

    {#if showSuggestions && filteredTags.length > 0 && tagInput.length > 0}
        <div
            class="absolute top-full left-0 mt-1 w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md shadow-lg z-50 max-h-40 overflow-y-auto"
            use:clickOutside={{ enabled: showSuggestions, callback: () => showSuggestions = false }}
        >
            {#each filteredTags as suggestion}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <button
                    type="button"
                    class="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--bg-tertiary)] cursor-pointer text-[var(--text-primary)] bg-transparent border-0"
                    on:click|stopPropagation={() => selectSuggestion(suggestion)}
                >
                    #{suggestion}
                </button>
            {/each}
        </div>
    {/if}
</div>
