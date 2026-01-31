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
    import { windowManager } from "../../../lib/windows/WindowManager.svelte";
    import { effectsState } from "../../../stores/effects.svelte";
    import type { WindowBase } from "../../../lib/windows/WindowBase.svelte";
    import { burn } from "../../../actions/burn";
    import { _ } from "../../../locales/i18n";
    import CachyIcon from "../CachyIcon.svelte";

    interface Props {
        window: WindowBase;
    }

    let { window: win }: Props = $props();

    let isDragging = $state(false);
    let showSettings = $state(false);
    let isResizing = $state(false);

    // Close settings when clicking outside
    $effect(() => {
        if (!showSettings) return;
        const handler = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest(".cachy-logo")) {
                showSettings = false;
            }
        };
        document.addEventListener("click", handler);
        return () => document.removeEventListener("click", handler);
    });

    function handlePointerDown(e: PointerEvent) {
        windowManager.bringToFront(win.id);
    }

    function startDrag(e: PointerEvent) {
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

        const HEADER_HEIGHT = 41;

        const onPointerMove = (moveEvent: PointerEvent) => {
            if (!isResizing) return;
            const dx = moveEvent.clientX - startPointerX;
            const dy = moveEvent.clientY - startPointerY;

            let newX = startX;
            let newY = startY;
            let newWidth = startWidth;
            let newHeight = startHeight;

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

            if (win.aspectRatio) {
                const ratio = win.aspectRatio;
                if (direction === "e" || direction === "w") {
                    newHeight = newWidth / ratio + HEADER_HEIGHT;
                } else if (direction === "s" || direction === "n") {
                    const contentHeight = newHeight - HEADER_HEIGHT;
                    newWidth = contentHeight * ratio;
                } else {
                    newHeight = newWidth / ratio + HEADER_HEIGHT;
                }

                if (direction.includes("n")) {
                    newY = startY + (startHeight - newHeight);
                }
                if (direction.includes("w")) {
                    newX = startX + (startWidth - newWidth);
                }
            }

            if (newWidth < win.minWidth) {
                newWidth = win.minWidth;
                if (win.aspectRatio)
                    newHeight = newWidth / win.aspectRatio + HEADER_HEIGHT;
                if (direction.includes("w"))
                    newX = startX + (startWidth - newWidth);
            }

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

    // State Persistence
    $effect(() => {
        if (win.persistent) {
            win.saveState();
        }
    });

    // --- TITLE CLICK ROBUSTNESS ---
    let pointerDownPos = { x: 0, y: 0 };
    let pointerDownTime = 0;

    function handleTitlePointerDown(e: PointerEvent) {
        pointerDownPos = { x: e.clientX, y: e.clientY };
        pointerDownTime = Date.now();
    }

    function handleTitlePointerUp(e: PointerEvent) {
        const dx = Math.abs(e.clientX - pointerDownPos.x);
        const dy = Math.abs(e.clientY - pointerDownPos.y);
        const dt = Date.now() - pointerDownTime;

        // If moved less than 5px and released within 300ms, consider it a click
        if (dx < 5 && dy < 5 && dt < 300) {
            if (win.headerAction === "toggle-mode") {
                win.onHeaderTitleClick();
            }
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
    style:left={win.isMaximized
        ? "0"
        : win.isPinned && win.pinSide === "left"
          ? "0"
          : `${win.x}px`}
    style:top={win.isMaximized
        ? "0"
        : win.isPinned && (win.pinSide === "left" || win.pinSide === "top")
          ? "0"
          : `${win.y}px`}
    style:width={win.isMaximized ? "100vw" : `${win.width}px`}
    style:height={win.isMaximized
        ? "100vh"
        : win.isPinned && (win.pinSide === "left" || win.pinSide === "right")
          ? "100vh"
          : `${win.height}px`}
    style:z-index={win.zIndex}
    style:opacity={win.opacity}
    onpointerdown={handlePointerDown}
    use:burn={win.enableBurningBorders
        ? {
              layer: "windows",
              intensity: (win.isFocused ? 1.5 : 0.6) * win.burnIntensity,
          }
        : undefined}
>
    <div
        class="window-header"
        onpointerdown={win.isDraggable && !win.isMaximized && !win.isPinned
            ? startDrag
            : undefined}
        ondblclick={() => {
            if (win.doubleClickBehavior === "pin") {
                win.togglePin();
            } else {
                win.toggleMaximize();
            }
        }}
    >
        <div class="header-content">
            <div
                class="title-wrapper"
                class:clickable={win.headerAction === "toggle-mode"}
                onpointerdown={(e) => {
                    e.stopPropagation();
                    handleTitlePointerDown(e);
                }}
                onpointerup={handleTitlePointerUp}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === "Enter" && win.onHeaderTitleClick()}
            >
                {#if win.showCachyIcon}
                    <div
                        class="cachy-logo"
                        oncontextmenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            showSettings = !showSettings;
                        }}
                        role="button"
                        tabindex="0"
                    >
                        <CachyIcon
                            width="18"
                            height="18"
                            style="color: var(--accent-color)"
                        />
                        {#if showSettings}
                            <div
                                class="window-settings-popup context-menu"
                                style="display: block;"
                            >
                                <div class="settings-item">
                                    <span>Opacity</span>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="1.0"
                                        step="0.1"
                                        bind:value={win.opacity}
                                    />
                                </div>
                                <label class="settings-item flex-row">
                                    <input
                                        type="checkbox"
                                        bind:checked={win.enableGlassmorphism}
                                    />
                                    <span>Glass</span>
                                </label>
                                <label class="settings-item flex-row">
                                    <input
                                        type="checkbox"
                                        bind:checked={win.enableBurningBorders}
                                    />
                                    <span>Burn</span>
                                </label>
                                <div class="menu-divider"></div>
                                <button
                                    class="menu-item danger"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        const winEl = (
                                            e.currentTarget as HTMLElement
                                        ).closest(
                                            ".window-frame",
                                        ) as HTMLElement;
                                        effectsState.triggerSmash(
                                            winEl,
                                            win.id,
                                        );
                                        windowManager.close(win.id);
                                    }}
                                >
                                    🔨 {$_("windows.smash")}
                                </button>
                            </div>
                        {/if}
                    </div>
                {/if}
                <span class="window-title">{win.title}</span>
                {#if win.headerControls.length > 0}
                    <div class="header-controls">
                        {#each win.headerControls as ctrl}
                            <button
                                class="header-ctrl-btn"
                                class:active={ctrl.active}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    ctrl.action();
                                }}
                            >
                                {ctrl.label}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>

            {#if win.showHeaderIndicators && win.headerSnippet}
                <div class="header-indicators">
                    {@render win.headerSnippet()}
                </div>
            {/if}
        </div>

        <div class="window-controls">
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

    {#if win.isResizable}
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
        position: fixed;
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
        border-radius: 0;
        z-index: 20000 !important;
    }
    .window-frame.pinned-left {
        border-radius: 0 12px 12px 0;
        border-left: none;
    }
    .window-frame.pinned-right {
        border-radius: 12px 0 0 12px;
        border-right: none;
    }
    .window-frame.minimized {
        display: none;
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
        flex: 1;
        overflow: hidden;
    }
    .title-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
    }
    .window-title {
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--text-primary);
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
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
    .header-controls {
        display: flex;
        gap: 4px;
        margin-left: 12px;
        align-items: center;
    }
    .header-ctrl-btn {
        background: color-mix(in srgb, var(--text-primary), transparent 95%);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        text-transform: uppercase;
    }
    .header-ctrl-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-primary);
    }
    .header-ctrl-btn.active {
        background: var(--accent-color);
        color: var(--text-on-accent, black);
        border-color: var(--accent-color);
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
        padding-right: 4px;
        transition: transform 0.2s;
        position: relative;
    }
    .cachy-logo:hover {
        transform: scale(1.1);
        filter: drop-shadow(0 0 5px var(--accent-color));
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
        top: 100%;
        left: 0;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 12px;
        z-index: 1000;
        min-width: 160px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
    }
    .resize-grip {
        position: absolute;
        z-index: 100;
    }
    .resize-grip.n,
    .resize-grip.s {
        height: 8px;
        left: 8px;
        right: 8px;
        cursor: ns-resize;
    }
    .resize-grip.e,
    .resize-grip.w {
        width: 8px;
        top: 8px;
        bottom: 8px;
        cursor: ew-resize;
    }
    .resize-grip.n {
        top: -4px;
    }
    .resize-grip.s {
        bottom: -4px;
    }
    .resize-grip.e {
        right: -4px;
    }
    .resize-grip.w {
        left: -4px;
    }
    .resize-grip.nw,
    .resize-grip.ne,
    .resize-grip.sw,
    .resize-grip.se {
        width: 12px;
        height: 12px;
    }
    .resize-grip.nw {
        top: -4px;
        left: -4px;
        cursor: nwse-resize;
    }
    .resize-grip.ne {
        top: -4px;
        right: -4px;
        cursor: nesw-resize;
    }
    .resize-grip.sw {
        bottom: -4px;
        left: -4px;
        cursor: nesw-resize;
    }
    .resize-grip.se {
        bottom: -4px;
        right: -4px;
        cursor: nwse-resize;
    }
</style>
