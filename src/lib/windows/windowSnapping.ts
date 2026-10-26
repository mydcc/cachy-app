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
 * Window-to-window alignment for a drag gesture (FEAT-0739).
 *
 * Pure geometry: the caller supplies the raw dragged rectangle, the other
 * visible windows and the shell insets. The screen-edge tiler owns the 48 px
 * magnetic band; this helper uses a smaller 12 px band and only runs when no
 * edge zone is active.
 */

import {
    getUsableBounds,
    type SnapGeometry,
    type SnapInsets,
} from "./snapping";

/** Alignment magnet, deliberately smaller than the 48 px screen-edge band. */
export const WINDOW_SNAP_THRESHOLD_PX = 12;

/** A visible window rectangle; identical to the tiler's geometry shape. */
export type WindowSnapTarget = SnapGeometry;

export interface WindowSnapResult {
    x: number;
    y: number;
}

function snapAxis(
    raw: number,
    candidates: readonly number[],
    threshold: number,
): number {
    let best = raw;
    let bestDistance = threshold + 1;

    for (const candidate of candidates) {
        if (!Number.isFinite(candidate)) continue;
        const distance = Math.abs(raw - candidate);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }

    return bestDistance <= threshold ? Math.round(best) : Math.round(raw);
}

/**
 * Returns the position the dragged window should use. Each axis snaps
 * independently to the nearest edge/center candidate within the threshold,
 * including the usable viewport centre. The screen centre is pushed first,
 * so it wins an exact tie; windows otherwise win by being nearer. The result
 * is not clamped to the usable bounds — `WindowBase.updatePosition` owns the
 * viewport clamp. When nothing is close, the raw position is returned
 * rounded.
 */
export function snapToWindows(
    rawX: number,
    rawY: number,
    width: number,
    height: number,
    others: readonly WindowSnapTarget[],
    viewportWidth: number,
    viewportHeight: number,
    insets: SnapInsets,
    threshold: number = WINDOW_SNAP_THRESHOLD_PX,
): WindowSnapResult {
    if (
        !Number.isFinite(rawX) ||
        !Number.isFinite(rawY) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        !Number.isFinite(viewportWidth) ||
        !Number.isFinite(viewportHeight) ||
        width <= 0 ||
        height <= 0 ||
        viewportWidth <= 0 ||
        viewportHeight <= 0
    ) {
        return {
            x: Number.isFinite(rawX) ? Math.round(rawX) : 0,
            y: Number.isFinite(rawY) ? Math.round(rawY) : 0,
        };
    }

    const bounds = getUsableBounds(viewportWidth, viewportHeight, insets);
    const xCandidates: number[] = [
        (bounds.left + bounds.right - width) / 2,
    ];
    const yCandidates: number[] = [
        (bounds.top + bounds.bottom - height) / 2,
    ];

    for (const other of others) {
        if (
            !Number.isFinite(other.x) ||
            !Number.isFinite(other.y) ||
            !Number.isFinite(other.width) ||
            !Number.isFinite(other.height) ||
            other.width <= 0 ||
            other.height <= 0
        ) {
            continue;
        }

        xCandidates.push(
            other.x,
            other.x + other.width,
            other.x - width,
            other.x + other.width - width,
            other.x + (other.width - width) / 2,
        );
        yCandidates.push(
            other.y,
            other.y + other.height,
            other.y - height,
            other.y + other.height - height,
            other.y + (other.height - height) / 2,
        );
    }

    return {
        x: snapAxis(rawX, xCandidates, threshold),
        y: snapAxis(rawY, yCandidates, threshold),
    };
}
