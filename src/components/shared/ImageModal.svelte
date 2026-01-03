<script lang="ts">
    import ModalFrame from './ModalFrame.svelte';

    export let isOpen = false;
    export let imageUrl = '';

    let isZoomed = false;

    function handleClose() {
        isOpen = false;
        isZoomed = false; // Reset zoom on close
    }

    function toggleZoom() {
        isZoomed = !isZoomed;
    }
</script>

<ModalFrame {isOpen} title="Screenshot" on:close={handleClose} extraClasses="modal-size-lg">
    <div class="flex items-center justify-center bg-[var(--bg-secondary)] rounded-lg overflow-hidden min-h-[300px] relative">
        {#if imageUrl}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <img
                src={imageUrl}
                alt="Trade Screenshot"
                class="max-w-full max-h-[80vh] object-contain transition-transform duration-300 cursor-zoom-in {isZoomed ? 'scale-150 cursor-zoom-out' : ''}"
                on:click={toggleZoom}
            />
        {:else}
            <div class="text-[var(--text-secondary)]">No image available</div>
        {/if}
    </div>
</ModalFrame>
