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
  FEAT-0617 — the splitter between the left sidebar and the calculator.

  A `role="separator"` with `aria-valuenow` is the ARIA window-splitter pattern:
  the handle is focusable, Arrow keys move it by one step, Home/End jump to the
  bounds. Pointer dragging is the convenience, not the only path — the width is
  a persisted preference, and a pointer-only control would put it out of reach
  for keyboard users.
-->
<script lang="ts">
    interface Props {
        width: number;
        min: number;
        max: number;
        step: number;
        label: string;
        /** The width a reset returns to; also decides whether reset is shown. */
        defaultWidth: number;
        resetLabel: string;
        /** Live preview while dragging; the caller owns the storage write. */
        onResize: (width: number) => void;
        /** Pointer released or a key pressed: persist this value. */
        onCommit: (width: number) => void;
    }

    let {
        width,
        min,
        max,
        step,
        label,
        defaultWidth,
        resetLabel,
        onResize,
        onCommit,
    }: Props = $props();

    let dragging = $state(false);
    let startX = 0;
    let startWidth = 0;
    /** Latest previewed width; the prop may lag one flush behind a move. */
    let dragWidth = 0;

    function clamp(value: number): number {
        return Math.min(max, Math.max(min, Math.round(value)));
    }

    function commit(value: number) {
        const next = clamp(value);
        onResize(next);
        onCommit(next);
    }

    function handlePointerDown(event: PointerEvent) {
        if (event.button !== 0) return;
        dragging = true;
        startX = event.clientX;
        startWidth = width;
        dragWidth = width;
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        event.preventDefault();
    }

    function handlePointerMove(event: PointerEvent) {
        if (!dragging) return;
        dragWidth = clamp(startWidth + (event.clientX - startX));
        onResize(dragWidth);
    }

    function handlePointerUp(event: PointerEvent) {
        if (!dragging) return;
        dragging = false;
        (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
        onCommit(dragWidth);
    }

    function handleKeyDown(event: KeyboardEvent) {
        const next: Record<string, number> = {
            ArrowLeft: width - step,
            ArrowRight: width + step,
            Home: min,
            End: max,
        };
        const value = next[event.key];
        if (value === undefined) return;
        event.preventDefault();
        commit(value);
    }
</script>

<!--
  A focusable `separator` with `aria-valuenow` is the ARIA window-splitter
  widget. Svelte's role table treats every separator as static structure, so
  both rules fire on the pattern the spec prescribes.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
    class="sidebar-resize-handle"
    class:dragging
    role="separator"
    aria-orientation="vertical"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={Math.round(width)}
    tabindex="0"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    onkeydown={handleKeyDown}
></div>

{#if width !== defaultWidth}
    <!--
      Reset is a real button, not a double-click on the separator: the
      separator is already a widget, and a button keeps the control in the tab
      order so a keyboard user can undo a width they cannot drag back exactly.

      The zero-sized sticky anchor keeps the button beside the divider while the
      shell scrolls; no width is added to the flex row, so the divider stays on
      the shell's edge.
    -->
    <div class="sidebar-reset-anchor">
        <button
            type="button"
            class="sidebar-reset"
            title={resetLabel}
            aria-label={resetLabel}
            onclick={() => commit(defaultWidth)}
        >
            <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
                <path d="M3 8a5 5 0 1 0 1.7-3.8" />
                <path d="M3 2.5V5h2.5" />
            </svg>
        </button>
    </div>
{/if}

<style>
    .sidebar-resize-handle {
        position: absolute;
        top: 2rem;
        bottom: 2rem;
        right: -3px;
        width: 6px;
        cursor: col-resize;
        /* A touch drag must resize, not scroll the page. */
        touch-action: none;
        border-radius: 3px;
        background: transparent;
        transition: background-color 120ms ease;
    }

    .sidebar-resize-handle:hover,
    .sidebar-resize-handle:focus-visible,
    .sidebar-resize-handle.dragging {
        background: var(--accent-color);
    }

    .sidebar-resize-handle:focus-visible {
        outline: 2px solid var(--accent-color);
        outline-offset: 2px;
    }

    /* Centred on the divider; the wrapper is the positioning context. */
    .sidebar-reset-anchor {
        position: sticky;
        top: 2rem;
        align-self: flex-start;
        width: 0;
        height: 0;
        z-index: 41;
    }

    .sidebar-reset {
        position: absolute;
        top: 0;
        left: -10px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.25rem;
        height: 1.25rem;
        padding: 0;
        border: 1px solid var(--border-color);
        border-radius: 9999px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        cursor: pointer;
    }

    .sidebar-reset:hover {
        color: var(--accent-color);
        border-color: var(--accent-color);
    }

    .sidebar-reset:focus-visible {
        outline: 2px solid var(--accent-color);
        outline-offset: 2px;
        color: var(--accent-color);
    }
</style>
