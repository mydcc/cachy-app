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
  import { _ } from "../../../locales/i18n";

  interface Props {
    isPro: boolean;
    onBackup: () => void;
    onRestore: (e: Event) => void;
    onReset: () => void;
  }

  let { isPro, onBackup, onRestore, onReset }: Props = $props();
</script>

<div class="flex flex-col gap-6" role="tabpanel" id="tab-system">
  <div
    class="p-5 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-2"
  >
    <h4 class="text-sm font-bold">CachyLog Debug</h4>
    <p class="text-sm text-[var(--text-secondary)] mb-2">
      Trigger a test log on the server to verify browser console logging (CL:
      prefix).
    </p>
    <button
      class="btn btn-secondary text-base w-full py-3"
      onclick={() => fetch("/api/test-log", { method: "POST" })}
    >
      Trigger Server Log
    </button>
  </div>
  <div
    class="p-5 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-2"
  >
    <h4 class="text-sm font-bold">
      {$_("settings.backup")}
    </h4>
    <p class="text-sm text-[var(--text-secondary)] mb-2">
      Save all your settings, presets, and journal entries to a file.
    </p>
    <button
      class="btn btn-secondary text-base w-full py-3"
      onclick={onBackup}
      disabled={!isPro}
    >
      {$_("app.backupButtonAriaLabel")}
      {!isPro ? "(Pro only)" : ""}
    </button>
  </div>
  <div
    class="p-5 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-2"
  >
    <h4 class="text-sm font-bold">
      {$_("settings.restore")}
    </h4>
    <p class="text-sm text-[var(--text-secondary)] mb-2">
      Overwrite current data with a backup file.
    </p>
    <label class="btn btn-secondary text-sm w-full cursor-pointer text-center">
      {$_("app.restoreButtonAriaLabel")}
      <input
        id="restore-file"
        name="restoreFile"
        type="file"
        accept=".json"
        class="hidden"
        onchange={onRestore}
      />
    </label>
  </div>
  <div class="mt-6 p-4 border-2 border-red-500/30 rounded-xl bg-red-500/5">
    <h4 class="text-sm font-bold text-red-400 mb-2">Danger Zone</h4>
    <p class="text-xs text-red-300 mb-3">
      This action is irreversible and will delete all your data.
    </p>
    <button
      class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-bold text-sm w-full"
      onclick={onReset}
    >
      {$_("settings.reset")}
    </button>
  </div>
</div>
