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
  import { settingsState } from "../../stores/settings.svelte";
  import {
    HOTKEY_ACTIONS,
    type HotkeyAction,
    normalizeKeyCombo,
  } from "../../services/hotkeyService";
  import { _ } from "../../locales/i18n";
  import { onMount } from "svelte";
  import DOMPurify from "dompurify";

  let customHotkeys = { ...settingsState.customHotkeys };
  let editingId: string | null = $state(null);
  let conflictWarning: string | null = $state(null);

  // Group actions by category
  const groupedActions: Record<string, HotkeyAction[]> = $state({});
  HOTKEY_ACTIONS.forEach((action) => {
    if (!groupedActions[action.category]) {
      groupedActions[action.category] = [];
    }
    groupedActions[action.category].push(action);
  });

  const categories = Object.keys(groupedActions);

  function getDisplayKey(action: HotkeyAction): string {
    return customHotkeys[action.id] || action.defaultKey;
  }

  function startEditing(id: string) {
    editingId = id;
    conflictWarning = null;
  }

  function stopEditing() {
    editingId = null;
    conflictWarning = null;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!editingId) return;

    event.preventDefault();
    event.stopPropagation();

    // Allow cancelling with Escape
    if (event.key === "Escape") {
      stopEditing();
      return;
    }

    // Ignore modifier-only presses
    if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) {
      return;
    }

    const newCombo = normalizeKeyCombo(event);

    // Check for conflicts
    const existingAction = HOTKEY_ACTIONS.find((a) => {
      const key = customHotkeys[a.id] || a.defaultKey;
      return key === newCombo && a.id !== editingId;
    });

    if (existingAction) {
      conflictWarning = $_("settings.hotkeys.conflictWarning", {
        values: { newCombo, existingLabel: existingAction.label },
      });
      // We don't save yet, just warn.
      // Actually, usually it's better to just highlight the conflict or auto-unbind.
      // Let's simple allow overwrite for now but maybe show a visual indicator?
      // For this version: simple overwrite is fine, but let's confirm.
      if (
        !confirm(
          `"${newCombo}" is used by "${existingAction.label}". Overwrite?`,
        )
      ) {
        return;
      }
      // Unbind the other one (set it to empty or just let it be overwritten logically?
      // If we set it to empty, we need to handle that.
      // Better: update the map.
      customHotkeys[existingAction.id] = ""; // Or some unbound state
    }

    customHotkeys[editingId] = newCombo;

    // Update store immediately
    settingsState.customHotkeys = { ...customHotkeys };

    stopEditing();
  }

  function resetToDefaults() {
    if (confirm($_("settings.hotkeys.resetConfirm"))) {
      customHotkeys = {};
      settingsState.customHotkeys = {};
    }
  }

  // Global listener for recording when editing
  function globalKeyHandler(e: KeyboardEvent) {
    if (editingId) {
      handleKeyDown(e);
    }
  }

  onMount(() => {
    // Use capture phase to intercept keys before they trigger other actions
    window.addEventListener("keydown", globalKeyHandler, true);
    return () => {
      window.removeEventListener("keydown", globalKeyHandler, true);
    };
  });
</script>

<div class="flex flex-col gap-4 h-full">
  <div class="flex justify-between items-center mb-2">
    <p class="text-xs text-[var(--text-secondary)]">
      {@html DOMPurify.sanitize($_("settings.hotkeys.info", {
        values: {
          alt: $_("settings.hotkeys.modifierAlt"),
          ctrl: $_("settings.hotkeys.modifierCtrl"),
        },
      }))}
    </p>
    <button
      class="text-xs text-[var(--danger-color)] hover:underline"
      onclick={resetToDefaults}
    >
      {$_("settings.hotkeys.resetAll")}
    </button>
  </div>

  <div class="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-6">
    {#each categories as category}
      <div class="flex flex-col gap-2">
        <h4
          class="text-sm font-bold text-[var(--accent-color)] border-b border-[var(--border-color)] pb-1 mb-1"
        >
          {category}
        </h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each groupedActions[category] as action}
            <div
              class="flex justify-between items-center p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
            >
              <span class="text-sm">{action.label}</span>

              <button
                class="px-3 py-1 text-xs font-mono rounded border min-w-[80px] text-center transition-colors
                                {editingId === action.id
                  ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] animate-pulse'
                  : 'bg-[var(--bg-secondary)] border-[var(--border-color)] hover:border-[var(--text-secondary)]'}"
                onclick={(e) => {
                  e.stopPropagation();
                  startEditing(action.id);
                }}
              >
                {editingId === action.id
                  ? $_("settings.hotkeys.pressKey")
                  : getDisplayKey(action)}
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  {#if conflictWarning}
    <div
      class="fixed bottom-4 right-4 bg-[var(--warning-color)] text-black px-4 py-2 rounded shadow-lg text-sm font-bold animate-bounce z-[10000]"
    >
      {conflictWarning}
    </div>
  {/if}
</div>
