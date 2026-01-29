<script lang="ts">
    import { windowManager } from "../../../lib/windows/WindowManager.svelte";
    import WindowFrame from "./WindowFrame.svelte";
</script>

<div class="windows-container">
    {#each windowManager.windows as win (win.id)}
        <div class="window-wrapper" onclick={(e) => e.stopPropagation()}>
            <WindowFrame window={win} />
        </div>
    {/each}
</div>

<style>
    .windows-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 11000;
        pointer-events: none; /* Let clicks pass through to the app */
    }
    .window-wrapper {
        position: absolute;
        pointer-events: auto; /* Interaction with windows only */
    }
</style>
