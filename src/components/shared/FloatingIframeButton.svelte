<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
    import { uiState } from "../../stores/ui.svelte";
    import { windowManager } from "../../lib/windows/WindowManager.svelte";
    import { IframeWindow } from "../../lib/windows/implementations/IframeWindow.svelte";
    import { _ } from "../../locales/i18n";
    import { fade, scale } from "svelte/transition";

    // Derived state to check if main window ("genesis") is open
    let isGenesisOpen = $derived(
        windowManager.windows.some((w) => w.id === "genesis"),
    );

    // Config for custom channels menu
    const CUSTOM_CHANNELS = [
        { id: "genesis", label: "Genesis (Main)", plotId: "genesis" },
        { id: "TEICH", label: "Teich", plotId: "teich" },
        { id: "cinema", label: "Cinema", plotId: "cinema" },
    ];

    let showMenu = $state(false);

    function toggleMain() {
        if (isGenesisOpen) {
            windowManager.close("genesis");
        } else {
            windowManager.open(
                new IframeWindow(
                    "https://space.cachy.app/index.php?plot_id=genesis",
                    "Cachy Space",
                    { id: "genesis" },
                ),
            );
        }
    }

    function openChannel(ch: { id: string; label: string; plotId: string }) {
        windowManager.open(
            new IframeWindow(
                `https://space.cachy.app/index.php?plot_id=${ch.plotId}`,
                ch.label,
                { id: ch.id },
            ),
        );
        showMenu = false;
    }

    function handleContextMenu(e: MouseEvent) {
        e.preventDefault();
        showMenu = !showMenu;
    }
</script>

<div class="relative inline-block">
    <button
        class="btn-icon-accent"
        class:active={isGenesisOpen}
        onclick={toggleMain}
        oncontextmenu={handleContextMenu}
        aria-label="Toggle Video"
        title="Left-Click: Toggle Genesis | Right-Click: More Channels"
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

    {#if showMenu}
        <!-- Backdrop to close menu -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="fixed inset-0 z-[99]"
            onclick={() => (showMenu = false)}
        ></div>

        <!-- Context Menu -->
        <div
            in:scale={{ duration: 100, start: 0.95 }}
            class="absolute bottom-full right-0 mb-2 w-48 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-xl z-[100] overflow-hidden flex flex-col py-1"
        >
            <div
                class="px-3 py-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border-color)] mb-1"
            >
                Channels
            </div>
            {#each CUSTOM_CHANNELS as ch}
                <button
                    class="mobile-touch-target px-4 py-2 text-left hover:bg-[var(--bg-tertiary)] transition-colors text-sm flex items-center justify-between group"
                    onclick={() => openChannel(ch)}
                >
                    <span
                        class="text-[var(--text-primary)] group-hover:text-[var(--accent-color)]"
                        >{ch.label}</span
                    >
                    {#if windowManager.windows.some((w) => w.id === ch.id)}
                        <span
                            class="w-1.5 h-1.5 rounded-full bg-[var(--success-color)]"
                        ></span>
                    {/if}
                </button>
            {/each}
        </div>
    {/if}
</div>

<style>
    .btn-icon-accent.active {
        color: var(--accent-color);
        background: rgba(var(--accent-color-rgb), 0.1);
    }
</style>
