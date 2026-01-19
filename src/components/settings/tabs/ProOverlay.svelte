<script lang="ts">
    import { settingsState } from "../../../stores/settings.svelte";
</script>

{#if !settingsState.isPro}
    <div
        class="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] rounded z-10 pointer-events-none"
    ></div>
{/if}
