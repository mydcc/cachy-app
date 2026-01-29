<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { floatingWindowsStore } from "../../stores/floatingWindows.svelte";
    import type { FloatingWindow } from "../../stores/floatingWindows.svelte";
    import { _ } from "../../locales/i18n";
    import CachyIcon from "./CachyIcon.svelte";

    interface Props {
        window: FloatingWindow;
    }

    let { window: win }: Props = $props();

    let isDragging = $state(false);
    let isResizing = $state(false);
    let dragStartX = $state(0);
    let dragStartY = $state(0);
    let dragStartWindowX = $state(0);
    let dragStartWindowY = $state(0);
    let resizeStartWidth = $state(0);
    let resizeStartHeight = $state(0);
    let resizeStartX = $state(0);
    let resizeStartY = $state(0);

    let containerEl: HTMLDivElement | undefined = $state();
    let headerEl: HTMLDivElement | undefined = $state();

    function handleMouseDownDrag(e: MouseEvent) {
        if (e.button !== 0) return; // Nur linke Maustaste
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartWindowX = win.x;
        dragStartWindowY = win.y;
        floatingWindowsStore.focusWindow(win.id);
        e.preventDefault();
    }

    function handleMouseDownResize(e: MouseEvent) {
        if (e.button !== 0) return;
        isResizing = true;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartWidth = win.width;
        resizeStartHeight = win.height;
        floatingWindowsStore.focusWindow(win.id);
        e.preventDefault();
        e.stopPropagation();
    }

    function handleMouseMove(e: MouseEvent) {
        if (isDragging) {
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;
            const newX = Math.max(
                0,
                Math.min(
                    window.innerWidth - win.width,
                    dragStartWindowX + deltaX,
                ),
            );
            const newY = Math.max(
                0,
                Math.min(
                    window.innerHeight - win.height,
                    dragStartWindowY + deltaY,
                ),
            );
            floatingWindowsStore.updatePosition(win.id, newX, newY);
        } else if (isResizing) {
            const deltaX = e.clientX - resizeStartX;
            const deltaY = e.clientY - resizeStartY;
            const newWidth = Math.max(
                400,
                Math.min(window.innerWidth, resizeStartWidth + deltaX),
            );
            const newHeight = Math.max(
                300,
                Math.min(window.innerHeight, resizeStartHeight + deltaY),
            );
            floatingWindowsStore.updateSize(win.id, newWidth, newHeight);
        }
    }

    function handleMouseUp() {
        isDragging = false;
        isResizing = false;
    }

    function handleClose() {
        floatingWindowsStore.closeWindow(win.id);
    }

    function handleContainerClick() {
        floatingWindowsStore.focusWindow(win.id);
    }

    onMount(() => {
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    });
</script>

<svelte:window />

<div
    bind:this={containerEl}
    class="floating-iframe-modal"
    style:left="{win.x}px"
    style:top="{win.y}px"
    style:width="{win.width}px"
    style:height="{win.height}px"
    style:z-index={win.zIndex}
    onclick={handleContainerClick}
    onkeydown={(e) => e.key === "Enter" && handleContainerClick()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="window-title-{win.id}"
    tabindex="0"
>
    <div
        bind:this={headerEl}
        class="window-header"
        onmousedown={handleMouseDownDrag}
        role="toolbar"
        tabindex="-1"
    >
        <CachyIcon class="window-icon" />
        <h3 id="window-title-{win.id}" class="window-title">{win.title}</h3>
        <button
            class="window-close-btn"
            onclick={handleClose}
            aria-label={$_("common.close") || "Close"}
            type="button"
        >
            {$_("common.remove")}
        </button>
    </div>

    <div class="window-body">
        <iframe
            src={win.url}
            title={win.title}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            loading="lazy"
        ></iframe>
    </div>

    <button
        class="resize-handle"
        onmousedown={handleMouseDownResize}
        aria-label="Resize"
        type="button"
    >
        ⋰
    </button>
</div>

<style>
    .floating-iframe-modal {
        position: fixed;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        box-shadow: var(--shadow-popover);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: box-shadow 0.2s;
    }

    .floating-iframe-modal:hover {
        box-shadow: var(--shadow-modal);
    }

    .window-header {
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
        padding: 12px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        user-select: none;
    }

    .window-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    :global(.window-icon) {
        width: 18px;
        height: 18px;
        margin-right: 10px;
        color: var(--accent-color);
        transition: all
            var(
                --transition-bounce,
                0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)
            );
        flex-shrink: 0;
    }

    .window-header:hover :global(.window-icon) {
        transform: scale(1.2) rotate(8deg);
        filter: drop-shadow(0 0 8px var(--accent-color));
    }

    .window-close-btn {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
    }

    .window-close-btn:hover {
        background: var(--danger-color);
        color: white;
    }

    .window-body {
        flex: 1;
        position: relative;
        overflow: hidden;
    }

    .window-body iframe {
        width: 100%;
        height: 100%;
        border: none;
    }

    .resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: nwse-resize;
        background: transparent;
        border: none;
        color: var(--text-tertiary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        line-height: 1;
        opacity: 0.5;
        transition: opacity 0.2s;
    }

    .resize-handle:hover {
        opacity: 1;
    }
</style>
