/*
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
*/

/**
 * Shared positioning helpers for the global order-details tooltip portal
 * rendered in +layout.svelte. OpenOrdersList (and any other disclosure
 * trigger) needs identical viewport-clamp math so a tooltip opened from a
 * keyboard focus or a viewport edge lands inside the viewport exactly like
 * a mouse hover does — a negative or off-screen coordinate made the
 * disclosure unreachable on small screens (BUG-0562).
 */

/** Stable id of the tooltip portal container while an order tooltip shows. */
export const ORDER_TOOLTIP_ID = "order-details-tooltip";

const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT = 400;
const EDGE_PADDING = 10;

/**
 * Clamp a desired tooltip top-left position so the tooltip stays inside
 * the viewport. The tooltip is offset to the bottom-right of the anchor
 * by default and flipped to the top-left side when it would overflow.
 */
export function clampTooltipPosition(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  let x = clientX + EDGE_PADDING;
  let y = clientY + EDGE_PADDING;

  if (x + TOOLTIP_WIDTH > viewportWidth)
    x = clientX - TOOLTIP_WIDTH - EDGE_PADDING;
  if (y + TOOLTIP_HEIGHT > viewportHeight)
    y = clientY - TOOLTIP_HEIGHT - EDGE_PADDING;

  return {
    x: Math.max(EDGE_PADDING, x),
    y: Math.max(EDGE_PADDING, y),
  };
}

/**
 * True when the node lives inside the mounted order-details tooltip.
 * Used to keep a disclosure open while the pointer or focus is inside
 * the tooltip itself (moving there must not count as "left the trigger").
 */
export function isInsideOrderTooltip(node: Node | null): boolean {
  const container = document.getElementById(ORDER_TOOLTIP_ID);
  return container !== null && node !== null && container.contains(node);
}
