<script lang="ts">
  import { settingsStore } from "../../stores/settingsStore";
  import {
    HOTKEY_ACTIONS,
    type HotkeyAction,
    normalizeKeyCombo,
  } from "../../services/hotkeyService";
  import { _ } from "../../locales/i18n";
  import { onMount, onDestroy } from "svelte";

  let customHotkeys = { ...$settingsStore.customHotkeys };
  let editingId: string | null = null;
  let conflictWarning: string | null = null;

  // Group actions by category
  const groupedActions: Record<string, HotkeyAction[]> = {};
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
      conflictWarning = `"${newCombo}" is already used by "${existingAction.label}"`;
      // We don't save yet, just warn.
      // Actually, usually it's better to just highlight the conflict or auto-unbind.
      // Let's simple allow overwrite for now but maybe show a visual indicator?
      // For this version: simple overwrite is fine, but let's confirm.
      if (
        !confirm(
          `"${newCombo}" is used by "${existingAction.label}". Overwrite?`
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
    settingsStore.update((s) => ({
      ...s,
      customHotkeys: { ...customHotkeys },
    }));

    stopEditing();
  }

  function resetToDefaults() {
    if (confirm("Reset all custom hotkeys to defaults?")) {
      customHotkeys = {};
      settingsStore.update((s) => ({
        ...s,
        customHotkeys: {},
      }));
    }
  }

  // Global listener for recording when editing
  function globalKeyHandler(e: KeyboardEvent) {
    if (editingId) {
      handleKeyDown(e);
    }
  }
</script>

<svelte:window on:keydown={globalKeyHandler} />

<div class="flex flex-col gap-4 h-full">
  <div class="flex justify-between items-center mb-2">
    <p class="text-xs text-[var(--text-secondary)]">
      Click on a key combination to record a new hotkey. Use <span
        class="text-[var(--accent-color)]">Alt</span
      >
      or <span class="text-[var(--accent-color)]">Ctrl</span> modifiers to avoid
      conflicts with typing.
    </p>
    <button
      class="text-xs text-[var(--danger-color)] hover:underline"
      on:click={resetToDefaults}
    >
      Reset All
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
                on:click={(e) => {
                  e.stopPropagation();
                  startEditing(action.id);
                }}
              >
                {editingId === action.id
                  ? "Press Key..."
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
      class="fixed bottom-4 right-4 bg-[var(--warning-color)] text-black px-4 py-2 rounded shadow-lg text-sm font-bold animate-bounce"
    >
      {conflictWarning}
    </div>
  {/if}
</div>
