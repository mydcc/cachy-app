/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Magnetic edge snapping for floating windows (FEAT-0616).
 *
 * Pure geometry plus a thin DOM adapter, deliberately separate from
 * `WindowFrame.svelte`: the drag gesture, the preview and the persisted
 * pin state all consume the same numbers, and the frame is already a large
 * file. Only left/right half-tiling is implemented; top/bottom are deferred
 * because the app shell has no vertical sidebars and the top bar would need
 * its own collision rule.
 */

/** Fixed magnetic threshold; recorded in FEAT-0616. */
export const SNAP_EDGE_THRESHOLD_PX = 48;

export type SnapSide = "left" | "right";

/** Space occupied by the app shell's sidebars, in CSS pixels. */
export interface SnapInsets {
    /** Distance from the viewport left edge to the usable area. */
    left: number;
    /** Distance from the viewport right edge to the usable area. */
    right: number;
}

export interface SnapGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Pointer near either viewport edge. The target zone is computed separately:
 * with sidebars visible the zone starts after them, even though the pointer
 * that triggers it is still near the physical edge.
 */
export function detectSnapSide(
    pointerX: number,
    viewportWidth: number,
    threshold: number = SNAP_EDGE_THRESHOLD_PX,
): SnapSide | null {
    if (!Number.isFinite(pointerX) || !Number.isFinite(viewportWidth)) {
        return null;
    }
    if (viewportWidth <= 0) return null;
    if (pointerX <= threshold) return "left";
    if (pointerX >= viewportWidth - threshold) return "right";
    return null;
}

/**
 * Half of the usable viewport, inset by the visible sidebars. `minWidth` is
 * applied last because a window's own minimum is a hard floor even when it
 * makes the half wider than the available area.
 */
export function computeSnapGeometry(
    side: SnapSide,
    viewportWidth: number,
    viewportHeight: number,
    insets: SnapInsets,
    minWidth = 0,
): SnapGeometry {
    const left = Math.max(0, Math.min(viewportWidth, insets.left));
    const right = Math.max(
        left,
        Math.min(viewportWidth, viewportWidth - insets.right),
    );
    const available = right - left;
    const width = Math.max(minWidth, Math.round(available / 2));

    return {
        x: side === "left" ? left : right - width,
        y: 0,
        width,
        height: viewportHeight,
    };
}

/** Reads the shell's sidebar elements; missing or hidden elements are zero. */
export function readShellInsets(): SnapInsets {
    if (typeof document === "undefined" || typeof window === "undefined") {
        return { left: 0, right: 0 };
    }

    const read = (side: SnapSide): DOMRect | null => {
        const element = document.querySelector<HTMLElement>(
            `[data-snap-sidebar="${side}"]`,
        );
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 ? rect : null;
    };

    const leftRect = read("left");
    const rightRect = read("right");
    return {
        left: leftRect ? Math.max(0, Math.min(window.innerWidth, leftRect.right)) : 0,
        right: rightRect
            ? Math.max(0, Math.min(window.innerWidth, window.innerWidth - rightRect.left))
            : 0,
    };
}

/** True when a keyboard shortcut would type into a field instead of acting. */
export function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element?.closest) return false;
    return !!element.closest(
        "input, textarea, select, [contenteditable='true']",
    );
}
