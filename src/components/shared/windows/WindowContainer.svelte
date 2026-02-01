<!--
  WindowContainer is the top-level viewport manager for the windowing system.
  It acts as a portal where all windows are rendered, separating them into two
  distinct layers:
  1. Floating Layer: Active, draggable windows.
  2. Docking Layer: Minimized windows displayed in a horizontal bar.

  It also synchronizes with global settings to position the dock (top/bottom)
  and toggle centering.
-->

<script lang="ts">
    import { windowManager } from "../../../lib/windows/WindowManager.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import WindowFrame from "./WindowFrame.svelte";

    /**
     * Reactive derivation of active windows.
     * These are rendered as absolute-positioned elements in the floating-layer.
     */
    let floatingWindows = $derived(
        windowManager.windows.filter((w) => !w.isMinimized),
    );

    /**
     * Reactive derivation of minimized windows.
     * These are rendered within the flexbox docking bar.
     */
    let minimizedWindows = $derived(
        windowManager.windows.filter((w) => w.isMinimized),
    );

    // Configuration from global application settings
    let dockPosition = $derived(settingsState.dockingPosition);
    let isCentered = $derived(settingsState.enableDockingCentered);
</script>

<div class="windows-container">
    <!-- Floating Windows Layer -->
    <div class="floating-layer">
        {#each floatingWindows as win (win.id)}
            <div
                class="window-wrapper"
                role="none"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
            >
                <WindowFrame window={win} />
            </div>
        {/each}
    </div>

    <!-- Minimized Dock Layer -->
    {#if minimizedWindows.length > 0}
        <div
            class="minimized-dock"
            class:dock-top={dockPosition === "top"}
            class:dock-bottom={dockPosition === "bottom"}
            class:dock-centered={isCentered}
        >
            <div class="dock-inner">
                {#each minimizedWindows as win (win.id)}
                    <div class="dock-item">
                        <WindowFrame window={win} />
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>

<style>
    .windows-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 11000;
        pointer-events: none;
    }

    .floating-layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }

    .window-wrapper {
        position: absolute;
        pointer-events: auto;
    }

    /* Dock Styles */
    .minimized-dock {
        position: fixed;
        left: 0;
        right: 0;
        display: flex;
        padding: 6px 10px;
        pointer-events: none;
        z-index: 12000;
    }

    .dock-top {
        top: 0;
    }

    .dock-bottom {
        bottom: 0;
    }

    .dock-centered {
        justify-content: center;
    }

    .dock-inner {
        display: flex;
        gap: 8px;
        pointer-events: auto;
        justify-content: center;
        max-width: 100%;
        overflow-x: auto;
        /* Hide scrollbar but allow scrolling if many chars */
        scrollbar-width: none;
    }
    .dock-inner::-webkit-scrollbar {
        display: none;
    }

    .dock-item {
        position: relative; /* Override absolute from WindowFrame */
        flex: 0 0 auto;
    }
</style>
