<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
-->

<script lang="ts">
    import { floatingWindowsStore } from "../../stores/floatingWindows.svelte";
    import FloatingIframeModal from "./FloatingIframeModal.svelte";

    let windows = $derived(floatingWindowsStore.all);

    function handleBackdropClick(e: MouseEvent) {
        // Click-outside: Schließe alle Fenster wenn user außerhalb klickt
        if (e.target === e.currentTarget) {
            // Wenn auf den Backdrop (nicht auf ein Fenster) geklickt wurde
            // schließen wir das oberste Fenster
            if (windows.length > 0) {
                const topWindow = windows.reduce((prev, curr) =>
                    prev.zIndex > curr.zIndex ? prev : curr,
                );
                floatingWindowsStore.closeWindow(topWindow.id);
            }
        }
    }
</script>

{#if windows.length > 0}
    <!-- Backdrop für click-outside -->
    <div
        class="floating-windows-backdrop"
        onclick={handleBackdropClick}
        role="presentation"
    >
        {#each windows as win (win.id)}
            <FloatingIframeModal window={win} />
        {/each}
    </div>
{/if}

<style>
    .floating-windows-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999;
        pointer-events: auto;
    }
</style>
