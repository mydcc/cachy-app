<script lang="ts">
  import { onMount, onDestroy } from "svelte";
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
  let cleanup: (() => void) | null = null;

  function show() {
    visible = true;
  }

  function hide() {
    visible = false;
  }

  async function updatePosition() {
    if (!triggerEl || !tooltipEl || !arrowEl) return;

    const { x, y, placement, middlewareData } = await computePosition(
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

    Object.assign(tooltipEl.style, {
      left: `${x}px`,
      top: `${y}px`,
    });

    // Position arrow
    const { x: arrowX, y: arrowY } = middlewareData.arrow || {};
    const staticSide = {
      top: "bottom",
      right: "left",
      bottom: "top",
      left: "right",
    }[placement.split("-")[0]]!;

    Object.assign(arrowEl.style, {
      left: arrowX != null ? `${arrowX}px` : "",
      top: arrowY != null ? `${arrowY}px` : "",
      [staticSide]: "-4px",
    });
  }

  $effect(() => {
    if (visible && triggerEl && tooltipEl) {
      updatePosition();
    }
  });

  onDestroy(() => {
    if (cleanup) cleanup();
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
