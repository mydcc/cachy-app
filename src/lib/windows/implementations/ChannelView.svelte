<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
    import type { WindowBase } from "../WindowBase.svelte";
    import { _ } from "../../../locales/i18n";

    interface Props {
        window: WindowBase & { url: string };
        allow?: string;
    }

    let {
        window: win,
        allow = "xr-spatial-tracking; camera; microphone; display-capture; autoplay; clipboard-write; encrypted-media; web-share"
    }: Props = $props();

    // Tracks a real embed failure (e.g. the remote host refuses the connection or blocks
    // framing) so we show a recoverable fallback instead of the browser's raw network-error
    // page inside the window.
    let embedFailed = $state(false);

    $effect(() => {
        // Reset whenever the target URL changes so a new window/navigation gets a fresh attempt.
        void win.url;
        embedFailed = false;
    });

    function handleEmbedError() {
        embedFailed = true;
    }

    function retryEmbed() {
        embedFailed = false;
    }

    function openInNewTab() {
        if (win.url) {
            window.open(win.url, "_blank", "noopener,noreferrer");
        }
    }
</script>

<div class="channel-view-container relative w-full h-full bg-[var(--bg-primary)] overflow-hidden">
    {#if embedFailed}
        <div class="embed-failed-container h-full w-full flex flex-col items-center justify-center gap-3 p-6 text-center bg-[var(--bg-primary)]">
            <p class="text-sm text-[var(--text-secondary)] max-w-sm">
                {$_("dashboard.iframeBlocked")}
            </p>
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    onclick={retryEmbed}
                    class="px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-medium cursor-pointer transition-colors"
                >
                    {$_("common.retry")}
                </button>
                <button
                    type="button"
                    onclick={openInNewTab}
                    class="px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-black font-medium text-xs hover:opacity-90 transition-opacity cursor-pointer"
                >
                    {$_("dashboard.openInNewTab")}
                </button>
            </div>
        </div>
    {:else}
        <iframe
            src={win.url}
            title={win.title}
            {allow}
            onerror={handleEmbedError}
            class="w-full h-full border-0 block"
        ></iframe>
    {/if}
</div>

<style>
    .channel-view-container {
        width: 100%;
        height: 100%;
        overflow: hidden;
    }
    iframe {
        width: 100%;
        height: 100%;
        border: none;
        display: block;
    }
</style>
