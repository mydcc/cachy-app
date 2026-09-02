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
  import {
    computePosition,
    flip,
    shift,
    offset,
    arrow,
  } from "@floating-ui/dom";
  import { settingsState } from "../../stores/settings.svelte";

  interface Props {
    text?: string;
    underline?: boolean;
    children?: import("svelte").Snippet;
  }

  let { text = "", underline = true, children }: Props = $props();
  let visible = $state(false);
  const isEnabled = $derived(settingsState.showTooltips);
  let tooltipEl: HTMLElement | undefined = $state();
  let arrowEl: HTMLElement | undefined = $state();
  let triggerEl: HTMLElement | undefined = $state();
  // Cleanup logic moved to effect return

  function show() {
    if (!isEnabled) return;
    visible = true;
  }

  function hide() {
    visible = false;
  }

  async function updatePosition() {
    if (!triggerEl || !tooltipEl || !arrowEl) return;

    try {
      const result = await computePosition(
        triggerEl,
        tooltipEl,
        {
          placement: "top",
          middleware: [
            offset(10),
            flip(),
            shift({ padding: 8 }),
            arrow({ element: arrowEl }),
          ],
        },
      );

      if (!result) return;
      const { x, y, placement, middlewareData } = result;

      Object.assign(tooltipEl.style, {
        left: `${x}px`,
        top: `${y}px`,
      });

      // Position arrow
      const { x: arrowX, y: arrowY } = middlewareData.arrow || {};
      const side = placement.split("-")[0];

      const staticSideMap: Record<string, string> = {
        top: "bottom",
        right: "left",
        bottom: "top",
        left: "right",
      };

      const staticSide = staticSideMap[side];

      if (staticSide) {
        Object.assign(arrowEl.style, {
          left: arrowX != null ? `${arrowX}px` : "",
          top: arrowY != null ? `${arrowY}px` : "",
          [staticSide]: "-4px",
        });
      }
    } catch {
      // console.warn("Tooltip position error", e);
    }
  }

  $effect(() => {
    if (visible && triggerEl && tooltipEl) {
      updatePosition();
    }
    // Effect cleanup handles destruction implicitly for reactive bindings,
    // but if we had manual listeners we would return a cleanup function here.
  });
</script>

<span
  bind:this={triggerEl}
  class="tooltip-container"
  class:has-underline={underline && isEnabled}
  role={isEnabled ? "button" : undefined}
  tabindex={isEnabled ? 0 : undefined}
  onmouseenter={isEnabled ? show : undefined}
  onmouseleave={isEnabled ? hide : undefined}
  onfocusin={isEnabled ? show : undefined}
  onfocusout={isEnabled ? hide : undefined}
>
  {#if children}
    {@render children()}
  {/if}
  {#if isEnabled && visible && text}
    <div
      bind:this={tooltipEl}
      id="tooltip-text"
      role="tooltip"
      class="tooltip-content"
    >
      {text}
      <div bind:this={arrowEl} class="tooltip-arrow"></div>
    </div>
  {/if}
</span>

<style>
  .tooltip-container {
    position: relative;
    display: inline-flex;
    align-items: center;
    text-decoration: none;
    border-bottom: none;
  }
  .has-underline {
    cursor: help;
    border-bottom: 1px dashed color-mix(in srgb, var(--text-secondary) 50%, transparent);
    transition: border-color 0.15s ease, color 0.15s ease;
  }
  .has-underline:hover {
    border-bottom-color: var(--accent-color);
  }
  .tooltip-content {
    width: max-content;
    max-width: 240px;
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
    text-align: center;
    border-radius: var(--radius-md);
    padding: 0.4rem 0.65rem;
    position: absolute;
    z-index: 100;
    left: 0;
    top: 0;
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    box-shadow: var(--shadow-tooltip, 0 4px 12px rgba(0,0,0,0.3));
    border: 1px solid var(--border-color);
    pointer-events: none;
    text-transform: none;
    line-height: 1.35;
  }
  .tooltip-arrow {
    position: absolute;
    width: 6px;
    height: 6px;
    background-color: var(--bg-tertiary);
    transform: rotate(45deg);
    border: 1px solid var(--border-color);
    border-top: none;
    border-left: none;
  }
</style>
