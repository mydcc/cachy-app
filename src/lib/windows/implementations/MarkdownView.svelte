<script lang="ts">
    interface Props {
        window: { content: string };
    }
    let { window: win }: Props = $props();
</script>

<div class="markdown-view-container p-6 prose dark:prose-invert">
    {@html win.content}
</div>

<style>
    .markdown-view-container {
        width: 100%;
        height: 100%;
        overflow-y: auto;
        background: var(--bg-primary);
        color: var(--text-primary);
    }
</style>
