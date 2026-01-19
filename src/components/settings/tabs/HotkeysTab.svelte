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
  import HotkeySettings from "../HotkeySettings.svelte";
  import { settingsState } from "../../../stores/settings.svelte";
</script>

<div class="flex flex-col h-full" role="tabpanel" id="tab-hotkeys">
  {#if settingsState.hotkeyMode !== "custom"}
    <div
      class="flex flex-col items-center justify-center h-full p-6 text-center text-[var(--text-secondary)]"
    >
      <p class="mb-4">You are currently using a preset Hotkey Mode.</p>
      <button
        class="px-4 py-2 bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded font-bold text-sm"
        onclick={() => (settingsState.hotkeyMode = "custom")}
      >
        Switch to Custom Mode to Edit
      </button>
    </div>
  {:else}
    <HotkeySettings />
  {/if}
</div>
