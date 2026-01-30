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
        window.addEventListener("click", handler);
        return () => window.removeEventListener("click", handler);
    });

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

    function startResize(e: PointerEvent, direction: string) {
        e.stopPropagation();
        isResizing = true;

        const startWidth = win.width;
        const startHeight = win.height;
        const startX = win.x;
        const startY = win.y;
        const startPointerX = e.clientX;
        const startPointerY = e.clientY;

        const HEADER_HEIGHT = 41; // Constant height of the window header

        const onPointerMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - startPointerX;
            const dy = moveEvent.clientY - startPointerY;

            let newX = startX;
            let newY = startY;
            let newWidth = startWidth;
            let newHeight = startHeight;

            // Horizontal resizing
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

            // Vertical resizing
            if (direction.includes("s")) {
                newHeight = startHeight + dy;
            } else if (direction.includes("n")) {
                newHeight = startHeight - dy;
            }

            // --- ASPECT RATIO CONSTRAINTS (Content focused) ---
            if (win.aspectRatio) {
                const ratio = win.aspectRatio;

                if (direction === "e" || direction === "w") {
                    // Width dictates content height + header
                    newHeight = newWidth / ratio + HEADER_HEIGHT;
                } else if (direction === "s" || direction === "n") {
                    // Content height dictates width
                    const contentHeight = newHeight - HEADER_HEIGHT;
                    newWidth = contentHeight * ratio;
                } else {
                    // Corners: default to width as master
                    newHeight = newWidth / ratio + HEADER_HEIGHT;
                }

                // Adjust X/Y again if we are resizing from N or W
                if (direction.includes("n")) {
                    newY = startY + (startHeight - newHeight);
                }
                if (direction.includes("w")) {
                    newX = startX + (startWidth - newWidth);
                }
            }

            // Final Boundary Checks
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
    class:glass-morphism={win.enableGlassmorphism}
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
                                    ).closest(".window-frame") as HTMLElement;
                                    effectsState.triggerSmash(winEl, win.id);
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

            <div class="control-group">
                <button
                    onclick={(e) => {
                        e.stopPropagation();
                        // MVP: Feed fixed amount (e.g. 10 XP)
                        effectsState.triggerFeed(10);
                    }}
                    class="tool-btn success"
                    title="Feed Duck (Profit)">🍞</button
                >
            </div>

            <div class="divider"></div>

            <button
                onclick={() => windowManager.close(win.id)}
                class="close-btn"
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
        <!-- Invisible Resize Handles -->
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
        backdrop-filter: none;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.08);
        transition:
            box-shadow 0.2s ease,
            opacity 0.2s ease;
    }
    .window-frame.focused {
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.15); /* Grayed out instead of accent color */
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
        background: rgba(var(--bg-secondary-rgb, 15, 23, 42), 0.7);
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
        overflow-y: auto;
        overflow-x: hidden;
        position: relative;
        background: transparent;
        scrollbar-width: thin;
        scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.1))
            transparent;
    }

    /* Webkit Scrollbar Styling */
    .window-content::-webkit-scrollbar {
        width: 6px;
    }

    .window-content::-webkit-scrollbar-track {
        background: transparent;
    }

    .window-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        transition: background 0.2s;
    }

    .window-content:hover::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
    }

    .window-content::-webkit-scrollbar-thumb:hover {
        background: var(--accent-color, rgba(255, 255, 255, 0.3));
    }
    /* Resize Grips */
    .resize-grip {
        position: absolute;
        z-index: 100;
        background: transparent;
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
        cursor: pointer;
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
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .cachy-logo:hover {
        transform: scale(1.1);
        filter: drop-shadow(0 0 5px var(--accent-color));
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

    /* Local Settings Popup / Context Menu */
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
        transform-origin: top left;
    }
    .cachy-logo {
        position: relative;
        cursor: help;
    }
    .menu-divider {
        height: 1px;
        background: var(--border-color);
        margin: 8px -12px;
        opacity: 0.5;
    }
    .menu-item {
        width: 100%;
        text-align: left;
        padding: 8px;
        border-radius: 4px;
        background: none;
        border: none;
        color: var(--text-primary);
        font-size: 0.75rem;
        font-weight: bold;
        cursor: pointer;
        transition: background 0.2s;
    }
    .menu-item:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    .menu-item.danger {
        color: var(--danger-color);
    }
    .menu-item.danger:hover {
        background: color-mix(in srgb, var(--danger-color), transparent 80%);
    }
    .settings-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.75rem;
        color: var(--text-secondary);
        margin-bottom: 8px;
    }
    .settings-item.flex-row {
        flex-direction: row;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        cursor: pointer;
    }
    .settings-item span {
        white-space: nowrap;
    }
    .settings-item input[type="range"] {
        width: 100%;
    }
    .settings-item input[type="checkbox"] {
        cursor: pointer;
    }
</style>
