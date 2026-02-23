<script lang="ts">
    import Toggle from "../../shared/Toggle.svelte";

    let { title, enabled = $bindable(), children } = $props();
</script>

<div class="indicator-card">
    <div class="card-header">
        <span class="title">{title}</span>
        <Toggle bind:checked={enabled} />
    </div>
    {#if enabled}
        <div class="card-body">
            {@render children()}
        </div>
    {/if}
</div>

<style>
    .indicator-card {
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        overflow: hidden;
    }
    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background-color: var(--bg-tertiary);
        border-bottom: 1px solid var(--border-color);
    }
    .title {
        font-weight: 700;
        font-size: 0.75rem;
        text-transform: uppercase;
        color: var(--text-primary);
    }
    .card-body {
        padding: 1rem;
    }
</style>
