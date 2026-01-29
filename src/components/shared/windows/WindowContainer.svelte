<script lang="ts">
    import { windowManager } from "../../../lib/windows/WindowManager.svelte";
    import WindowFrame from "./WindowFrame.svelte";
</script>

<div class="windows-container">
    {#each windowManager.windows as win (win.id)}
        <WindowFrame window={win} />
    {/each}
</div>

<style>
    .windows-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        z-index: 11000;
        pointer-events: none;
    }
</style>
