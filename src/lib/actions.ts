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

import { trackCustomEvent } from "../services/trackingService";

interface TrackClickParams {
  category: string;
  action: string;
  name: string;
}

export function trackClick(node: HTMLElement, params: TrackClickParams) {
  // Legacy attributes for reference (optional, but cleaner to remove to force migration to Data Layer)
  // node.setAttribute("data-mtm-category", params.category);
  // node.setAttribute("data-mtm-action", params.action);
  // node.setAttribute("data-mtm-name", params.name);

  let currentParams = params;

  function handleClick() {
    trackCustomEvent(
      currentParams.category,
      currentParams.action,
      currentParams.name,
    );
  }

  // Use event bubbling to capture clicks on child elements (like SVG icons)
  node.addEventListener("click", handleClick);

  return {
    update(newParams: TrackClickParams) {
      currentParams = newParams;
    },
    destroy() {
      node.removeEventListener("click", handleClick);
    },
  };
}
