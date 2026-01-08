<script lang="ts">
  export let text = '';
  export let alignment: 'center' | 'left' | 'right' = 'center';
  let visible = false;
  let tooltipEl: HTMLElement;

  function show() {
    visible = true;
  }

  function hide() {
    visible = false;
  }
</script>

<div
  class="tooltip-container"
  role="button"
  tabindex="0"
  on:mouseenter={show}
  on:mouseleave={hide}
  on:focusin={show}
  on:focusout={hide}
>
  <slot>
    <span class="tooltip-trigger">?</span>
  </slot>
  {#if visible && text}
    <div
      bind:this={tooltipEl}
      id="tooltip-text"
      role="tooltip"
      class="tooltip-content {alignment}"
    >
      {text}
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
    z-index: 10;
    bottom: 140%;
    font-size: 0.8rem;
    font-weight: 500;
    box-shadow: var(--shadow-tooltip);
    border: 2px solid var(--border-color);
    pointer-events: none;
    text-transform: none;
  }

  .tooltip-content.center {
    left: 50%;
    transform: translateX(-50%);
  }

  .tooltip-content.left {
    left: -0.5rem;
    transform: none;
  }

  .tooltip-content.right {
    right: -0.5rem;
    transform: none;
  }

  .tooltip-content::after {
    content: "";
    position: absolute;
    top: 100%;
    border-width: 5px;
    border-style: solid;
    border-color: var(--bg-tertiary) transparent transparent transparent;
  }

  .tooltip-content.center::after {
    left: 50%;
    margin-left: -5px;
  }

  .tooltip-content.left::after {
    left: 0.6rem;
    margin-left: -5px;
  }

  .tooltip-content.right::after {
    right: 0.6rem;
    margin-right: -5px;
  }
</style>
