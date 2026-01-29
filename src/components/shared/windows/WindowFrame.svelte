<script lang="ts">
    import { windowManager } from "../../../lib/windows/WindowManager.svelte";
    import type { WindowBase } from "../../../lib/windows/WindowBase.svelte";
    import { burn } from "../../../actions/burn";
    import { _ } from "../../../locales/i18n";

    interface Props {
        window: WindowBase;
    }

    let { window: win }: Props = $props();

    let isDragging = $state(false);
    let isResizing = $state(false);

    function handlePointerDown(e: PointerEvent) {
        windowManager.bringToFront(win.id);
    }

    function startDrag(e: PointerEvent) {
        // Falls auf Controls geklickt wurde, kein Drag
        if ((e.target as HTMLElement).closest(".window-controls")) return;

        isDragging = true;
        const startX = e.clientX - win.x;
        const startY = e.clientY - win.y;

        const onPointerMove = (moveEvent: PointerEvent) => {
            win.updatePosition(
                moveEvent.clientX - startX,
                moveEvent.clientY - startY,
            );
        };

        const onPointerUp = () => {
            isDragging = false;
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", onPointerUp);
        };

        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
    }

    function startResize(e: PointerEvent) {
        isResizing = true;
        const startWidth = win.width;
        const startHeight = win.height;
        const startX = e.clientX;
        const startY = e.clientY;

        const onPointerMove = (moveEvent: PointerEvent) => {
            win.updateSize(
                startWidth + (moveEvent.clientX - startX),
                startHeight + (moveEvent.clientY - startY),
            );
        };

        const onPointerUp = () => {
            isResizing = false;
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", onPointerUp);
        };

        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="window-frame glass-panel"
    class:focused={win.isFocused}
    class:dragging={isDragging}
    class:transparent={win.isTransparent}
    style:left="{win.x}px"
    style:top="{win.y}px"
    style:width="{win.width}px"
    style:height="{win.height}px"
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
        onpointerdown={win.isDraggable ? startDrag : undefined}
        style:cursor={win.isDraggable ? "grab" : "default"}
    >
        <div class="header-content">
            {#if win.showCachyIcon}
                <div class="cachy-logo">
                    <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="var(--accent-color)"
                    >
                        <path
                            d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                        />
                    </svg>
                </div>
            {/if}
            <span class="window-title">{win.title}</span>
        </div>

        <div class="window-controls">
            {#if win.allowZoom}
                <div class="control-group">
                    <button onclick={() => win.zoomOut()} class="tool-btn"
                        >－</button
                    >
                    <span class="zoom-text"
                        >{Math.round(win.zoomLevel * 100)}%</span
                    >
                    <button onclick={() => win.zoomIn()} class="tool-btn"
                        >＋</button
                    >
                </div>
            {/if}

            {#if win.allowFontSize}
                <div class="control-group">
                    <button
                        onclick={() => win.setFontSize(win.fontSize - 1)}
                        class="tool-btn">A-</button
                    >
                    <button
                        onclick={() => win.setFontSize(win.fontSize + 1)}
                        class="tool-btn">A+</button
                    >
                </div>
            {/if}

            <div class="divider"></div>

            <button
                onclick={() => windowManager.close(win.id)}
                class="close-btn"
                title={$_("common.remove")}
            >
                ✕
            </button>
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
            <win.component window={win} />
        </div>
    </div>

    {#if win.isResizable}
        <div class="resize-handle" onpointerdown={startResize}></div>
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
        background: var(--bg-secondary-80);
        backdrop-filter: blur(16px);
        box-shadow: var(--shadow-popover);
        border: 1px solid var(--border-glass-light);
        transition:
            box-shadow 0.2s ease,
            opacity 0.2s ease;
    }
    .window-frame.focused {
        box-shadow: var(--shadow-modal);
        border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .window-frame.dragging {
        opacity: 0.9;
        cursor: grabbing;
    }
    .window-frame.transparent {
        background: transparent;
        backdrop-filter: none;
        border: none;
        box-shadow: none;
    }
    .window-header {
        padding: 8px 12px;
        background: var(--bg-glass-light);
        cursor: grab;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
        border-bottom: 1px solid var(--bg-glass-light);
    }
    .header-content {
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
    .window-content {
        flex: 1;
        overflow: auto;
        position: relative;
        background: rgba(0, 0, 0, 0.1);
    }
    .resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 16px;
        height: 16px;
        cursor: nwse-resize;
        z-index: 10;
    }
    .window-controls {
        display: flex;
        gap: 4px;
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
    }
    .control-group {
        display: flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.05);
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
        background: rgba(255, 255, 255, 0.1);
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
</style>
