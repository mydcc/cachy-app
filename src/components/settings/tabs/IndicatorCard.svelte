<script lang="ts">
    import Toggle from "../../shared/Toggle.svelte";

    let { title, enabled = $bindable(), children } = $props();
</script>

<div class="indicator-card">
    <div class="card-header">
        <span class="title">{title}</span>
        <Toggle bind:checked={enabled} />
    </div>
    <!-- ALWAYS show body now, as requested -->
    <div class="card-body" class:disabled={!enabled}>
        {@render children()}
    </div>
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
        transition: opacity 0.3s;
    }
    .card-body.disabled {
        opacity: 0.5; /* Visual cue that it is disabled */
        pointer-events: none; /* Prevent interaction if desired, or remove to allow editing while disabled */
    }
</style>
