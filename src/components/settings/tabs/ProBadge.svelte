<script lang="ts">
    import { settingsState } from "../../../stores/settings.svelte";
</script>

{#if !settingsState.isPro}
    <span
        class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
    >
        PRO
    </span>
{/if}
