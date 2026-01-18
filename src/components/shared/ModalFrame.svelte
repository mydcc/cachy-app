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

<!-- @migration-task Error while migrating Svelte code: This migration would change the name of a slot (header-extra to header_extra) making the component unusable -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fly } from "svelte/transition";

  export let isOpen = false;
  export let title = "";
  export let extraClasses = "";
  export let alignment: "center" | "top" = "center";

  const dispatch = createEventDispatcher();

  function handleClose() {
    dispatch("close");
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="modal-overlay visible {alignment === 'top'
      ? 'items-start pt-20'
      : ''}"
    style={alignment === "top"
      ? "align-items: flex-start; padding-top: 10vh;"
      : ""}
    on:click|self={handleClose}
    on:keydown={(e) => {
      if (e.key === "Escape") handleClose();
    }}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <div
      class="modal-content {extraClasses}"
      transition:fly|local={{ y: -20, duration: 200 }}
    >
      <div class="modal-header">
        <h2 id="modal-title" class="modal-title">{title}</h2>
        <div class="header-extra">
          <slot name="header-extra" />
        </div>
        <button
          class="modal-close-btn"
          aria-label="Schließen"
          on:click={handleClose}>&times;</button
        >
      </div>
      <div class="modal-body">
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .modal-content {
    background-color: var(--bg-secondary);
    padding: 1.5rem;
    border-radius: 0.75rem;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 1rem;
    margin-bottom: 1rem;
    flex-shrink: 0;
    gap: 1rem;
  }
  .header-extra {
    flex: 1;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    overflow: hidden;
    margin-right: 0.5rem;
  }
  .modal-title {
    font-size: 1.25rem;
    font-weight: 600;
  }
  .modal-close-btn {
    font-size: 2rem;
    line-height: 1;
    cursor: pointer;
    background: none;
    border: none;
    color: var(--text-secondary);
  }
  .modal-body {
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }
</style>
