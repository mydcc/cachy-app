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

<!--
  WindowFrame is the primary UI wrapper for all windows in the Cachy application.
  It provides the chrome (header, controls, borders) and handles user interactions 
  such as dragging, resizing, focusing, and state persistence.

  Key Responsibilities:
  - Rendering the window header with titles, icons, and control buttons.
  - Implementing drag-and-drop movement.
  - Implementing multi-directional resizing.
  - Managing stacked Z-indices via WindowManager.
  - Applying visual effects like Glassmorphism and "Burning Borders".
  - Persisting geometry state to LocalStorage.
-->

<script lang="ts">
    import { windowManager } from "../../../lib/windows/WindowManager.svelte";
    import { effectsState } from "../../../stores/effects.svelte";
    import type { WindowBase } from "../../../lib/windows/WindowBase.svelte";
    import { burn } from "../../../actions/burn";
    import { _ } from "../../../locales/i18n";
    import CachyIcon from "../CachyIcon.svelte";

    interface Props {
        /** The logic instance representing this window. contains state and behavioral rules. */
        window: WindowBase;
    }

    let { window: win }: Props = $props();

    // --- LOCAL INTERACTION STATE ---
    let isDragging = $state(false);
    let showSettings = $state(false);
    let isResizing = $state(false);

    /**
     * Context Menu Observer
     * Closes the right-click settings menu if the user clicks anywhere outside of it.
     */
    $effect(() => {
        if (!showSettings) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (
                !target.closest(".cachy-logo") &&
                !target.closest(".window-settings-popup")
            ) {
                showSettings = false;
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    });

    /**
     * Stacking & Focus Management
     * Ensures the window is brought to the front when clicked.
     */
    function handlePointerDown(e: PointerEvent) {
        windowManager.bringToFront(win.id);
    }

    /**
     * Drag-and-Drop Implementation
     * Uses Pointer Capture to allow movement across the entire screen once initiated
     * from the header bar.
     */
    function startDrag(e: PointerEvent) {
        // Prevent movement if clicking control buttons
        if ((e.target as HTMLElement).closest(".window-controls")) return;

        isDragging = true;
        const target = e.currentTarget as HTMLElement;
        target.setPointerCapture(e.pointerId);

        const startX = e.clientX - win.x;
        const startY = e.clientY - win.y;

        const onPointerMove = (moveEvent: PointerEvent) => {
            if (!isDragging) return;
            win.updatePosition(
                moveEvent.clientX - startX,
                moveEvent.clientY - startY,
            );
        };

        const onPointerUp = (upEvent: PointerEvent) => {
            isDragging = false;
            target.releasePointerCapture(upEvent.pointerId);
            target.removeEventListener("pointermove", onPointerMove);
            target.removeEventListener("pointerup", onPointerUp);
        };

        target.addEventListener("pointermove", onPointerMove);
        target.addEventListener("pointerup", onPointerUp);
    }

    /**
     * Multi-directional Resizing Implementation
     * Handles 8 coordinates (N, S, E, W, NW, NE, SW, SE) and supports
     * fixed aspect ratios defined in the window configuration.
     * @param direction Codename for the resize handle (e.g. 'se' for South-East)
     */
    function startResize(e: PointerEvent, direction: string) {
        e.stopPropagation();
        isResizing = true;

        const target = e.currentTarget as HTMLElement;
        target.setPointerCapture(e.pointerId);

        const startWidth = win.width;
        const startHeight = win.height;
        const startX = win.x;
        const startY = win.y;
        const startPointerX = e.clientX;
        const startPointerY = e.clientY;

        // Shared constant for header height to offset aspect ratio calculations correctly.
        const HEADER_HEIGHT = 41;

        const onPointerMove = (moveEvent: PointerEvent) => {
            if (!isResizing) return;
            const dx = moveEvent.clientX - startPointerX;
            const dy = moveEvent.clientY - startPointerY;

            let newX = startX;
            let newY = startY;
            let newWidth = startWidth;
            let newHeight = startHeight;

            // 1. Calculate base changes based on handle direction
            if (direction.includes("e")) {
                newWidth = startWidth + dx;
            } else if (direction.includes("w")) {
                newWidth = startWidth - dx;
                if (newWidth > win.minWidth) {
                    newX = startX + dx;
                } else {
                    newX = startX + (startWidth - win.minWidth);
                }
            }

            if (direction.includes("s")) {
                newHeight = startHeight + dy;
            } else if (direction.includes("n")) {
                newHeight = startHeight - dy;
                if (newHeight > win.minHeight) {
                    newY = startY + dy;
                } else {
                    newY = startY + (startHeight - win.minHeight);
                }
            }

            // 2. Aspect Ratio Enforcement (if applicable)
            if (win.aspectRatio) {
                const ratio = win.aspectRatio;
                if (direction === "e" || direction === "w") {
                    newHeight = newWidth / ratio + HEADER_HEIGHT;
                } else if (direction === "s" || direction === "n") {
                    const contentHeight = newHeight - HEADER_HEIGHT;
                    newWidth = contentHeight * ratio;
                } else {
                    // Corner resizing defaults to width-dependency
                    newHeight = newWidth / ratio + HEADER_HEIGHT;
                }

                // Adjust anchor points when resizing from top/left handles
                if (direction.includes("n")) {
                    newY = startY + (startHeight - newHeight);
                }
                if (direction.includes("w")) {
                    newX = startX + (startWidth - newWidth);
                }
            }

            // 3. Min-size clamping
            if (newWidth < win.minWidth) {
                newWidth = win.minWidth;
                if (win.aspectRatio)
                    newHeight = newWidth / win.aspectRatio + HEADER_HEIGHT;
                if (direction.includes("w"))
                    newX = startX + (startWidth - newWidth);
            }

            // 4. Update the logic instance
            win.updatePosition(newX, newY);
            win.updateSize(newWidth, newHeight);
        };

        const onPointerUp = (upEvent: PointerEvent) => {
            isResizing = false;
            target.releasePointerCapture(upEvent.pointerId);
            target.removeEventListener("pointermove", onPointerMove);
            target.removeEventListener("pointerup", onPointerUp);
        };

        target.addEventListener("pointermove", onPointerMove);
        target.addEventListener("pointerup", onPointerUp);
    }

    /**
     * Persistent State Auto-Save
     * Triggers a state save to LocalStorage whenever reactive properties change.
     */
    $effect(() => {
        if (win.persistent) {
            win.saveState();
        }
    });

    // --- INTERACTION UTILITIES ---
    let pointerDownPos = { x: 0, y: 0 };
    let pointerDownTime = 0;

    /** Tracks initial data for click vs drag discrimination. */
    function handleTitlePointerDown(e: PointerEvent) {
        pointerDownPos = { x: e.clientX, y: e.clientY };
        pointerDownTime = Date.now();
    }

    /** Evaluation of semantic "click" on the header. */
    function handleTitlePointerUp(e: PointerEvent) {
        const dx = Math.abs(e.clientX - pointerDownPos.x);
        const dy = Math.abs(e.clientY - pointerDownPos.y);
        const dt = Date.now() - pointerDownTime;

        // If moved less than 5px and released within 300ms, consider it a deliberate click.
        if (dx < 5 && dy < 5 && dt < 300) {
            if (win.headerAction === "toggle-mode") {
                win.onHeaderTitleClick();
            }
        }
    }

    /** Handles right-click behavior for both minimized and floating states. */
    function handleContextMenu(e: MouseEvent) {
        if (!win.isMinimized) {
            e.preventDefault();
            return;
        }

        if (win.hasContextMenu) {
            e.preventDefault();
            e.stopPropagation();
            showSettings = !showSettings;
            windowManager.bringToFront(win.id);
        }
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class:window-frame={true}
    class:glass-panel={true}
    class:focused={win.isFocused}
    class:dragging={isDragging}
    class:resizing={isResizing}
    class:interacting={isDragging || isResizing}
    class:transparent={win.isTransparent}
    class:glass-morphism={win.enableGlassmorphism}
    class:maximized={win.isMaximized}
    class:minimized={win.isMinimized}
    class:pinned-left={win.isPinned && win.pinSide === "left"}
    class:pinned-right={win.isPinned && win.pinSide === "right"}
    style:left={win.isMinimized
        ? "auto"
        : win.isMaximized
          ? "0"
          : win.isPinned && win.pinSide === "left"
            ? "0"
            : `${win.x}px`}
    style:top={win.isMinimized
        ? "auto"
        : win.isMaximized
          ? "0"
          : win.isPinned && (win.pinSide === "left" || win.pinSide === "top")
            ? "0"
            : `${win.y}px`}
    style:width={win.isMinimized
        ? "210px"
        : win.isMaximized
          ? "100vw"
          : `${win.width}px`}
    style:height={win.isMinimized
        ? "34px"
        : win.isMaximized
          ? "100vh"
          : win.isPinned && (win.pinSide === "left" || win.pinSide === "right")
            ? "100vh"
            : `${win.height}px`}
    style:z-index={win.zIndex}
    style:opacity={win.opacity}
    onpointerdown={handlePointerDown}
    oncontextmenu={handleContextMenu}
    use:burn={win.enableBurningBorders
        ? {
              id: win.id,
              layer: win.isMinimized ? "tiles" : "windows",
              symbol: win.symbol,
              intensity: (win.isFocused ? 1.5 : 0.6) * win.burnIntensity,
              // Push Geometry only when open (avoid layout overhead during animation).
              // When minimized, fallback to measurement (undefined) to follow dock tile.
              x: win.isMinimized ? undefined : win.x,
              y: win.isMinimized ? undefined : win.y,
              width: win.isMinimized ? undefined : win.width,
              height: win.isMinimized ? undefined : win.height,
          }
        : undefined}
>
    <div
        class="window-header"
        onpointerdown={(e) => {
            if (win.isMinimized) {
                e.stopPropagation();
                windowManager.bringToFront(win.id);
                // Single click activation handled by handleTitlePointerUp on the title
                // For clicking the rest of the bar, we could add it here if needed.
                return;
            }
            if (win.isDraggable && !win.isMaximized && !win.isPinned) {
                startDrag(e);
            }
        }}
        ondblclick={() => {
            if (win.isMinimized) {
                win.restore();
                windowManager.bringToFront(win.id);
            } else {
                // Respect doubleClickBehavior flag
                if (
                    win.doubleClickBehavior === "maximize" &&
                    win.allowMaximize
                ) {
                    win.toggleMaximize();
                } else if (win.doubleClickBehavior === "pin") {
                    win.togglePin();
                }
            }
        }}
    >
        <div
            class="header-content"
            ondblclick={(e) => {
                // Symbol/Logo/Title area double-click: Minimize/Restore
                e.stopPropagation();
                if (win.isMinimized) {
                    win.restore();
                    windowManager.bringToFront(win.id);
                } else if (win.allowMinimize) {
                    win.minimize();
                }
            }}
        >
            {#if win.showIcon && !win.isMinimized}
                <div
                    class="cachy-logo"
                    onpointerdown={(e) => {
                        if (!win.hasContextMenu) return;
                        e.preventDefault();
                        e.stopPropagation();
                        showSettings = !showSettings;
                        windowManager.bringToFront(win.id);
                    }}
                    oncontextmenu={(e) => {
                        if (!win.hasContextMenu) return;
                        e.preventDefault();
                        e.stopPropagation();
                        showSettings = !showSettings;
                        windowManager.bringToFront(win.id);
                    }}
                    role="button"
                    tabindex="0"
                >
                    <CachyIcon width="20" height="20" active={win.isFocused} />
                </div>
            {/if}

            <div
                class="title-wrapper"
                class:clickable={win.headerAction === "toggle-mode"}
                onpointerdown={(e) => {
                    // Do NOT stop propagation if minimized, so header handles restore
                    if (!win.isMinimized) {
                        e.stopPropagation();
                    }
                    handleTitlePointerDown(e);
                }}
                onpointerup={handleTitlePointerUp}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === "Enter" && win.onHeaderTitleClick()}
            >
                {#if win.showPriceInTitle && win.currentPrice}
                    <span class="title-price">{win.currentPrice}</span>
                    <span class="title-separator"> • </span>
                {/if}

                <span class="window-title">{win.title}</span>
            </div>

            {#if win.headerControls.length > 0 && !win.isMinimized}
                <div class="header-controls">
                    {#each win.headerControls as ctrl}
                        <button
                            class="header-ctrl-btn"
                            class:active={ctrl.active}
                            onclick={(e) => {
                                e.stopPropagation();
                                ctrl.action();
                            }}
                            ondblclick={(e) => e.stopPropagation()}
                            title={ctrl.title || ctrl.label}
                        >
                            {#if ctrl.icon}
                                <span class="ctrl-icon">{ctrl.icon}</span>
                            {/if}
                            {#if ctrl.label}
                                <span class="ctrl-label">{ctrl.label}</span>
                            {/if}
                        </button>
                    {/each}
                </div>
            {/if}

            <!-- Spacer element that bubbles up dblclick to parent for maximization -->
            <div class="header-spacer"></div>

            {#if win.showHeaderIndicators && win.headerSnippet}
                <div class="header-indicators">
                    {@render win.headerSnippet()}
                </div>
            {/if}
        </div>

        <div class="window-controls" class:hidden={win.isMinimized}>
            {#if win.allowZoom}
                <div class="control-group">
                    <button
                        class="tool-btn"
                        onclick={() => win.zoomOut()}
                        ondblclick={(e) => e.stopPropagation()}>－</button
                    >
                    <span class="zoom-text"
                        >{Math.round(win.zoomLevel * 100)}%</span
                    >
                    <button
                        class="tool-btn"
                        onclick={() => win.zoomIn()}
                        ondblclick={(e) => e.stopPropagation()}>＋</button
                    >
                </div>
            {/if}

            {#if win.headerButtons.includes("export")}
                <button
                    class="tool-btn"
                    onclick={() => win.onHeaderExport()}
                    ondblclick={(e) => e.stopPropagation()}
                    title="Export"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><path
                            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"
                        /><polyline points="7 10 12 15 17 10" /><line
                            x1="12"
                            y1="15"
                            x2="12"
                            y2="3"
                        /></svg
                    >
                </button>
            {/if}

            {#if win.headerButtons.includes("delete")}
                <button
                    class="tool-btn danger"
                    onclick={() => win.onHeaderDelete()}
                    ondblclick={(e) => e.stopPropagation()}
                    title="Delete/Clear"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><polyline points="3 6 5 6 21 6" /><path
                            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                        /></svg
                    >
                </button>
            {/if}

            {#if win.allowFontSize}
                <div class="control-group">
                    <button
                        class="tool-btn"
                        onclick={() => win.setFontSize(win.fontSize - 1)}
                        ondblclick={(e) => e.stopPropagation()}>A-</button
                    >
                    <button
                        class="tool-btn"
                        onclick={() => win.setFontSize(win.fontSize + 1)}
                        ondblclick={(e) => e.stopPropagation()}>A+</button
                    >
                </div>
            {/if}

            {#if win.allowFeedDuck}
                <div class="control-group">
                    <button
                        class="tool-btn success"
                        onclick={(e) => {
                            e.stopPropagation();
                            effectsState.triggerFeed(10);
                        }}
                        ondblclick={(e) => e.stopPropagation()}
                        title="Feed Duck (Profit)">🍞</button
                    >
                </div>
            {/if}

            {#if win.showMinimizeButton || win.showMaximizeButton}
                <div class="divider"></div>
                <div class="control-group system-controls">
                    {#if win.showMinimizeButton}
                        <button
                            class="tool-btn"
                            onclick={() => win.minimize()}
                            ondblclick={(e) => e.stopPropagation()}
                            title="Minimize"
                        >
                            <span class="icon-min"></span>
                        </button>
                    {/if}
                    {#if win.showMaximizeButton}
                        <button
                            class="tool-btn"
                            onclick={() => win.toggleMaximize()}
                            ondblclick={(e) => e.stopPropagation()}
                            title={win.isMaximized ? "Restore" : "Maximize"}
                        >
                            <span
                                class={win.isMaximized
                                    ? "icon-restore"
                                    : "icon-max"}
                                style:transform={win.isMaximized
                                    ? "scale(0.9) translate(-1px, -1px)"
                                    : "none"}
                            ></span>
                        </button>
                    {/if}
                </div>
            {/if}

            <button
                class="close-btn"
                onclick={() => windowManager.close(win.id)}
                ondblclick={(e) => e.stopPropagation()}>✕</button
            >
        </div>

        {#if showSettings && win.hasContextMenu}
            <div
                class="window-settings-popup context-menu"
                style:display="block"
            >
                {#each win.getContextMenuActions() as action}
                    <button
                        class="menu-item"
                        class:danger={action.danger}
                        onpointerdown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            showSettings = false;
                            action.action();
                        }}
                    >
                        {#if action.icon}<span>{action.icon}</span>{/if}
                        <span>{action.label}</span>
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <div class="window-content" style:font-size="{win.fontSize}px">
        <div
            class="content-wrapper"
            style:transform="scale({win.zoomLevel})"
            style:transform-origin="top left"
            style:width="{100 / win.zoomLevel}%"
            style:height="{100 / win.zoomLevel}%"
        >
            <win.component window={win} {...win.componentProps} />
        </div>
    </div>

    {#if win.isResizable && !win.isMaximized && !win.isMinimized && !win.isPinned}
        <div
            class="resize-grip n"
            onpointerdown={(e) => startResize(e, "n")}
        ></div>
        <div
            class="resize-grip s"
            onpointerdown={(e) => startResize(e, "s")}
        ></div>
        <div
            class="resize-grip e"
            onpointerdown={(e) => startResize(e, "e")}
        ></div>
        <div
            class="resize-grip w"
            onpointerdown={(e) => startResize(e, "w")}
        ></div>
        <div
            class="resize-grip nw"
            onpointerdown={(e) => startResize(e, "nw")}
        ></div>
        <div
            class="resize-grip ne"
            onpointerdown={(e) => startResize(e, "ne")}
        ></div>
        <div
            class="resize-grip sw"
            onpointerdown={(e) => startResize(e, "sw")}
        ></div>
        <div
            class="resize-grip se"
            onpointerdown={(e) => startResize(e, "se")}
        ></div>
    {/if}
</div>

<style>
    .window-frame {
        position: absolute;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        pointer-events: auto;
        border-radius: 12px;
        background: var(--bg-secondary);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        border: 1px solid var(--border-color);
        transition:
            box-shadow 0.2s ease,
            opacity 0.2s ease,
            width 0.2s ease,
            height 0.2s ease,
            left 0.2s ease,
            top 0.2s ease,
            border-radius 0.2s ease;
    }
    .window-frame.interacting {
        transition: none !important;
    }
    .window-frame.maximized {
        position: fixed;
        left: 0 !important;
        top: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        border-radius: 0;
        border: none;
        box-shadow: none;
        z-index: 20000 !important;
    }
    .window-frame.minimized {
        position: relative !important;
        left: auto !important;
        top: auto !important;
        width: 210px !important;
        height: 34px !important;
        display: flex;
        z-index: auto !important;
        border-radius: 8px;
        background: var(--bg-secondary);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        cursor: pointer;
    }
    .window-frame.minimized:hover {
        background: color-mix(in srgb, var(--bg-secondary), white 5%);
        border-color: var(--accent-color);
    }
    .window-frame.minimized .window-header {
        border-bottom: none;
        padding: 4px 10px;
        height: 100%;
        opacity: 1;
    }
    .window-frame.minimized .window-content {
        display: none;
    }
    .window-controls.hidden {
        display: none;
    }
    .window-frame.pinned-left {
        border-radius: 0 12px 12px 0;
        border-left: none;
    }
    .window-frame.pinned-right {
        border-radius: 12px 0 0 12px;
        border-right: none;
    }
    .window-frame.focused {
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        border: 1px solid var(--border-color);
    }
    .window-frame.dragging {
        opacity: 0.9;
        cursor: grabbing;
    }
    .window-frame.transparent {
        background: transparent !important;
        backdrop-filter: none !important;
        border: none !important;
        box-shadow: none !important;
    }
    .window-frame.glass-morphism {
        background: color-mix(
            in srgb,
            var(--bg-secondary, #0f172a),
            transparent 30%
        );
        backdrop-filter: blur(12px) saturate(180%);
    }
    .window-header {
        position: relative;
        z-index: 50; /* Ensure global context for dropdowns */
        padding: 8px 12px;
        background: transparent;
        cursor: grab;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
        border-bottom: 1px solid var(--border-color);
        opacity: 0.9;
    }
    .header-content {
        display: flex;
        align-items: center;
        overflow: hidden;
        flex: 0 1 auto;
    }
    .title-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
    }
    .header-controls {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-left: 12px;
        flex: 0 0 auto;
    }
    .window-title {
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--text-primary);
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
    }
    .title-price {
        font-family: var(--font-mono, monospace);
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.85rem;
        opacity: 0.95;
        white-space: nowrap;
        display: flex;
        align-items: center;
    }

    .title-separator {
        opacity: 0.4;
        margin: 0 4px;
        font-weight: 900;
        color: var(--text-secondary);
        font-size: 1.2rem;
        line-height: 0;
        display: flex;
        align-items: center;
    }
    @keyframes price-fade {
        from {
            opacity: 0;
            transform: translateY(-2px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    .header-indicators {
        margin-left: auto;
        margin-right: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        overflow: hidden;
    }
    .title-wrapper.clickable {
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        transition: background 0.2s;
    }
    .title-wrapper.clickable:hover {
        background: color-mix(in srgb, var(--text-primary), transparent 90%);
    }
    .window-content {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        position: relative;
    }
    .header-spacer {
        flex: 1;
        height: 100%;
        min-width: 20px;
    }
    .header-controls {
        display: flex;
        gap: 4px;
        margin-left: 12px;
        align-items: center;
        flex: 0 0 auto;
    }
    .header-ctrl-btn {
        background: color-mix(in srgb, var(--text-primary), transparent 95%);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-size: 10px;
        font-weight: 700;
        padding: 4px 8px; /* Increased padding */
        border-radius: 6px; /* Smoother corners */
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 4px;
        line-height: 1;
    }
    .header-ctrl-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-primary);
        transform: translateY(-1px);
    }
    /* Higher specificity for active button to ensure VIP theme colors are applied */
    .window-frame .header-ctrl-btn.active {
        background: var(--accent-color) !important;
        color: var(--text-on-accent, #000000) !important;
        border-color: var(--accent-color);
        box-shadow: 0 0 10px rgba(var(--accent-color-rgb), 0.3);
        font-weight: 700;
        opacity: 1;
    }
    .ctrl-icon {
        font-size: 1.1em;
    }

    .window-controls {
        display: flex;
        gap: 4px;
        align-items: center;
    }
    .icon-min {
        width: 10px;
        height: 1.5px;
        background: currentColor;
        display: inline-block;
        transform: translateY(3px);
    }
    .icon-max,
    .icon-restore {
        width: 10px;
        height: 10px;
        border: 1.5px solid currentColor;
        display: inline-block;
    }
    .icon-max {
        border: 2px solid currentColor;
    }
    .icon-restore {
        width: 8px;
        height: 8px;
        position: relative;
    }
    .icon-restore::after {
        content: "";
        position: absolute;
        top: -3px;
        right: -3px;
        width: 8px;
        height: 8px;
        border: 1.5px solid currentColor;
        border-bottom: none;
        border-left: none;
    }
    .content-wrapper {
        position: absolute;
        top: 0;
        left: 0;
    }
    .cachy-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px 8px; /* Larger hit area */
        margin-right: 4px;
        min-width: 32px;
        min-height: 28px;
        transition: transform 0.2s;
        position: relative;
        cursor: pointer;
    }
    .cachy-logo:hover {
        transform: scale(1.1);
        filter: drop-shadow(0 0 5px var(--accent-color));
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
    }
    .control-group {
        display: flex;
        align-items: center;
        background: color-mix(in srgb, var(--text-primary), transparent 95%);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 2px;
        margin-right: 4px;
        gap: 2px;
    }
    .tool-btn {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 0.75rem;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
    }
    .tool-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-primary);
    }
    .zoom-text {
        font-size: 0.7rem;
        min-width: 35px;
        text-align: center;
        color: var(--text-secondary);
    }
    .divider {
        width: 1px;
        height: 16px;
        background: var(--border-color);
        margin: 0 4px;
    }
    .close-btn {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 1rem;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.2s;
    }
    .close-btn:hover {
        background: color-mix(in srgb, var(--danger-color), transparent 80%);
        color: var(--danger-color);
    }
    .window-settings-popup {
        position: absolute;
        top: calc(100% + 8px);
        left: 8px;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 6px;
        z-index: 1000;
        min-width: 180px;
        box-shadow: 0 15px 50px rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(25px) saturate(180%);
        display: flex;
        flex-direction: column;
        gap: 2px;
        animation: menu-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes menu-fade-in {
        from {
            opacity: 0;
            transform: translateY(-5px) scale(0.98);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    .menu-item {
        width: 100%;
        background: transparent;
        border: none;
        color: var(--text-secondary);
        padding: 8px 12px;
        text-align: left;
        font-size: 0.85rem;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all 0.1s ease;
        white-space: nowrap;
    }

    .menu-item:hover {
        background: var(--accent-color);
        color: var(--text-on-accent, #000000);
    }

    .menu-item.danger:hover {
        background: var(--danger-color);
        color: white;
    }

    /* Resize handles */
    .resize-grip {
        position: absolute;
        z-index: 100;
    }
    .resize-grip.n,
    .resize-grip.s {
        height: 20px;
        left: 20px;
        right: 20px;
        cursor: ns-resize;
    }
    .resize-grip.e,
    .resize-grip.w {
        width: 20px;
        top: 20px;
        bottom: 20px;
        cursor: ew-resize;
    }
    .resize-grip.n {
        top: -10px;
    }
    .resize-grip.s {
        bottom: -10px;
    }
    .resize-grip.e {
        right: -10px;
    }
    .resize-grip.w {
        left: -10px;
    }
    .resize-grip.nw,
    .resize-grip.ne,
    .resize-grip.sw,
    .resize-grip.se {
        width: 30px;
        height: 30px;
    }
    .resize-grip.nw {
        top: -15px;
        left: -15px;
        cursor: nwse-resize;
    }
    .resize-grip.ne {
        top: -15px;
        right: -15px;
        cursor: nesw-resize;
    }
    .resize-grip.sw {
        bottom: -15px;
        left: -15px;
        cursor: nesw-resize;
    }
    .resize-grip.se {
        bottom: -15px;
        right: -15px;
        cursor: nwse-resize;
    }
</style>
