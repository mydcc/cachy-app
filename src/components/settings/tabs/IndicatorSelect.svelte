<script lang="ts">
    import { settingsState } from "../../../stores/settings.svelte";

    interface Props {
        label: string;
        id: string;
        value: any;
        options: string[];
    }

    let { label, id, value = $bindable(), options }: Props = $props();
</script>

<div class="flex flex-col gap-1 flex-1">
    <label for={id} class="text-xs text-[var(--text-secondary)]">
        {label}
    </label>
    <select
        {id}
        bind:value
        class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)] w-full"
        disabled={!settingsState.isPro}
    >
        {#each options as opt}
            <option value={opt}>{opt.toUpperCase()}</option>
        {/each}
    </select>
</div>
