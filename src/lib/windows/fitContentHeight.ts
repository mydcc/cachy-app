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

/*
 * BUG-0411 — one-shot content fit for dialog heights.
 *
 * Fixed pixel heights per dialog are guesses that rot (locales,
 * conditional rows, expanded sections), and continuously re-measuring
 * animates through the frame's 0.2s size transition. So WindowFrame
 * measures once synchronously at mount — before first paint — and never
 * touches the size again. Pure helper so the clamp math stays
 * unit-testable without a layout engine.
 */

export interface FitContentMeasurement {
    /** Full content height (scrollHeight of the inner content box). */
    contentHeight: number;
    /** Rendered header height (offsetHeight of .window-header). */
    headerHeight: number;
    /** Current viewport height — the dialog never exceeds it. */
    viewportHeight: number;
    /** Lower bound (the window's minHeight). */
    minHeight: number;
}

/**
 * Insurance for sub-pixel rounding and late font swaps. Deliberately
 * small: anything Piggybacking late content bigger than this scrolls
 * instead of reopening the size question.
 */
const SAFETY_MARGIN_PX = 4;
/** Breathing room to the viewport edges (mirrors the compact clamp). */
const VIEWPORT_MARGIN_PX = 16;

/**
 * Returns the window height that fits the measured content, or null when
 * nothing usable was laid out yet (caller keeps its fallback size).
 */
export function computeFittedHeight(m: FitContentMeasurement): number | null {
    if (!Number.isFinite(m.contentHeight) || m.contentHeight <= 0) return null;
    if (!Number.isFinite(m.viewportHeight) || m.viewportHeight <= 0) return null;

    const header =
        Number.isFinite(m.headerHeight) && m.headerHeight > 0 ? m.headerHeight : 0;
    const min = Number.isFinite(m.minHeight) && m.minHeight > 0 ? m.minHeight : 0;

    return Math.round(
        Math.min(
            Math.max(m.contentHeight + header + SAFETY_MARGIN_PX, min),
            m.viewportHeight - VIEWPORT_MARGIN_PX,
        ),
    );
}
