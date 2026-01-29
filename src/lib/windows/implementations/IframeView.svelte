<script lang="ts">
    import type { WindowBase } from "../WindowBase.svelte";

    interface Props {
        window: WindowBase & { url: string };
    }

    let { window: win }: Props = $props();
</script>

<div class="iframe-view-container">
    <iframe src={win.url} title={win.title}></iframe>
</div>

<style>
    .iframe-view-container {
        width: 100%;
        height: 100%;
        background: white;
    }
    iframe {
        width: 100%;
        height: 100%;
        border: none;
    }
</style>
