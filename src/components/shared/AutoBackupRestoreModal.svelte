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
  import { autoBackupState, restoreFromOpfs, dismissOpfsRestore } from "../../services/autoBackupService.svelte";
  import { _ } from "../../locales/i18n";
  import { scale, fade } from "svelte/transition";

  let errorMessage = $state<string | null>(null);

  const pending = $derived(autoBackupState.pendingRestore);

  async function handleRestore() {
    errorMessage = null;
    const res = await restoreFromOpfs();
    if (!res.success) {
      errorMessage = res.message;
    }
  }

  function handleDismiss() {
    dismissOpfsRestore();
  }

  function formatDate(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return isoString;
    }
  }
</script>

{#if pending}
  <div
    class="fixed inset-0 bg-black/70 backdrop-blur-sm z-[var(--z-modal)] flex items-center justify-center p-4"
    transition:fade={{ duration: 200 }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="auto-backup-restore-title"
  >
    <div
      class="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl shadow-2xl max-w-lg w-full p-6 text-[var(--text-primary)] flex flex-col gap-5"
      transition:scale={{ start: 0.95, duration: 200 }}
    >
      <!-- Header -->
      <div class="flex items-start gap-4">
        <div class="p-3 bg-[var(--accent-color)]/10 text-[var(--accent-color)] rounded-xl shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
        </div>
        <div>
          <h2 id="auto-backup-restore-title" class="text-xl font-bold text-[var(--text-primary)]">
            {$_("app.autoBackup.restoreTitle") || "Recover Local Data"}
          </h2>
          <p class="text-xs text-[var(--text-secondary)] mt-1">
            {$_("app.autoBackup.restoreSubtitle") || "An automatic safety snapshot was found on this device."}
          </p>
        </div>
      </div>

      <!-- Description -->
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
        {$_("app.autoBackup.restoreDescription") || "It looks like your browser storage was recently cleared or reset. We found an automatic local backup (OPFS) that can restore your trade journal, presets, and settings."}
      </p>

      <!-- Snapshot details card -->
      <div class="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between text-xs pb-2 border-b border-[var(--border-primary)]">
          <span class="text-[var(--text-secondary)]">{$_("app.autoBackup.snapshotDate") || "Snapshot Date"}:</span>
          <span class="font-semibold text-[var(--text-primary)]">{formatDate(pending.timestamp)}</span>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="flex items-center gap-2 text-[var(--text-secondary)]">
            <span>📊 {$_("app.autoBackup.journalTrades") || "Journal Trades"}:</span>
            <span class="font-bold text-[var(--text-primary)]">{pending.entryCount}</span>
          </div>
          <div class="flex items-center gap-2 text-[var(--text-secondary)]">
            <span>⚙️ {$_("app.autoBackup.presets") || "Presets"}:</span>
            <span class="font-bold text-[var(--text-primary)]">{pending.presetCount}</span>
          </div>
          <div class="flex items-center gap-2 text-[var(--text-secondary)] col-span-2">
            <span>🎛️ {$_("app.autoBackup.settingsSaved") || "Settings & State"}:</span>
            <span class="font-bold text-[var(--text-primary)]">
              {pending.hasSettings ? ($_("app.yes") || "Yes") : ($_("app.no") || "No")}
            </span>
          </div>
        </div>
      </div>

      {#if errorMessage}
        <div class="p-3 rounded-lg bg-[var(--danger-color)]/10 text-[var(--danger-color)] text-xs font-medium">
          {errorMessage}
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 mt-2">
        <button
          type="button"
          onclick={handleDismiss}
          class="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm font-medium transition-colors"
          disabled={autoBackupState.isRestoring}
        >
          {$_("app.autoBackup.dismissButton") || "Start Fresh / Ignore"}
        </button>
        <button
          type="button"
          onclick={handleRestore}
          class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-accent-paired hover-bg-accent-paired text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2"
          disabled={autoBackupState.isRestoring}
        >
          {#if autoBackupState.isRestoring}
            <span class="animate-spin text-lg">⏳</span>
            <span>{$_("app.autoBackup.restoring") || "Restoring..."}</span>
          {:else}
            <span>{$_("app.autoBackup.restoreButton") || "Restore My Data"}</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
