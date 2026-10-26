/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * Magnetic edge snapping for floating windows (FEAT-0616, extended by
 * FEAT-0738).
 *
 * Pure geometry plus a thin DOM adapter, deliberately separate from
 * `WindowFrame.svelte`: the drag gesture, the preview and the persisted
 * pin state all consume the same numbers, and the frame is already a large
 * file.
 *
 * The snap area is the viewport minus the shell surfaces a window must not
 * cover: the visible sidebars, the PWA window-controls titlebar and the
 * minimized-window dock on whichever side it currently sits.
 */

/** Fixed magnetic threshold; recorded in FEAT-0616 and unchanged here. */
export const SNAP_EDGE_THRESHOLD_PX = 48;

/** A half or a quarter of the usable viewport. */
export const SNAP_ZONES = [
    "left",
    "right",
    "top",
    "bottom",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
] as const;

export type SnapZone = (typeof SNAP_ZONES)[number];

/** Keyboard direction; the arrow names become zones through `nextSnapZone`. */
export type SnapDirection = "left" | "right" | "up" | "down";

/** Space occupied by app chrome, in CSS pixels. */
export interface SnapInsets {
    /** Distance from the viewport left edge to the usable area. */
    left: number;
    /** Distance from the viewport right edge to the usable area. */
    right: number;
    /** Distance from the viewport top edge to the usable area. */
    top?: number;
    /** Distance from the viewport bottom edge to the usable area. */
    bottom?: number;
}

export interface SnapGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The rectangle left for windows after the shell chrome. */
export interface SnapBounds {
    /** Absolute viewport x of the usable left edge. */
    left: number;
    /** Absolute viewport x of the usable right edge (not an inset distance). */
    right: number;
    /** Absolute viewport y of the usable top edge. */
    top: number;
    /** Absolute viewport y of the usable bottom edge (not an inset distance). */
    bottom: number;
}

export function getUsableBounds(
    viewportWidth: number,
    viewportHeight: number,
    insets: SnapInsets,
): SnapBounds {
    const left = Math.max(0, Math.min(viewportWidth, insets.left));
    const right = Math.max(
        left,
        Math.min(viewportWidth, viewportWidth - insets.right),
    );
    const top = Math.max(0, Math.min(viewportHeight, insets.top ?? 0));
    const bottom = Math.max(
        top,
        Math.min(viewportHeight, viewportHeight - (insets.bottom ?? 0)),
    );
    return { left, right, top, bottom };
}

const SNAP_ZONE_SET: ReadonlySet<string> = new Set(SNAP_ZONES);

/** Narrows a persisted `pinSide` without trusting JSON. */
export function isSnapZone(value: unknown): value is SnapZone {
    return typeof value === "string" && SNAP_ZONE_SET.has(value);
}

/**
 * Pointer near an edge or a corner. Corners win when both axes are in range;
 * with sidebars visible the zone starts after them, even though the pointer
 * that triggers it is still near the physical edge.
 */
export function detectSnapZone(
    pointerX: number,
    pointerY: number,
    viewportWidth: number,
    viewportHeight: number,
    threshold: number = SNAP_EDGE_THRESHOLD_PX,
): SnapZone | null {
    if (
        !Number.isFinite(pointerX) ||
        !Number.isFinite(pointerY) ||
        !Number.isFinite(viewportWidth) ||
        !Number.isFinite(viewportHeight)
    ) {
        return null;
    }
    if (viewportWidth <= 0 || viewportHeight <= 0) return null;

    const nearLeft = pointerX <= threshold;
    const nearRight = pointerX >= viewportWidth - threshold;
    const nearTop = pointerY <= threshold;
    const nearBottom = pointerY >= viewportHeight - threshold;

    if (nearTop && nearLeft) return "top-left";
    if (nearTop && nearRight) return "top-right";
    if (nearBottom && nearLeft) return "bottom-left";
    if (nearBottom && nearRight) return "bottom-right";
    if (nearLeft) return "left";
    if (nearRight) return "right";
    if (nearTop) return "top";
    if (nearBottom) return "bottom";
    return null;
}

/**
 * Keyboard state machine for the snap gesture. A perpendicular arrow refines
 * a half into a corner; an arrow on a corner collapses it back to the half on
 * that axis. The result is a pure function so the gesture cannot drift from
 * the geometry it feeds.
 */
export function nextSnapZone(
    current: SnapZone | "none",
    direction: SnapDirection,
): SnapZone {
    if (direction === "left" || direction === "right") {
        if (current === "top") {
            return direction === "left" ? "top-left" : "top-right";
        }
        if (current === "bottom") {
            return direction === "left" ? "bottom-left" : "bottom-right";
        }
        return direction;
    }

    if (current === "left") {
        return direction === "up" ? "top-left" : "bottom-left";
    }
    if (current === "right") {
        return direction === "up" ? "top-right" : "bottom-right";
    }
    return direction === "up" ? "top" : "bottom";
}

/**
 * Half or quarter of the usable viewport. `minWidth`/`minHeight` are applied
 * last because a window's own minimum is a hard floor even when it makes the
 * zone larger than the available area.
 */
export function computeSnapGeometry(
    zone: SnapZone,
    viewportWidth: number,
    viewportHeight: number,
    insets: SnapInsets,
    minWidth = 0,
    minHeight = 0,
): SnapGeometry {
    const { left, right, top, bottom } = getUsableBounds(
        viewportWidth,
        viewportHeight,
        insets,
    );

    const availableWidth = right - left;
    const availableHeight = bottom - top;
    const fullWidth = Math.max(minWidth, availableWidth);
    const fullHeight = Math.max(minHeight, availableHeight);
    const leftWidth = Math.max(minWidth, Math.floor(availableWidth / 2));
    const rightWidth = Math.max(minWidth, availableWidth - leftWidth);
    const topHeight = Math.max(minHeight, Math.floor(availableHeight / 2));
    const bottomHeight = Math.max(minHeight, availableHeight - topHeight);

    switch (zone) {
        case "left":
            return {
                x: left,
                y: top,
                width: leftWidth,
                height: fullHeight,
            };
        case "right":
            return {
                x: Math.max(left, right - rightWidth),
                y: top,
                width: rightWidth,
                height: fullHeight,
            };
        case "top":
            return {
                x: left,
                y: top,
                width: fullWidth,
                height: topHeight,
            };
        case "bottom":
            return {
                x: left,
                y: Math.max(top, bottom - bottomHeight),
                width: fullWidth,
                height: bottomHeight,
            };
        case "top-left":
            return {
                x: left,
                y: top,
                width: leftWidth,
                height: topHeight,
            };
        case "top-right":
            return {
                x: Math.max(left, right - rightWidth),
                y: top,
                width: rightWidth,
                height: topHeight,
            };
        case "bottom-left":
            return {
                x: left,
                y: Math.max(top, bottom - bottomHeight),
                width: leftWidth,
                height: bottomHeight,
            };
        case "bottom-right":
            return {
                x: Math.max(left, right - rightWidth),
                y: Math.max(top, bottom - bottomHeight),
                width: rightWidth,
                height: bottomHeight,
            };
    }
}

/** Reads the shell surfaces; missing or hidden elements are zero. */
export function readShellInsets(): SnapInsets {
    if (typeof document === "undefined" || typeof window === "undefined") {
        return { left: 0, right: 0, top: 0, bottom: 0 };
    }

    const read = (side: "left" | "right"): DOMRect | null => {
        const element = document.querySelector<HTMLElement>(
            `[data-snap-sidebar="${side}"]`,
        );
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 ? rect : null;
    };

    const leftRect = read("left");
    const rightRect = read("right");

    let top = 0;
    const titlebar = document.querySelector<HTMLElement>("#wco-titlebar");
    if (titlebar) {
        const rect = titlebar.getBoundingClientRect();
        if (rect.height > 0) {
            // Use the bottom edge: the titlebar can start below the viewport
            // top (env(titlebar-area-y)), and a top dock can overlap it.
            const edge = Math.max(
                Number.isFinite(rect.bottom) ? rect.bottom : 0,
                rect.height,
            );
            top = Math.max(top, edge);
        }
    }

    let bottom = 0;
    const dock = document.querySelector<HTMLElement>(".minimized-dock");
    if (dock) {
        const rect = dock.getBoundingClientRect();
        if (rect.height > 0) {
            if (dock.classList.contains("dock-top")) {
                const edge = Math.max(
                    Number.isFinite(rect.bottom) ? rect.bottom : 0,
                    rect.height,
                );
                top = Math.max(top, edge);
            } else {
                bottom = rect.height;
            }
        }
    }

    return {
        left: leftRect
            ? Math.max(0, Math.min(window.innerWidth, leftRect.right))
            : 0,
        right: rightRect
            ? Math.max(
                  0,
                  Math.min(
                      window.innerWidth,
                      window.innerWidth - rightRect.left,
                  ),
              )
            : 0,
        top: Math.max(0, Math.min(window.innerHeight, top)),
        bottom: Math.max(0, Math.min(window.innerHeight, bottom)),
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
