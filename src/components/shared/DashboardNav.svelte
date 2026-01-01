<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { icons } from '../../lib/constants';

    export let activePreset: string;

    const dispatch = createEventDispatcher();

    const presets = [
        { id: 'performance', label: 'Performance', icon: icons.chart },
        { id: 'quality', label: 'Qualität', icon: icons.check },
        { id: 'direction', label: 'Richtung', icon: icons.exchange },
        { id: 'discipline', label: 'Disziplin', icon: icons.lockClosed },
        { id: 'costs', label: 'Kosten', icon: icons.settings }
    ];
</script>

<div class="flex flex-wrap gap-2 mb-4 border-b border-[var(--border-color)] pb-2">
    {#each presets as preset}
        <button
            class="flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors
            {activePreset === preset.id
                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-b-2 border-[var(--accent-color)] font-bold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'}"
            on:click={() => dispatch('select', preset.id)}
        >
            {@html preset.icon}
            <span>{preset.label}</span>
        </button>
    {/each}
</div>
