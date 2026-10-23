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
 * FEAT-0617 — the left sidebar's width.
 *
 * The bounds are named constants because three consumers need the same answer:
 * the drag handle (live preview), the settings store (a stored value has to be
 * sanitized on load), and the reset control. A literal in each place is how the
 * clamp and the UI drift apart.
 */

/** The width the sidebar had before it became adjustable (`w-96`). */
export const SIDEBAR_WIDTH_DEFAULT = 384;

/**
 * Below this the positions table stops being usable: its numeric columns and
 * the symbol cell need the room. It is a layout floor, not a WCAG target.
 */
export const SIDEBAR_WIDTH_MIN = 280;

/**
 * Above this the calculator column starts losing its `max-w-3xl` on a 1280 px
 * viewport. The rendered width is capped again by the viewport (see the token's
 * `clamp()` in `+page.svelte`), so a wide monitor can use the full value.
 */
export const SIDEBAR_WIDTH_MAX = 640;

/** One Arrow key press. */
export const SIDEBAR_WIDTH_STEP = 16;

/**
 * Rounds a value into an arbitrary range. The handle needs the same rounding
 * and ordering as the stored-width clamp, but against the range the layout can
 * actually render at the current viewport (FEAT-0617 review).
 */
export function clampToRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Rounds a stored or dragged value into the supported range. Anything that is
 * not a finite number (a missing key from an older profile, a hand-edited blob)
 * falls back to the shipped default rather than reaching the layout as `NaN`.
 */
export function clampSidebarWidth(value: unknown): number {
  const width = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT;
  return clampToRange(width, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
}
