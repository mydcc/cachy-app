<script lang="ts">
    import ModalFrame from '../shared/ModalFrame.svelte';
    import { settingsStore, type ApiKeys, type HotkeyMode } from '../../stores/settingsStore';
    import { uiStore } from '../../stores/uiStore';
    import { _, locale, setLocale } from '../../locales/i18n';
    import { createBackup, restoreFromBackup } from '../../services/backupService';
    import { trackCustomEvent } from '../../services/trackingService';

    // Local state for the form inputs
    let apiProvider: 'bitunix' | 'binance';
    let marketDataInterval: '1s' | '1m' | '10m';
    let autoUpdatePriceInput: boolean;
    let autoFetchBalance: boolean;
    let showSidebars: boolean;
    let feePreference: 'maker' | 'taker';
    let hotkeyMode: HotkeyMode;

    // Separate API keys per provider
    let bitunixKeys: ApiKeys = { key: '', secret: '' };
    let binanceKeys: ApiKeys = { key: '', secret: '' };

    // ImgBB
    let imgbbApiKey: string;
    let imgbbExpiration: number;

    // UI state
    let currentTheme: string;
    let currentLanguage: string;

    // Track active tab
    let activeTab: 'general' | 'api' | 'behavior' | 'system' = 'general';

    // Subscribe to store to initialize local state
    // We use a reactive statement that runs when the modal opens to sync state
    $: if ($uiStore.showSettingsModal) {
        apiProvider = $settingsStore.apiProvider;
        marketDataInterval = $settingsStore.marketDataInterval;
        autoUpdatePriceInput = $settingsStore.autoUpdatePriceInput;
        autoFetchBalance = $settingsStore.autoFetchBalance;
        showSidebars = $settingsStore.showSidebars;
        feePreference = $settingsStore.feePreference;
        hotkeyMode = $settingsStore.hotkeyMode;

        // Deep copy keys to avoid binding issues
        bitunixKeys = { ...$settingsStore.apiKeys.bitunix };
        binanceKeys = { ...$settingsStore.apiKeys.binance };

        imgbbApiKey = $settingsStore.imgbbApiKey;
        imgbbExpiration = $settingsStore.imgbbExpiration;

        currentTheme = $uiStore.currentTheme;
        currentLanguage = $locale || 'en';
    }

    function saveSettings() {
        settingsStore.update(s => ({
            ...s,
            apiProvider,
            marketDataInterval,
            autoUpdatePriceInput,
            autoFetchBalance,
            showSidebars,
            feePreference,
            hotkeyMode,
            imgbbApiKey,
            imgbbExpiration,
            apiKeys: {
                bitunix: bitunixKeys,
                binance: binanceKeys
            }
        }));

        // Apply theme and language immediately if changed
        if (currentTheme !== $uiStore.currentTheme) {
            uiStore.setTheme(currentTheme);
        }
        if (currentLanguage !== $locale) {
            setLocale(currentLanguage);
        }

        trackCustomEvent('Settings', 'Save', apiProvider);
        uiStore.toggleSettingsModal(false);
        uiStore.showFeedback('save'); // Assuming generic 'save' feedback exists
    }

    function close() {
        uiStore.toggleSettingsModal(false);
    }

    // System Tab Functions
    function handleBackup() {
        createBackup();
        trackCustomEvent('System', 'Backup', 'Created');
    }

    async function handleRestore(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = async (event) => {
            const content = event.target?.result as string;
            if (confirm($_('app.restoreConfirmMessage'))) {
                const result = restoreFromBackup(content);
                if (result.success) {
                    alert(result.message);
                    window.location.reload();
                } else {
                    alert(result.message);
                }
            }
            // Reset input
            input.value = '';
        };

        reader.onerror = () => {
             alert($_('app.fileReadError'));
             input.value = '';
        };

        reader.readAsText(file);
    }

    function handleReset() {
        if (confirm($_('settings.resetConfirm'))) {
            localStorage.clear();
            window.location.reload();
        }
    }

    const hotkeyDescriptions = {
        mode1: [
            { keys: '1-4', action: 'Load Favorites (No Input Active)' },
            { keys: 'T', action: 'Focus Next Take Profit' },
            { keys: '+ / -', action: 'Add / Remove Take Profit' },
            { keys: 'E', action: 'Focus Entry Price' },
            { keys: 'S', action: 'Focus Stop Loss' },
            { keys: 'L / K', action: 'Set Long / Short' },
            { keys: 'J', action: 'Open Journal' }
        ],
        mode2: [
            { keys: 'Alt + 1-4', action: 'Load Favorites' },
            { keys: 'Alt + T', action: 'Add Take Profit' },
            { keys: 'Alt + Shift + T', action: 'Remove Take Profit' },
            { keys: 'Alt + E', action: 'Focus Entry Price' },
            { keys: 'Alt + S', action: 'Focus Stop Loss' },
            { keys: 'Alt + L / K', action: 'Set Long / Short' },
            { keys: 'Alt + J', action: 'Open Journal' }
        ],
        mode3: [
            { keys: '1-4', action: 'Load Favorites (No Input Active)' },
            { keys: 'T', action: 'Focus TP 1' },
            { keys: 'Shift + T', action: 'Focus Last TP' },
            { keys: '+ / -', action: 'Add / Remove TP' }
        ]
    };
</script>

<ModalFrame
    isOpen={$uiStore.showSettingsModal}
    title={$_('settings.title') || 'Settings'}
    on:close={close}
    extraClasses="max-w-md w-full"
>
    <!-- Tabs Header -->
    <div class="flex border-b border-[var(--border-color)] mb-4 overflow-x-auto">
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'general' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'general'}
        >
            {$_('settings.tabs.general')}
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'api' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'api'}
        >
            {$_('settings.tabs.api')}
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'behavior' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'behavior'}
        >
            {$_('settings.tabs.behavior')}
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'system' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'system'}
        >
            {$_('settings.tabs.system')}
        </button>
    </div>

    <!-- Tab Content -->
    <div class="flex flex-col gap-4 min-h-[300px]">

        {#if activeTab === 'general'}
            <div class="flex flex-col gap-4">
                <!-- Language & Theme -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1">
                        <span class="text-xs font-medium text-[var(--text-secondary)]">{$_('settings.language')}</span>
                        <select bind:value={currentLanguage} class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm">
                            <option value="en">English</option>
                            <option value="de">Deutsch</option>
                        </select>
                    </div>
                    <div class="flex flex-col gap-1">
                         <span class="text-xs font-medium text-[var(--text-secondary)]">{$_('settings.theme')}</span>
                        <select bind:value={currentTheme} class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm">
                            <option value="dark">{$_('settings.themeDark')}</option>
                            <option value="light">{$_('settings.themeLight')}</option>
                        </select>
                    </div>
                </div>

                 <!-- UI Toggles -->
                 <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]">
                    <span class="text-sm font-medium">{$_('settings.showSidebars')}</span>
                    <input type="checkbox" bind:checked={showSidebars} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                </label>

                <!-- Fee Preference -->
                <div class="flex flex-col gap-1 mt-2">
                    <span class="text-sm font-medium">{$_('settings.feePreference')}</span>
                    <div class="flex gap-2">
                        <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]">
                            <input type="radio" bind:group={feePreference} value="maker" class="accent-[var(--accent-color)]" />
                            <span class="text-sm">Maker</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]">
                            <input type="radio" bind:group={feePreference} value="taker" class="accent-[var(--accent-color)]" />
                            <span class="text-sm">Taker</span>
                        </label>
                    </div>
                    <p class="text-xs text-[var(--text-secondary)]">
                        {$_('settings.feePreferenceDesc')}
                    </p>
                </div>
            </div>

        {:else if activeTab === 'api'}
            <div class="flex flex-col gap-4">
                <!-- ImgBB Settings -->
                <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2">
                     <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">{$_('settings.imgbbHeader')}</h4>
                     <div class="flex flex-col gap-1">
                        <label for="imgbb-key" class="text-xs">{$_('settings.imgbbApiKey')}</label>
                        <input id="imgbb-key" type="password" bind:value={imgbbApiKey} class="input-field p-1 px-2 rounded text-sm" placeholder="Paste ImgBB Key" />
                    </div>
                     <div class="flex flex-col gap-1">
                        <label for="imgbb-exp" class="text-xs">{$_('settings.imgbbExpiration')}</label>
                         <select id="imgbb-exp" bind:value={imgbbExpiration} class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]">
                             <option value={0}>{$_('settings.imgbbPermanent')}</option>
                             <option value={600}>{$_('settings.imgbb10m')}</option>
                             <option value={3600}>{$_('settings.imgbb1h')}</option>
                             <option value={86400}>{$_('settings.imgbb1d')}</option>
                             <option value={604800}>{$_('settings.imgbb1w')}</option>
                             <option value={2592000}>{$_('settings.imgbb1m')}</option>
                        </select>
                    </div>
                    <p class="text-[10px] text-[var(--text-secondary)]">
                         {$_('settings.imgbbGetKey')} <a href="https://api.imgbb.com/" target="_blank" class="text-[var(--accent-color)] hover:underline">api.imgbb.com</a>.
                    </p>
                </div>

                <!-- Provider Selection -->
                <div class="flex flex-col gap-1">
                    <span class="text-sm font-medium">{$_('settings.providerLabel')}</span>
                    <select bind:value={apiProvider} class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                        <option value="bitunix">Bitunix</option>
                        <option value="binance">Binance Futures</option>
                    </select>
                </div>

                <!-- API Keys (Conditional based on provider) -->
                {#if apiProvider === 'bitunix'}
                    <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2">
                        <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">Bitunix Credentials</h4>
                        <div class="flex flex-col gap-1">
                            <label for="bx-key" class="text-xs">API Key</label>
                            <input id="bx-key" type="password" bind:value={bitunixKeys.key} class="input-field p-1 px-2 rounded text-sm" placeholder="Paste Key" />
                        </div>
                        <div class="flex flex-col gap-1">
                            <label for="bx-secret" class="text-xs">Secret Key</label>
                            <input id="bx-secret" type="password" bind:value={bitunixKeys.secret} class="input-field p-1 px-2 rounded text-sm" placeholder="Paste Secret" />
                        </div>
                    </div>
                {:else}
                    <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2">
                        <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">Binance Credentials</h4>
                        <div class="flex flex-col gap-1">
                            <label for="bn-key" class="text-xs">API Key</label>
                            <input id="bn-key" type="password" bind:value={binanceKeys.key} class="input-field p-1 px-2 rounded text-sm" placeholder="Paste Key" />
                        </div>
                        <div class="flex flex-col gap-1">
                            <label for="bn-secret" class="text-xs">Secret Key</label>
                            <input id="bn-secret" type="password" bind:value={binanceKeys.secret} class="input-field p-1 px-2 rounded text-sm" placeholder="Paste Secret" />
                        </div>
                    </div>
                {/if}

                <p class="text-xs text-[var(--text-secondary)] italic">
                    {$_('settings.securityNote')}
                </p>
            </div>

        {:else if activeTab === 'behavior'}
            <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                    <span class="text-sm font-medium">{$_('settings.intervalLabel')}</span>
                    <select bind:value={marketDataInterval} class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                        <option value="1s">{$_('settings.interval1s')}</option>
                        <option value="1m">{$_('settings.interval1m')}</option>
                        <option value="10m">{$_('settings.interval10m')}</option>
                    </select>
                </div>

                <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium">{$_('settings.autoUpdatePrice')}</span>
                        <span class="text-xs text-[var(--text-secondary)]">Overwrite entry price on every update tick</span>
                    </div>
                    <input type="checkbox" bind:checked={autoUpdatePriceInput} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                </label>

                <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer">
                     <div class="flex flex-col">
                        <span class="text-sm font-medium">{$_('settings.autoFetchBalance')}</span>
                        <span class="text-xs text-[var(--text-secondary)]">Fetch wallet balance on startup</span>
                    </div>
                    <input type="checkbox" bind:checked={autoFetchBalance} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                </label>

                <!-- Hotkey Mode Selection -->
                <div class="flex flex-col gap-2 pt-2 border-t border-[var(--border-color)]">
                     <span class="text-sm font-medium">Hotkey Profile</span>
                     <select bind:value={hotkeyMode} class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                        <option value="mode2">Safety Mode (Alt + Key) - Default</option>
                        <option value="mode1">Direct Mode (Fast)</option>
                        <option value="mode3">Hybrid Mode</option>
                     </select>

                     <!-- Info Text for Hotkeys -->
                     <div class="bg-[var(--bg-tertiary)] p-3 rounded text-xs text-[var(--text-secondary)] mt-1">
                        <div class="font-bold mb-2 text-[var(--text-primary)]">Active Hotkeys:</div>
                        <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                            {#each hotkeyDescriptions[hotkeyMode] as desc}
                                <div class="flex justify-between">
                                    <span class="font-mono text-[var(--accent-color)]">{desc.keys}</span>
                                    <span>{desc.action}</span>
                                </div>
                            {/each}
                        </div>
                     </div>
                </div>
            </div>

        {:else if activeTab === 'system'}
            <div class="flex flex-col gap-4">
                 <!-- Backup -->
                <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2">
                     <h4 class="text-sm font-bold">{$_('settings.backup')}</h4>
                     <p class="text-xs text-[var(--text-secondary)] mb-2">
                         Save all your settings, presets, and journal entries to a file.
                     </p>
                     <button class="btn btn-secondary text-sm w-full" on:click={handleBackup}>
                        {$_('app.backupButtonAriaLabel')}
                     </button>
                </div>

                <!-- Restore -->
                <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2">
                    <h4 class="text-sm font-bold">{$_('settings.restore')}</h4>
                    <p class="text-xs text-[var(--text-secondary)] mb-2">
                        Overwrite current data with a backup file.
                    </p>
                    <label class="btn btn-secondary text-sm w-full cursor-pointer text-center">
                       {$_('app.restoreButtonAriaLabel')}
                       <input type="file" accept=".json" class="hidden" on:change={handleRestore} />
                    </label>
               </div>

                <!-- Reset -->
                <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
                     <button class="text-xs text-[var(--danger-color)] hover:underline" on:click={handleReset}>
                         {$_('settings.reset')}
                     </button>
                </div>
            </div>
        {/if}

    </div>

    <!-- Footer Actions -->
    <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--border-color)]">
        <button class="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]" on:click={close}>
            {$_('common.cancel')}
        </button>
        <button class="px-4 py-2 text-sm font-bold bg-[var(--accent-color)] text-white rounded hover:opacity-90 transition-opacity" on:click={saveSettings}>
            {$_('common.save')}
        </button>
    </div>
</ModalFrame>
