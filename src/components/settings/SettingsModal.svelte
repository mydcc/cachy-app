<script lang="ts">
  import ModalFrame from '../shared/ModalFrame.svelte';
  import { _ } from 'svelte-i18n';
  import { uiStore } from '../../stores/uiStore';
  import { settingsStore } from '../../stores/settingsStore';
  import { themes, themeIcons, icons } from '../../lib/constants';
  import LanguageSwitcher from '../shared/LanguageSwitcher.svelte';
  import { createBackup, restoreFromBackup } from '../../services/backupService';
  import { modalManager } from '../../services/modalManager';
  import { trackCustomEvent } from '../../services/trackingService';

  let fileInput: HTMLInputElement;

  function handleClose() {
    uiStore.toggleSettingsModal(false);
  }

  function handleBackupClick() {
    createBackup();
    trackCustomEvent('Backup', 'Click', 'CreateBackup_SettingsModal');
  }

  function handleRestoreClick() {
    fileInput.click();
  }

  function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target?.result as string;

        modalManager.show(
            $_('app.restoreConfirmTitle'),
            $_('app.restoreConfirmMessage'),
            'confirm'
        ).then((confirmed) => {
            if (confirmed) {
                const result = restoreFromBackup(content);
                if (result.success) {
                    uiStore.showFeedback('save'); // Re-use save feedback for now
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } else {
                    uiStore.showError(result.message);
                }
            }
            // Reset file input so the same file can be selected again
            input.value = '';
        });
    };
    reader.onerror = () => {
        uiStore.showError('app.fileReadError');
    };
    reader.readAsText(file);

    trackCustomEvent('Backup', 'Click', 'RestoreBackup_SettingsModal');
  }
</script>

<input type="file" class="hidden" bind:this={fileInput} on:change={handleFileSelected} accept=".json,application/json" />

<ModalFrame
  isOpen={$uiStore.showSettingsModal}
  title={$_('settings.title')}
  on:close={handleClose}
  extraClasses="modal-size-sm"
>
  <div class="space-y-6">
    <!-- Language Switcher -->
    <div class="flex justify-between items-center">
      <span class="text-sm font-medium text-text-primary">{$_('settings.language')}</span>
      <div class="w-1/2 flex justify-end">
        <LanguageSwitcher />
      </div>
    </div>

     <!-- API Provider Selection -->
     <div class="flex justify-between items-center">
        <label for="api-provider-select" class="text-sm font-medium text-text-primary">{$_('settings.apiProvider')}</label>
        <div class="flex items-center gap-2 w-1/2">
          <select
            id="api-provider-select"
            class="input-field w-full"
            bind:value={$settingsStore.apiProvider}
          >
            <option value="bitunix">Bitunix</option>
            <option value="binance">Binance</option>
          </select>
        </div>
      </div>

     <!-- Market Data Update Frequency -->
     <div class="flex justify-between items-center">
        <label for="market-data-interval-select" class="text-sm font-medium text-text-primary">{$_('settings.marketDataInterval') || 'Market Data Update'}</label>
        <div class="flex items-center gap-2 w-1/2">
          <select
            id="market-data-interval-select"
            class="input-field w-full"
            bind:value={$settingsStore.marketDataInterval}
          >
            <option value="manual">{$_('settings.intervalManual') || 'Manual'}</option>
            <option value="10s">{$_('settings.interval10s') || 'Every 10s'}</option>
            <option value="1m">{$_('settings.interval1m') || 'Every 1m'}</option>
          </select>
        </div>
      </div>

    <!-- Backup / Restore -->
    <div class="flex justify-between items-center">
      <span class="text-sm font-medium text-text-primary">{$_('settings.backup')}</span>
      <div class="flex items-center gap-2 w-1/2 justify-end">
          <button id="backup-btn-modal" class="btn-icon" title={$_('app.backupButtonTitle')} aria-label={$_('app.backupButtonAriaLabel')} on:click={handleBackupClick}>
              {@html icons.export}
          </button>
          <button id="restore-btn-modal" class="btn-icon" title={$_('app.restoreButtonTitle')} aria-label={$_('app.restoreButtonAriaLabel')} on:click={handleRestoreClick}>
              {@html icons.import}
          </button>
      </div>
    </div>

    <!-- Theme Selector -->
    <div class="flex justify-between items-center">
      <label for="theme-select" class="text-sm font-medium text-text-primary">{$_('settings.theme')}</label>
      <div class="flex items-center gap-2 w-1/2">
        <span class="text-xl">{@html themeIcons[$uiStore.currentTheme as keyof typeof themeIcons]}</span>
        <select
          id="theme-select"
          class="input-field w-full"
          bind:value={$uiStore.currentTheme}
          on:change={(e) => uiStore.setTheme(e.currentTarget.value)}
        >
          {#each themes as theme}
            <option value={theme}>{theme.charAt(0).toUpperCase() + theme.slice(1).replace('-', ' ')}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>
</ModalFrame>
