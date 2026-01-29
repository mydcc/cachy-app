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
    style:left="{win.x}px"
    style:top="{win.y}px"
    style:width="{win.width}px"
    style:height="{win.height}px"
    style:z-index={win.zIndex}
    onpointerdown={handlePointerDown}
    use:burn={{ layer: "windows", intensity: win.isFocused ? 1.5 : 0.6 }}
>
    <div class="window-header" onpointerdown={startDrag}>
        <div class="header-content">
            <span class="window-title">{win.title}</span>
        </div>
        <div class="window-controls">
            <button
                onclick={() => windowManager.close(win.id)}
                class="close-btn"
                title={$_("common.remove")}
            >
                ✕
            </button>
        </div>
    </div>

    <div class="window-content">
        <win.component window={win} />
    </div>

    <div class="resize-handle" onpointerdown={startResize}></div>
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
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition:
            box-shadow 0.2s ease,
            opacity 0.2s ease;
    }
    .window-frame.focused {
        box-shadow: 0 15px 45px rgba(0, 0, 0, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .window-frame.dragging {
        opacity: 0.9;
        cursor: grabbing;
    }
    .window-header {
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.03);
        cursor: grab;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
        background: rgba(255, 68, 68, 0.2);
        color: #ff4444;
    }
</style>
