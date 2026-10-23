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

  The parent measures the grid track and passes it as `max`, so the control
  never advertises a width the layout cannot render. When the track is not
  wider than the minimum the separator is not rendered at all: at that size
  there is nothing to drag.
-->
<script lang="ts">
    import { clampToRange } from "../../lib/layout/sidebar";

    interface Props {
        /** Rendered width; already capped to the track by the parent. */
        width: number;
        min: number;
        max: number;
        step: number;
        /** The width a reset returns to. */
        defaultWidth: number;
        /** True when the stored preference differs from the default. */
        showReset: boolean;
        label: string;
        resetLabel: string;
        /** Live preview while dragging; the caller owns the storage write. */
        onResize: (width: number) => void;
        /** Pointer released or a key pressed: persist this value. */
        onCommit: (width: number) => void;
        /** Gesture cancelled or control unmounted: drop the preview. */
        onCancel: () => void;
    }

    let {
        width,
        min,
        max,
        step,
        defaultWidth,
        showReset,
        label,
        resetLabel,
        onResize,
        onCommit,
        onCancel,
    }: Props = $props();

    let dragging = $state(false);
    let startX = 0;
    let startWidth = 0;
    /** Latest previewed width; the prop may lag one flush behind a move. */
    let dragWidth = 0;
    let separatorEl = $state<HTMLDivElement | null>(null);

    function clamp(value: number): number {
        return clampToRange(value, min, max);
    }

    function commit(value: number) {
        const next = clamp(value);
        onResize(next);
        onCommit(next);
    }

    function handlePointerDown(event: PointerEvent) {
        if (event.button !== 0) return;
        event.preventDefault();
        // preventDefault suppresses the compatibility mousedown focus; take it
        // explicitly so Arrow/Home/End work right after a drag.
        const target = event.currentTarget as HTMLElement;
        target.focus();
        dragging = true;
        startX = event.clientX;
        startWidth = width;
        dragWidth = width;
        try {
            target.setPointerCapture?.(event.pointerId);
        } catch {
            // The window listeners below still track the gesture; capture is
            // only an optimisation for pointers that leave the 24 px hit box.
        }
    }

    /**
     * Move/up live on the window, not the 6 px element: a pointer that leaves
     * the strip, a missing capture implementation or a cancelled touch must
     * not leave `dragging` stuck (which would resize on plain hover).
     */
    $effect(() => {
        if (!dragging) return;

        let finished = false;

        const move = (event: PointerEvent) => {
            dragWidth = clamp(startWidth + (event.clientX - startX));
            onResize(dragWidth);
        };
        const up = () => {
            finished = true;
            dragging = false;
            onCommit(dragWidth);
        };
        const cancel = () => {
            finished = true;
            dragging = false;
            onCancel();
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
        // A window that loses focus mid-drag never delivers pointerup.
        window.addEventListener("blur", cancel);

        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel);
            window.removeEventListener("blur", cancel);
            // Unmounted mid-drag: the parent still holds the preview.
            if (!finished) onCancel();
        };
    });

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

    function reset() {
        commit(defaultWidth);
        // The button unmounts with `showReset`; return focus to the separator
        // instead of dropping the keyboard user on <body>. The separator is not
        // the element being removed, so focusing it synchronously is safe.
        separatorEl?.focus();
    }
</script>

{#if max > min}
    <!--
      A focusable `separator` with `aria-valuenow` is the ARIA window-splitter
      widget. Svelte's role table treats every separator as static structure,
      so both rules fire on the pattern the spec prescribes.
    -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
        class="sidebar-resize-handle"
        bind:this={separatorEl}
        class:dragging
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(width)}
        aria-valuetext={`${Math.round(width)} px`}
        tabindex="0"
        onpointerdown={handlePointerDown}
        onkeydown={handleKeyDown}
    ></div>
{/if}

{#if showReset}
    <!--
      Reset is a real button, not a double-click on the separator: the
      separator is already a widget, and a button keeps the control in the tab
      order so a keyboard user can undo a width they cannot drag back exactly.

      It sits in the 24 px gap right of the divider, so it never covers the
      panel header's own controls.
    -->
    <div class="sidebar-reset-anchor">
        <button
            type="button"
            class="sidebar-reset"
            title={resetLabel}
            aria-label={resetLabel}
            onclick={reset}
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
        bottom: 0;
        right: -3px;
        z-index: 30;
        width: 6px;
        cursor: col-resize;
        /* A touch drag must resize, not scroll the page. */
        touch-action: none;
        border-radius: 3px;
        background: transparent;
        transition: background-color 120ms ease;
    }

    /* The visual bar stays 6 px; the target reaches the WCAG 2.5.8 24 px. */
    .sidebar-resize-handle::before {
        content: "";
        position: absolute;
        inset: 0 -9px;
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

    /* In the grid gap beside the divider; the shell is the positioning context. */
    .sidebar-reset-anchor {
        position: absolute;
        top: 0.25rem;
        right: -1.5rem;
        z-index: 31;
        width: 1.5rem;
        height: 1.5rem;
    }

    .sidebar-reset {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
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

    @media (prefers-reduced-motion: reduce) {
        .sidebar-resize-handle {
            transition: none;
        }
    }
</style>
