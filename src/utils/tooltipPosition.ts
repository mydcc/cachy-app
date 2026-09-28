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
 * Shared positioning helpers for the pending-order details popover. Every
 * anchor path (pointer, focus, keyboard) uses the same clamp so the dialog
 * lands inside the viewport on small screens (BUG-0562).
 */

const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT = 400;
const EDGE_PADDING = 10;

/**
 * Clamp a desired popover top-left position so the dialog stays inside
 * the viewport. The tooltip is offset to the bottom-right of the anchor
 * by default and flipped to the top-left side when it would overflow.
 */
export function clampPopoverPosition(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  const width = Math.min(
    TOOLTIP_WIDTH,
    Math.max(0, viewportWidth - EDGE_PADDING * 2)
  );
  const height = Math.min(
    TOOLTIP_HEIGHT,
    Math.max(0, viewportHeight - EDGE_PADDING * 2)
  );
  const maxX = Math.max(EDGE_PADDING, viewportWidth - width - EDGE_PADDING);
  const maxY = Math.max(EDGE_PADDING, viewportHeight - height - EDGE_PADDING);
  let x = clientX + EDGE_PADDING;
  let y = clientY + EDGE_PADDING;

  if (x + width > viewportWidth - EDGE_PADDING) {
    x = clientX - width - EDGE_PADDING;
  }
  if (y + height > viewportHeight - EDGE_PADDING) {
    y = clientY - height - EDGE_PADDING;
  }

  return {
    x: Math.min(Math.max(EDGE_PADDING, x), maxX),
    y: Math.min(Math.max(EDGE_PADDING, y), maxY),
  };
}
