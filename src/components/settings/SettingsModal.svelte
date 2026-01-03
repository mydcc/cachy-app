<script lang="ts">
    import ModalFrame from '../shared/ModalFrame.svelte';
    import { settingsStore, type ApiKeys } from '../../stores/settingsStore';
    import { uiStore } from '../../stores/uiStore';
    import { _ } from '../../locales/i18n';
    import { trackCustomEvent } from '../../services/trackingService';

    // Local state for the form inputs
    let apiProvider: 'bitunix' | 'binance';
    let marketDataInterval: '1s' | '1m' | '10m';
    let autoUpdatePriceInput: boolean;
    let autoFetchBalance: boolean;
    let showSidebars: boolean;
    let feePreference: 'maker' | 'taker';

    // ImgBB
    let imgbbApiKey: string;
    let imgbbExpiration: number;

    // Separate API keys per provider
    let bitunixKeys: ApiKeys = { key: '', secret: '' };
    let binanceKeys: ApiKeys = { key: '', secret: '' };

    // Track active tab
    let activeTab: 'general' | 'api' | 'behavior' = 'general';

    // Subscribe to store to initialize local state
    // We use a reactive statement that runs when the modal opens to sync state
    $: if ($uiStore.showSettingsModal) {
        apiProvider = $settingsStore.apiProvider;
        marketDataInterval = $settingsStore.marketDataInterval;
        autoUpdatePriceInput = $settingsStore.autoUpdatePriceInput;
        autoFetchBalance = $settingsStore.autoFetchBalance;
        showSidebars = $settingsStore.showSidebars;
        feePreference = $settingsStore.feePreference;
        imgbbApiKey = $settingsStore.imgbbApiKey;
        imgbbExpiration = $settingsStore.imgbbExpiration;

        // Deep copy keys to avoid binding issues
        bitunixKeys = { ...$settingsStore.apiKeys.bitunix };
        binanceKeys = { ...$settingsStore.apiKeys.binance };
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
            imgbbApiKey,
            imgbbExpiration,
            apiKeys: {
                bitunix: bitunixKeys,
                binance: binanceKeys
            }
        }));

        trackCustomEvent('Settings', 'Save', apiProvider);
        uiStore.toggleSettingsModal(false);
        uiStore.showFeedback('save'); // Assuming generic 'save' feedback exists
    }

    function close() {
        uiStore.toggleSettingsModal(false);
    }
</script>

<ModalFrame
    isOpen={$uiStore.showSettingsModal}
    title={$_('settings.title') || 'Settings'}
    on:close={close}
    extraClasses="max-w-md w-full"
>
    <!-- Tabs Header -->
    <div class="flex border-b border-[var(--border-color)] mb-4">
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'general' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'general'}
        >
            {$_('settings.tabs.general') || 'General'}
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'api' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'api'}
        >
            {$_('settings.tabs.api') || 'API'}
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'behavior' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'behavior'}
        >
            {$_('settings.tabs.behavior') || 'Behavior'}
        </button>
    </div>

    <!-- Tab Content -->
    <div class="flex flex-col gap-4 min-h-[300px]">

        {#if activeTab === 'general'}
            <div class="flex flex-col gap-3">
                 <!-- UI Toggles -->
                 <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer">
                    <span class="text-sm font-medium">{$_('settings.showSidebars') || 'Show Sidebars (Positions/Market)'}</span>
                    <input type="checkbox" bind:checked={showSidebars} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                </label>

                <!-- Fee Preference -->
                <div class="flex flex-col gap-1 mt-2">
                    <span class="text-sm font-medium">{$_('settings.feePreference') || 'Default Fee Preference'}</span>
                    <div class="flex gap-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" group={feePreference} value="maker" class="accent-[var(--accent-color)]" />
                            <span class="text-sm">Maker</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" group={feePreference} value="taker" class="accent-[var(--accent-color)]" />
                            <span class="text-sm">Taker</span>
                        </label>
                    </div>
                    <p class="text-xs text-[var(--text-secondary)]">
                        {$_('settings.feePreferenceDesc') || 'Select which fee rate to use by default when syncing from API.'}
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
                    <span class="text-sm font-medium">{$_('settings.providerLabel') || 'Exchange Provider'}</span>
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
                    {$_('settings.securityNote') || 'Keys are stored locally in your browser.'}
                </p>
            </div>

        {:else if activeTab === 'behavior'}
            <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                    <span class="text-sm font-medium">{$_('settings.intervalLabel') || 'Market Data Update Interval'}</span>
                    <select bind:value={marketDataInterval} class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                        <option value="1s">1s (Real-time)</option>
                        <option value="1m">1m (Standard)</option>
                        <option value="10m">10m (Slow)</option>
                    </select>
                </div>

                <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium">{$_('settings.autoUpdatePrice') || 'Auto-update Price Input'}</span>
                        <span class="text-xs text-[var(--text-secondary)]">Overwrite entry price on every update tick</span>
                    </div>
                    <input type="checkbox" bind:checked={autoUpdatePriceInput} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                </label>

                <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer">
                     <div class="flex flex-col">
                        <span class="text-sm font-medium">{$_('settings.autoFetchBalance') || 'Auto-fetch Balance'}</span>
                        <span class="text-xs text-[var(--text-secondary)]">Fetch wallet balance on startup</span>
                    </div>
                    <input type="checkbox" bind:checked={autoFetchBalance} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                </label>
            </div>
        {/if}

    </div>

    <!-- Footer Actions -->
    <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--border-color)]">
        <button class="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]" on:click={close}>
            {$_('common.cancel') || 'Cancel'}
        </button>
        <button class="px-4 py-2 text-sm font-bold bg-[var(--accent-color)] text-white rounded hover:opacity-90 transition-opacity" on:click={saveSettings}>
            {$_('common.save') || 'Save'}
        </button>
    </div>
</ModalFrame>
