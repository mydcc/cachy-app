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
  let activeTab: 'general' | 'api' | 'behavior' | 'system' = 'general';

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
                    uiStore.showFeedback('save');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } else {
                    uiStore.showError(result.message);
                }
            }
            input.value = '';
        });
    };
    reader.onerror = () => {
        uiStore.showError('app.fileReadError');
    };
    reader.readAsText(file);

    trackCustomEvent('Backup', 'Click', 'RestoreBackup_SettingsModal');
  }

  function setActiveTab(tab: 'general' | 'api' | 'behavior' | 'system') {
      activeTab = tab;
  }

  $: currentThemeIcon = themeIcons[$uiStore.currentTheme as keyof typeof themeIcons];
</script>

<input type="file" class="hidden" bind:this={fileInput} on:change={handleFileSelected} accept=".json,application/json" />

<ModalFrame
  isOpen={$uiStore.showSettingsModal}
  title={$_('settings.title')}
  on:close={handleClose}
  extraClasses="modal-size-sm"
>
  <!-- Tab Navigation -->
  <div class="flex border-b border-[var(--border-color)] mb-4 overflow-x-auto">
      <button
          class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap {activeTab === 'general' ? 'border-blue-500 text-blue-500' : 'border-transparent text-text-secondary hover:text-text-primary'}"
          on:click={() => setActiveTab('general')}
      >
          {$_('settings.tabs.general') || 'General'}
      </button>
      <button
          class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap {activeTab === 'api' ? 'border-blue-500 text-blue-500' : 'border-transparent text-text-secondary hover:text-text-primary'}"
          on:click={() => setActiveTab('api')}
      >
          {$_('settings.tabs.api') || 'API'}
      </button>
      <button
          class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap {activeTab === 'behavior' ? 'border-blue-500 text-blue-500' : 'border-transparent text-text-secondary hover:text-text-primary'}"
          on:click={() => setActiveTab('behavior')}
      >
          {$_('settings.tabs.behavior') || 'Behavior'}
      </button>
      <button
          class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap {activeTab === 'system' ? 'border-blue-500 text-blue-500' : 'border-transparent text-text-secondary hover:text-text-primary'}"
          on:click={() => setActiveTab('system')}
      >
          {$_('settings.tabs.system') || 'System'}
      </button>
  </div>

  <div class="space-y-6">

    <!-- Tab: General -->
    {#if activeTab === 'general'}
        <div class="space-y-6 fade-in">
             <!-- Language Switcher -->
            <div class="flex justify-between items-center">
                <span class="text-sm font-medium text-text-primary">{$_('settings.language')}</span>
                <div class="w-1/2 flex justify-end">
                    <LanguageSwitcher />
                </div>
            </div>

            <!-- Theme Selector -->
            <div class="flex justify-between items-center">
                <label for="theme-select" class="text-sm font-medium text-text-primary">{$_('settings.theme')}</label>
                <div class="flex items-center gap-2 w-1/2">
                    <span class="text-xl">{@html currentThemeIcon}</span>
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

            <!-- Show Sidebars Toggle -->
             <div class="flex justify-between items-center border-t border-[var(--border-color)] pt-4">
                <label for="show-sidebars" class="text-sm font-medium text-text-primary">
                    {$_('settings.showSidebars') || 'Show Sidebars'}
                </label>
                <div class="flex items-center gap-2 w-1/2 justify-end">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="show-sidebars" class="sr-only peer" bind:checked={$settingsStore.showSidebars}>
                        <div class="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
            </div>
        </div>
    {/if}

    <!-- Tab: API -->
    {#if activeTab === 'api'}
        <div class="space-y-6 fade-in">
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

            <!-- Auto Fetch Balance Toggle -->
            <div class="flex justify-between items-center">
                 <label for="auto-fetch-balance" class="text-sm font-medium text-text-primary">
                     {$_('settings.autoFetchBalance') || 'Auto-fetch Balance'}
                 </label>
                 <div class="flex items-center gap-2 w-1/2 justify-end">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="auto-fetch-balance" class="sr-only peer" bind:checked={$settingsStore.autoFetchBalance}>
                        <div class="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                 </div>
            </div>

            <div class="border-t border-[var(--border-color)] pt-4">
                 <!-- Bitunix Keys -->
                <div class="mb-4">
                    <h4 class="text-xs font-semibold text-text-secondary mb-2">Bitunix</h4>
                    <div class="space-y-2">
                        <input
                            type="text"
                            class="input-field w-full text-xs"
                            placeholder="API Key"
                            bind:value={$settingsStore.apiKeys.bitunix.key}
                        />
                        <input
                            type="password"
                            class="input-field w-full text-xs"
                            placeholder="API Secret"
                            bind:value={$settingsStore.apiKeys.bitunix.secret}
                        />
                    </div>
                </div>

                <!-- Binance Keys -->
                <div>
                    <h4 class="text-xs font-semibold text-text-secondary mb-2">Binance</h4>
                    <div class="space-y-2">
                        <input
                            type="text"
                            class="input-field w-full text-xs"
                            placeholder="API Key"
                            bind:value={$settingsStore.apiKeys.binance.key}
                        />
                        <input
                            type="password"
                            class="input-field w-full text-xs"
                            placeholder="API Secret"
                            bind:value={$settingsStore.apiKeys.binance.secret}
                        />
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Tab: Behavior -->
    {#if activeTab === 'behavior'}
        <div class="space-y-6 fade-in">
             <!-- Market Data Update Frequency -->
             <div class="flex justify-between items-center">
                <label for="market-data-interval-select" class="text-sm font-medium text-text-primary">{$_('settings.marketDataInterval') || 'Update Interval'}</label>
                <div class="flex items-center gap-2 w-1/2">
                  <select
                    id="market-data-interval-select"
                    class="input-field w-full"
                    bind:value={$settingsStore.marketDataInterval}
                  >
                    <option value="1s">{$_('settings.interval1s') || 'Every 1s'}</option>
                    <option value="1m">{$_('settings.interval1m') || 'Every 1m'}</option>
                    <option value="10m">{$_('settings.interval10m') || 'Every 10m'}</option>
                  </select>
                </div>
              </div>

             <!-- Auto Update Price Input (Checkbox/Toggle) -->
             <div class="flex justify-between items-center">
                <label for="auto-update-price-input" class="text-sm font-medium text-text-primary">
                    {$_('settings.autoUpdatePriceInput') || 'Auto-update Price Input'}
                </label>
                <div class="flex items-center gap-2 w-1/2 justify-end">
                     <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="auto-update-price-input" class="sr-only peer" bind:checked={$settingsStore.autoUpdatePriceInput}>
                        <div class="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
              </div>
        </div>
    {/if}

    <!-- Tab: System -->
    {#if activeTab === 'system'}
        <div class="space-y-6 fade-in">
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

            <p class="text-xs text-text-secondary">
                {$_('app.backupButtonTitle')} / {$_('app.restoreButtonTitle')}
            </p>
        </div>
    {/if}

  </div>
</ModalFrame>
