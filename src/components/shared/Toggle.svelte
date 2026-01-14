<script lang="ts">
  import { createBubbler } from 'svelte/legacy';

  const bubble = createBubbler();
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    id?: string;
  }

  let { checked = $bindable(false), disabled = false, id = "toggle-" + Math.random().toString(36).substr(2, 9) }: Props = $props();
</script>

<div class="toggle-wrapper" class:disabled>
  <input type="checkbox" {id} bind:checked {disabled} onchange={bubble('change')} />
  <label for={id}>
    <span class="toggle-slider"></span>
  </label>
</div>

<style>
  .toggle-wrapper {
    display: inline-block;
    position: relative;
    width: 36px;
    height: 20px;
  }

  .toggle-wrapper input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-wrapper label {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-color);
    transition: 0.4s;
    border-radius: 20px;
  }

  .toggle-slider {
    position: absolute;
    height: 14px;
    width: 14px;
    left: 2px;
    bottom: 2px;
    background-color: var(--text-secondary);
    transition: 0.4s;
    border-radius: 50%;
  }

  input:checked + label {
    background-color: var(--accent-color);
    border-color: var(--accent-color);
  }

  input:checked + label .toggle-slider {
    transform: translateX(16px);
    background-color: var(--btn-accent-text);
  }

  .disabled {
    opacity: 0.5;
    pointer-events: none;
  }
</style>
