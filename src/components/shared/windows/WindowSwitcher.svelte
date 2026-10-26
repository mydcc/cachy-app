<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  FEAT-0737 — the keyboard window switcher.

  The browser cannot own Alt+Tab, so this is an in-app overlay on its own
  hotkey. It snapshots the open windows when it mounts: the list must not
  reorder under the pointer while the user cycles, and `bringToFront` only
  runs on commit.

  Modal and dialog windows are excluded by `getWindowSwitcherEntries`; they
  are blocking tasks, not part of the overlap the switcher exists for.
-->

<script lang="ts">
  import { tick } from "svelte";
  import { windowManager } from "../../../lib/windows/WindowManager.svelte";
  import { getWindowSwitcherEntries } from "../../../lib/windows/windowSwitcher";
  import { windowSwitcherState } from "../../../stores/windowSwitcher.svelte";
  import { _ } from "../../../locales/i18n";

  const titleId = "window-switcher-title";
  const hintId = "window-switcher-hint";
  const optionId = (index: number) => `window-switcher-option-${index}`;

  // A snapshot, not a $derived: opening the switcher freezes the order the
  // user is cycling through, even if focus/z-index changes mid-gesture.
  const entries = getWindowSwitcherEntries(windowManager.windows);

  const focusedIndex = entries.findIndex((win) => win.isFocused);
  let selectedIndex = $state(
    entries.length === 0
      ? -1
      : focusedIndex >= 0
        ? (focusedIndex + 1) % entries.length
        : 0,
  );

  let selected = $derived(
    selectedIndex >= 0 ? entries[selectedIndex] : undefined,
  );

  let listbox = $state<HTMLElement>();
  let panel = $state<HTMLElement>();

  // Cancel returns the keyboard to whatever had it before the overlay; commit
  // moves it to the selected frame instead.
  const previouslyFocused = document.activeElement as HTMLElement | null;

  function move(delta: number): void {
    if (entries.length === 0) return;
    selectedIndex = (selectedIndex + delta + entries.length) % entries.length;
  }

  function close(restoreFocus = true): void {
    windowSwitcherState.close();
    if (!restoreFocus) return;
    void tick().then(() => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    });
  }

  function commit(index = selectedIndex): void {
    const win = entries[index];
    if (!win) return;

    selectedIndex = index;
    if (win.isMinimized) win.restore();
    windowManager.bringToFront(win.id);
    close(false);

    void tick().then(() => {
      const frame = Array.from(
        document.querySelectorAll<HTMLElement>(".window-frame"),
      ).find((candidate) => candidate.dataset.windowId === win.id);
      frame?.focus();
    });
  }

  function handleKeydown(event: KeyboardEvent): void {
    // The overlay is modal for the keyboard: no global hotkey may fire while
    // it is open, so every key stops here. Escape/Tab/activation additionally
    // prevent their browser default where it would scroll or move focus.
    event.stopPropagation();

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      selectedIndex = entries.length > 0 ? 0 : -1;
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      selectedIndex = entries.length - 1;
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      listbox?.focus();
    }
  }

  $effect(() => {
    if (listbox) listbox.focus();
    else panel?.focus();

    window.addEventListener("keydown", handleKeydown, true);
    return () => window.removeEventListener("keydown", handleKeydown, true);
  });

  $effect(() => {
    if (selectedIndex < 0) return;
    document
      .getElementById(optionId(selectedIndex))
      ?.scrollIntoView?.({ block: "nearest" });
  });
</script>

<div class="switcher-root">
  <button
    type="button"
    class="switcher-backdrop"
    tabindex="-1"
    aria-label={$_("common.close")}
    onclick={() => close()}
  ></button>

  <div
    bind:this={panel}
    class="switcher-panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    aria-describedby={hintId}
    tabindex="-1"
  >
    <h2 id={titleId} class="switcher-title">{$_("windowSwitcher.title")}</h2>

    {#if entries.length === 0}
      <p class="switcher-empty">{$_("windowSwitcher.empty")}</p>
    {:else}
      <ul
        bind:this={listbox}
        class="switcher-list"
        role="listbox"
        tabindex="0"
        aria-labelledby={titleId}
        aria-activedescendant={selected ? optionId(selectedIndex) : undefined}
      >
        {#each entries as entry, index (entry.id)}
          <li
            id={optionId(index)}
            class="switcher-option"
            class:active={index === selectedIndex}
            role="option"
            tabindex="-1"
            aria-selected={index === selectedIndex}
            onclick={() => commit(index)}
            onkeydown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              commit(index);
            }}
            onmouseenter={() => (selectedIndex = index)}
          >
            <span class="switcher-option-title"
              >{entry.title || entry.windowType}</span
            >
            {#if entry.isMinimized}
              <span class="switcher-badge"
                >{$_("windowSwitcher.minimized")}</span
              >
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <p id={hintId} class="switcher-hint">{$_("windowSwitcher.hint")}</p>
  </div>
</div>

<style>
  .switcher-root {
    position: fixed;
    inset: 0;
    z-index: var(--z-window-switcher);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .switcher-backdrop {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    background: var(--overlay-color);
    pointer-events: auto;
  }

  .switcher-panel {
    position: relative;
    width: min(440px, calc(100vw - 2rem));
    max-height: min(70vh, 560px);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-modal);
    pointer-events: auto;
  }

  .switcher-panel:focus-visible {
    outline: 2px solid var(--accent-color);
    outline-offset: 2px;
  }

  .switcher-title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
  }

  .switcher-list {
    list-style: none;
    margin: 0;
    padding: 0.25rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    outline: none;
  }

  .switcher-list:focus-visible {
    outline: 2px solid var(--accent-color);
    outline-offset: 2px;
    border-radius: var(--radius-md);
  }

  .switcher-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .switcher-option.active {
    background: var(--bg-tertiary);
    color: var(--accent-color);
  }

  .switcher-option-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .switcher-badge {
    flex-shrink: 0;
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .switcher-hint,
  .switcher-empty {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .switcher-empty {
    color: var(--text-secondary);
  }
</style>
