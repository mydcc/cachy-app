<script lang="ts">
    import type { WindowBase } from "../WindowBase.svelte";

    interface Props {
        window: WindowBase & { url: string };
    }

    let { window: win }: Props = $props();
</script>

<div class="iframe-view-container">
    <iframe
        src={win.url}
        title={win.title}
        allow="xr-spatial-tracking; camera; microphone; fullscreen; display-capture"
    ></iframe>
</div>

<style>
    .iframe-view-container {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background: black; /* Better base for Unity loading */
        overflow: hidden;
    }
    iframe {
        width: 100%;
        height: 100%;
        border: none;
        display: block;
    }
</style>
