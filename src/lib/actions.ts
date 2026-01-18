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

// src/lib/actions.ts

interface TrackClickParams {
  category: string;
  action: string;
  name: string;
}

export function trackClick(node: HTMLElement, params: TrackClickParams) {
  node.setAttribute("data-mtm-category", params.category);
  node.setAttribute("data-mtm-action", params.action);
  node.setAttribute("data-mtm-name", params.name);

  return {
    destroy() {
      // No cleanup needed for this action
    },
  };
}
