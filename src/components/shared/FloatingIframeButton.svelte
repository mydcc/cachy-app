<script lang="ts">
    import { uiState } from "../../stores/ui.svelte";
    import { _ } from "../../locales/i18n";
    import { fade, scale } from "svelte/transition";

    // Derived state to check if main window ("genesis") is open
    let isGenesisOpen = $derived(
        uiState.windows.some((w) => w.id === "genesis"),
    );

    // Config for custom channels menu
    const CUSTOM_CHANNELS = [
        { id: "genesis", label: "Genesis (Main)", plotId: "genesis" },
        { id: "teich", label: "Teich", plotId: "TEICH" },
        { id: "cinema", label: "Cinema", plotId: "cinema" },
    ];

    let showMenu = $state(false);

    function toggleMain() {
        if (isGenesisOpen) {
            uiState.closeWindow("genesis");
        } else {
            uiState.openWindow(
                "genesis",
                "https://space.cachy.app/index.php?plot_id=genesis",
                "Cachy Space",
            );
        }
    }

    function openChannel(ch: { id: string; label: string; plotId: string }) {
        uiState.openWindow(
            ch.id,
            `https://space.cachy.app/index.php?plot_id=${ch.plotId}`,
            ch.label,
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
                    {#if uiState.windows.some((w) => w.id === ch.id)}
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
