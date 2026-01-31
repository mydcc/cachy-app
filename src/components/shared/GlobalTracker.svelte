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

<script lang="ts">
  import { trackInteraction } from "../../services/trackingService";

  function handleGlobalClick(event: MouseEvent) {
    if ((event as any).__tracking_handled) return;

    let target = event.target as HTMLElement | null;
    let depth = 0;
    const maxDepth = 15; // Sufficient for deep component trees

    while (target && target !== document.body && depth < maxDepth) {
      // Opt-out mechanism
      if (target.dataset?.trackIgnore !== undefined) {
        return;
      }

      // 1. Explicit Tracking
      // Look for data-track-id on the element
      if (target.dataset?.trackId) {
        const id = target.dataset.trackId;
        // Parse context if available
        let context = {};
        const contextStr = target.dataset.trackContext;
        if (contextStr) {
          try {
            context = JSON.parse(contextStr);
          } catch (e) {
            // Silently fail on invalid JSON to prevent console spam
          }
        }

        trackInteraction(id, "click", context);
        (event as any).__tracking_handled = true;
        return;
      }

      // 2. Heuristic Tracking for key interactive elements
      // If we clicked a button/link but it has no explicit ID, we still want to capture it
      // to ensure robust coverage even if developers forget to add data-track-id.
      const tagName = target.tagName;
      if (
        ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "LABEL"].includes(
          tagName,
        )
      ) {
        // Generate a heuristic ID
        let label = "";
        if (tagName === "BUTTON" || tagName === "A" || tagName === "LABEL") {
          label =
            target.innerText ||
            target.getAttribute("aria-label") ||
            target.getAttribute("title") ||
            "";
        } else if (target instanceof HTMLInputElement) {
          label = target.name || target.id || target.type;
        }

        // Sanitize label
        label = label.replace(/[\n\r\t]+/g, " ").trim().slice(0, 50);

        const autoId = `Auto:${tagName}:${label || "Unnamed"}`;

        trackInteraction(autoId, "click", {
          auto: true,
          path: getDomPath(target),
        });
        (event as any).__tracking_handled = true;
        return;
      }

      target = target.parentElement;
      depth++;
    }
  }

  function getDomPath(el: HTMLElement): string {
    const stack = [];
    let curr: HTMLElement | null = el;
    let i = 0;
    while (curr && curr !== document.body && i < 4) {
      let name = curr.tagName.toLowerCase();
      if (curr.id) name += "#" + curr.id;
      else if (
        curr.className &&
        typeof curr.className === "string" &&
        curr.className.trim()
      ) {
        // Add first class for context
        const firstClass = curr.className.split(" ")[0];
        if (firstClass) name += "." + firstClass;
      }
      stack.unshift(name);
      curr = curr.parentElement;
      i++;
    }
    return stack.join(" > ");
  }
</script>

<svelte:window onclick={handleGlobalClick} />
