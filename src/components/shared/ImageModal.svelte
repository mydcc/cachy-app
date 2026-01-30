<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
-->

<script lang="ts">
  import ModalFrame from "./ModalFrame.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { _ } from "../../locales/i18n";

  function close() {
    uiState.toggleImageModal(false);
  }
</script>

<ModalFrame
  isOpen={uiState.showImageModal}
  title={$_("marketOverview.heatmapImage") || "Heatmap Snapshot"}
  onclose={close}
  extraClasses="modal-size-lg"
>
  <div class="flex flex-col items-center justify-center p-4 min-h-[300px] bg-[var(--bg-secondary)] rounded-xl">
    {#if uiState.imageModalUrl}
        <!-- svelte-ignore a11y_img_redundant_alt -->
        <img
            src={uiState.imageModalUrl}
            alt="Heatmap Snapshot"
            class="max-w-full max-h-[80vh] w-auto h-auto rounded-lg shadow-lg border border-[var(--border-color)]"
            onerror={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
            }}
        />
        <div class="hidden text-center text-[var(--text-secondary)] flex flex-col gap-4">
            <div class="text-4xl">⚠️</div>
            <div>
                <p class="font-bold">{$_("errors.imageLoadFailed") || "Image Unavailable"}</p>
                <p class="text-sm mt-2 opacity-80">
                    The requested heatmap snapshot could not be loaded directly.<br/>
                    This usually happens due to browser security restrictions (CORS) on external images.
                </p>
            </div>
            <a
                href={uiState.imageModalUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="px-4 py-2 bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded-lg hover:brightness-110 text-sm font-bold"
            >
                Open Original Link
            </a>
        </div>
    {:else}
        <div class="text-center text-[var(--text-secondary)] animate-pulse">
            <p>Initializing...</p>
        </div>
    {/if}
  </div>
</ModalFrame>
