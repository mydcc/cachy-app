<script lang="ts">
    import { uiState } from "../../stores/ui.svelte";
    import { _ } from "../../locales/i18n";

    function toggle() {
        if (uiState.iframeModal.visible) {
            uiState.toggleIframeModal(false);
        } else {
            uiState.toggleIframeModal(
                true,
                "https://space.cachy.app/index.php?plot_id=genesis",
                "Cachy Space",
            );
        }
    }
</script>

<button
    class="btn-icon-accent"
    class:active={uiState.iframeModal.visible}
    onclick={toggle}
    aria-label="Toggle Video"
    title="Toggle Video Modal"
>
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-5 h-5"
    >
        <polygon points="23 7 16 12 23 17 23 7"></polygon>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
    </svg>
</button>

<style>
    .btn-icon-accent.active {
        color: var(--accent-color);
        background: rgba(var(--accent-color-rgb), 0.1);
    }
</style>
