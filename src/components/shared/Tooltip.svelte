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

  interface Props {
    text?: string;
    children?: import("svelte").Snippet;
  }

  let { text = "", children }: Props = $props();
  let visible = $state(false);
  let tooltipEl: HTMLElement | undefined = $state();
  let arrowEl: HTMLElement | undefined = $state();
  let triggerEl: HTMLElement | undefined = $state();
  // Cleanup logic moved to effect return

  function show() {
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
    } catch (e) {
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

<div
  bind:this={triggerEl}
  class="tooltip-container"
  role="button"
  tabindex="0"
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
>
  {#if children}{@render children()}{:else}
    <span class="tooltip-trigger">?</span>
  {/if}
  {#if visible && text}
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
</div>

<style>
  .tooltip-container {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .tooltip-trigger {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 1rem;
    height: 1rem;
    border-radius: 9999px;
    background-color: var(--text-secondary);
    color: var(--bg-secondary);
    font-weight: bold;
    cursor: help;
    font-size: 0.75rem;
    margin-left: 0.25rem;
    line-height: 1rem;
  }
  .tooltip-content {
    width: 220px;
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
    text-align: center;
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    position: absolute;
    z-index: 100;
    left: 0;
    top: 0;
    font-size: 0.8rem;
    font-weight: 500;
    box-shadow: var(--shadow-tooltip);
    border: 2px solid var(--border-color);
    pointer-events: none;
    text-transform: none;
  }
  .tooltip-arrow {
    position: absolute;
    width: 8px;
    height: 8px;
    background-color: var(--bg-tertiary);
    transform: rotate(45deg);
    border: 2px solid var(--border-color);
    border-top: none;
    border-left: none;
  }
</style>
