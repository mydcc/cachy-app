<script lang="ts">
    import ModalFrame from '../shared/ModalFrame.svelte';
    import { settingsStore, type ApiKeys, type HotkeyMode, type PositionViewMode, type AiProvider } from '../../stores/settingsStore';
    import { indicatorStore, type IndicatorSettings } from '../../stores/indicatorStore';
    import { uiStore } from '../../stores/uiStore';
    import { _, locale, setLocale } from '../../locales/i18n';
    import { createBackup, restoreFromBackup } from '../../services/backupService';
    import { trackCustomEvent } from '../../services/trackingService';
    import { normalizeTimeframeInput } from '../../utils/utils';

    // Local state for the form inputs
    let apiProvider: 'bitunix' | 'binance';
    let marketDataInterval: '1s' | '1m' | '10m';
    let autoUpdatePriceInput: boolean;
    let autoFetchBalance: boolean;
    let showSidebars: boolean;
    let showTechnicals: boolean;
    let hideUnfilledOrders: boolean;
    let feePreference: 'maker' | 'taker';
    let hotkeyMode: HotkeyMode;
    let positionViewMode: PositionViewMode;

    // Timeframe & RSI Sync
    let favoriteTimeframes: string[] = [];
    let favoriteTimeframesInput: string = ''; // Text input
    let syncRsiTimeframe: boolean;

    // Indicator Settings
    let historyLimit = $indicatorStore.historyLimit || 2000;
    let rsiSettings = { ...$indicatorStore.rsi };
    let macdSettings = { ...$indicatorStore.macd };
    let stochSettings = { ...$indicatorStore.stochastic };
    let cciSettings = { ...$indicatorStore.cci };
    let adxSettings = { ...$indicatorStore.adx };
    let aoSettings = { ...$indicatorStore.ao };
    let momentumSettings = { ...$indicatorStore.momentum };
    let emaSettings = { ...$indicatorStore.ema };
    let pivotSettings = { ...$indicatorStore.pivots };

    // Side Panel Settings
    let enableSidePanel: boolean;
    let sidePanelMode: 'chat' | 'notes' | 'ai';

    // AI Settings
    let aiProviderState: AiProvider;
    let openaiApiKey: string;
    let geminiApiKey: string;
    let anthropicApiKey: string;

    // Separate API keys per provider
    let bitunixKeys: ApiKeys = { key: '', secret: '' };
    let binanceKeys: ApiKeys = { key: '', secret: '' };

    // ImgBB
    let imgbbApiKey: string;
    let imgbbExpiration: number;

    // UI state
    let currentTheme: string;
    let currentLanguage: string;
    let isPro: boolean;

    // Track active tab
    let activeTab: 'general' | 'api' | 'ai' | 'behavior' | 'system' | 'sidebar' | 'indicators' = 'general';
    let isInitialized = false;

    const availableTimeframes = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];

    const themes = [
        { value: 'dark', label: 'Dark (Default)' },
        { value: 'light', label: 'Light' },
        { value: 'meteorite', label: 'Meteorite' },
        { value: 'midnight', label: 'Midnight' },
        { value: 'cobalt2', label: 'Cobalt2' },
        { value: 'night-owl', label: 'Night Owl' },
        { value: 'dracula', label: 'Dracula' },
        { value: 'dracula-soft', label: 'Dracula Soft' },
        { value: 'monokai', label: 'Monokai' },
        { value: 'nord', label: 'Nord' },
        { value: 'solarized-dark', label: 'Solarized Dark' },
        { value: 'solarized-light', label: 'Solarized Light' },
        { value: 'gruvbox-dark', label: 'Gruvbox Dark' },
        { value: 'catppuccin', label: 'Catppuccin' },
        { value: 'tokyo-night', label: 'Tokyo Night' },
        { value: 'one-dark-pro', label: 'One Dark Pro' },
        { value: 'obsidian', label: 'Obsidian' },
        { value: 'ayu-dark', label: 'Ayu Dark' },
        { value: 'ayu-light', label: 'Ayu Light' },
        { value: 'ayu-mirage', label: 'Ayu Mirage' },
        { value: 'github-dark', label: 'GitHub Dark' },
        { value: 'github-light', label: 'GitHub Light' },
        { value: 'steel', label: 'Steel' },
        { value: 'matrix', label: 'Matrix' },
        { value: 'everforest-dark', label: 'Everforest Dark' },
        { value: 'VIP', label: 'VIP' },
    ];

    // Subscribe to store to initialize local state
    // We use a guard to prevent overwriting user changes if the store updates while modal is open
    $: if ($uiStore.showSettingsModal) {
        if (!isInitialized) {
            apiProvider = $settingsStore.apiProvider;
            marketDataInterval = $settingsStore.marketDataInterval;
            autoUpdatePriceInput = $settingsStore.autoUpdatePriceInput;
            autoFetchBalance = $settingsStore.autoFetchBalance;
            showSidebars = $settingsStore.showSidebars;
            showTechnicals = $settingsStore.showTechnicals;
            hideUnfilledOrders = $settingsStore.hideUnfilledOrders;
            positionViewMode = $settingsStore.positionViewMode || 'detailed';
            feePreference = $settingsStore.feePreference;
            hotkeyMode = $settingsStore.hotkeyMode;
            enableSidePanel = $settingsStore.enableSidePanel;
            sidePanelMode = $settingsStore.sidePanelMode;
            isPro = $settingsStore.isPro;

            aiProviderState = $settingsStore.aiProvider || 'gemini';
            openaiApiKey = $settingsStore.openaiApiKey || '';
            geminiApiKey = $settingsStore.geminiApiKey || '';
            anthropicApiKey = $settingsStore.anthropicApiKey || '';

            favoriteTimeframes = [...$settingsStore.favoriteTimeframes];
            favoriteTimeframesInput = favoriteTimeframes.join(', '); // Init text input
            syncRsiTimeframe = $settingsStore.syncRsiTimeframe;

            historyLimit = $indicatorStore.historyLimit || 2000;
            rsiSettings = { ...$indicatorStore.rsi };
            macdSettings = { ...$indicatorStore.macd };
            stochSettings = { ...$indicatorStore.stochastic };
            emaSettings = { ...$indicatorStore.ema };
            pivotSettings = { ...$indicatorStore.pivots };

            // Deep copy keys to avoid binding issues
            bitunixKeys = { ...$settingsStore.apiKeys.bitunix };
            binanceKeys = { ...$settingsStore.apiKeys.binance };

            imgbbApiKey = $settingsStore.imgbbApiKey;
            imgbbExpiration = $settingsStore.imgbbExpiration;

            currentTheme = $uiStore.currentTheme;
            currentLanguage = $locale || 'en';

            isInitialized = true;
        }
    } else {
        isInitialized = false;
    }

    // Reactive update for settings (Immediate Save)
    $: if (isInitialized) {
         settingsStore.update(s => ({
            ...s,
            apiProvider,
            marketDataInterval,
            autoUpdatePriceInput,
            autoFetchBalance,
            showSidebars,
            showTechnicals,
            hideUnfilledOrders,
            feePreference,
            hotkeyMode,
            enableSidePanel,
            sidePanelMode,
            favoriteTimeframes,
            syncRsiTimeframe,
            imgbbApiKey,
            imgbbExpiration,
            aiProvider: aiProviderState,
            openaiApiKey: openaiApiKey,
            geminiApiKey: geminiApiKey,
            anthropicApiKey: anthropicApiKey,
            apiKeys: {
                bitunix: bitunixKeys,
                binance: binanceKeys
            }
        }));

        indicatorStore.set({
            historyLimit,
            rsi: rsiSettings,
            macd: macdSettings,
            stochastic: stochSettings,
            cci: cciSettings,
            adx: adxSettings,
            ao: aoSettings,
            momentum: momentumSettings,
            ema: emaSettings,
            pivots: pivotSettings
        });
    }

    // Immediate Theme Update
    $: if (isInitialized && currentTheme !== $uiStore.currentTheme) {
        uiStore.setTheme(currentTheme);
    }

    // Immediate Language Update
    $: if (isInitialized && currentLanguage !== $locale) {
        setLocale(currentLanguage);
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

    function handleTimeframeInput(event: Event) {
        const input = (event.target as HTMLInputElement).value;
        favoriteTimeframesInput = input; // update local input state

        const rawTags = input.split(',').map(s => s.trim()).filter(s => s !== '');

        // Normalize
        const normalizedTags = rawTags.map(normalizeTimeframeInput);

        // Limit to 4
        const limitedTags = normalizedTags.slice(0, 4);

        favoriteTimeframes = limitedTags;
    }

    function handleTimeframeBlur() {
        // Re-format the input field to show the normalized versions nicely
        favoriteTimeframesInput = favoriteTimeframes.join(', ');
    }

    const hotkeyDescriptions = {
        mode1: [
            { keys: '1-4', action: 'Load Favorites (No Input Active)' },
            { keys: 'T', action: 'Focus Next Take Profit' },
            { keys: '+ / -', action: 'Add / Remove Take Profit' },
            { keys: 'E', action: 'Focus Entry Price' },
            { keys: 'O', action: 'Focus Stop Loss' },
            { keys: 'L / S', action: 'Set Long / Short' },
            { keys: 'J', action: 'Open Journal' }
        ],
        mode2: [
            { keys: 'Alt + 1-4', action: 'Load Favorites' },
            { keys: 'Alt + T', action: 'Add Take Profit' },
            { keys: 'Alt + Shift + T', action: 'Remove Take Profit' },
            { keys: 'Alt + E', action: 'Focus Entry Price' },
            { keys: 'Alt + O', action: 'Focus Stop Loss' },
            { keys: 'Alt + L / S', action: 'Set Long / Short' },
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
    extraClasses="!w-auto !max-w-[62vw] max-h-[85vh] flex flex-col"
    alignment="top"
>
    <!-- Tabs Header -->
    <div class="flex border-b border-[var(--border-color)] mb-4 overflow-x-auto shrink-0" role="tablist">
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'general' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'general'}
            role="tab"
            aria-selected={activeTab === 'general'}
            aria-controls="tab-general"
        >
            {$_('settings.tabs.general')}
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'api' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'api'}
            role="tab"
            aria-selected={activeTab === 'api'}
            aria-controls="tab-api"
        >
            {$_('settings.tabs.api')}
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'ai' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'ai'}
            role="tab"
            aria-selected={activeTab === 'ai'}
            aria-controls="tab-ai"
        >
            AI Chat
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'behavior' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'behavior'}
            role="tab"
            aria-selected={activeTab === 'behavior'}
            aria-controls="tab-behavior"
        >
            {$_('settings.tabs.behavior')}
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'sidebar' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'sidebar'}
            role="tab"
            aria-selected={activeTab === 'sidebar'}
            aria-controls="tab-sidebar"
        >
            Sidebar
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'indicators' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'indicators'}
            role="tab"
            aria-selected={activeTab === 'indicators'}
            aria-controls="tab-indicators"
        >
            Technicals
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'system' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'system'}
            role="tab"
            aria-selected={activeTab === 'system'}
            aria-controls="tab-system"
        >
            {$_('settings.tabs.system')}
        </button>
    </div>

    <!-- Tab Content -->
    <div class="flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar flex-1 min-h-0">

        {#if activeTab === 'general'}
            <div class="flex flex-col gap-4" role="tabpanel" id="tab-general" aria-labelledby="tab-general-label">
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
                            {#each themes as theme, index}
                                <option value={theme.value} disabled={!isPro && index >= 5}>{theme.label} {!isPro && index >= 5 ? '(Pro)' : ''}</option>
                            {/each}
                        </select>
                    </div>
                </div>

                 <!-- UI Toggles -->

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
            <div class="flex flex-col gap-4" role="tabpanel" id="tab-api">
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

        {:else if activeTab === 'ai'}
            <div class="flex flex-col gap-4" role="tabpanel" id="tab-ai">
                <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-4">
                    <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">AI Provider Settings</h4>

                    <div class="flex flex-col gap-1">
                        <span class="text-sm font-medium">Default Provider</span>
                        <select bind:value={aiProviderState} class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                            <option value="openai">OpenAI (ChatGPT)</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="anthropic">Anthropic (Claude)</option>
                        </select>
                    </div>

                    <div class="flex flex-col gap-3 pt-2 border-t border-[var(--border-color)]">
                        <div class="flex flex-col gap-1">
                            <label for="openai-key" class="text-xs flex items-center gap-2">
                                <span>OpenAI API Key</span>
                                {#if aiProviderState === 'openai'}<span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"></span>{/if}
                            </label>
                            <input id="openai-key" type="password" bind:value={openaiApiKey} class="input-field p-1 px-2 rounded text-sm" placeholder="sk-..." />
                        </div>

                        <div class="flex flex-col gap-1">
                            <label for="gemini-key" class="text-xs flex items-center gap-2">
                                <span>Google Gemini API Key</span>
                                {#if aiProviderState === 'gemini'}<span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"></span>{/if}
                            </label>
                            <input id="gemini-key" type="password" bind:value={geminiApiKey} class="input-field p-1 px-2 rounded text-sm" placeholder="AIza..." />
                        </div>

                        <div class="flex flex-col gap-1">
                            <label for="anthropic-key" class="text-xs flex items-center gap-2">
                                <span>Anthropic API Key</span>
                                {#if aiProviderState === 'anthropic'}<span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"></span>{/if}
                            </label>
                            <input id="anthropic-key" type="password" bind:value={anthropicApiKey} class="input-field p-1 px-2 rounded text-sm" placeholder="sk-ant-..." />
                        </div>
                    </div>

                    <p class="text-[10px] text-[var(--text-secondary)] mt-1 italic">
                        Your API keys are stored locally in your browser and are never saved to our servers. They are only used to communicate directly with the AI providers.
                    </p>
                </div>
            </div>

        {:else if activeTab === 'behavior'}
            <div class="flex flex-col gap-4" role="tabpanel" id="tab-behavior">
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

        {:else if activeTab === 'sidebar'}
            <div class="flex flex-col gap-4" role="tabpanel" id="tab-sidebar">
                 <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]">
                    <span class="text-sm font-medium">{$_('settings.showSidebars')}</span>
                    <input type="checkbox" bind:checked={showSidebars} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                </label>

                <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]">
                    <span class="text-sm font-medium">{$_('settings.showTechnicals') || 'Show Technicals Panel'}</span>
                    <input type="checkbox" bind:checked={showTechnicals} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                </label>

                 <!-- Side Panel Toggle -->
                <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium">{$_('settings.enableSidePanel')}</span>
                        <span class="text-xs text-[var(--text-secondary)]">{$_('settings.sidePanelDesc')}</span>
                    </div>
                    <input type="checkbox" bind:checked={enableSidePanel} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                </label>

                {#if enableSidePanel}
                    <div class="flex flex-col gap-1 ml-4 border-l-2 border-[var(--border-color)] pl-4">
                        <span class="text-sm font-medium">{$_('settings.sidePanelMode')}</span>
                        <div class="flex gap-2">
                             <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]">
                                <input type="radio" bind:group={sidePanelMode} value="notes" class="accent-[var(--accent-color)]" />
                                <span class="text-sm">{$_('settings.modeNotes')}</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]">
                                <input type="radio" bind:group={sidePanelMode} value="chat" class="accent-[var(--accent-color)]" />
                                <span class="text-sm">{$_('settings.modeChat')}</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]">
                                <input type="radio" bind:group={sidePanelMode} value="ai" class="accent-[var(--accent-color)]" />
                                <span class="text-sm">AI Chat</span>
                            </label>
                        </div>
                    </div>
                {/if}

                 <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]">
                    <span class="text-sm font-medium">{$_('settings.hideUnfilledOrders')}</span>
                    <input type="checkbox" bind:checked={hideUnfilledOrders} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                </label>

                <!-- Position View Mode -->
                <div class="flex flex-col gap-1">
                    <span class="text-sm font-medium">Position View Mode</span>
                    <select bind:value={positionViewMode} class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                        <option value="detailed">Detailed (Default)</option>
                        <option value="focus">Focus (Compact)</option>
                    </select>
                </div>
            </div>

        {:else if activeTab === 'indicators'}
            <div class="flex flex-col gap-4 overflow-x-hidden" role="tabpanel" id="tab-indicators">
                <!-- Two Column Grid for Indicators -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

                    <!-- Left Column -->
                    <div class="flex flex-col gap-4">

                         <!-- History Limit Settings -->
                        <div class="flex flex-col gap-2 p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)]">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-bold">Calculation History Depth</span>
                            </div>
                            <div class="flex flex-col gap-1 mt-1">
                                <div class="flex items-center gap-2">
                                     <input
                                        type="number"
                                        min="200"
                                        max="5000"
                                        step="100"
                                        class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm w-full"
                                        bind:value={historyLimit}
                                    />
                                    <span class="text-xs text-[var(--text-secondary)] whitespace-nowrap">Candles</span>
                                </div>
                                <p class="text-[10px] text-[var(--text-secondary)]">
                                    Higher values (e.g. 2000) improve accuracy for EMA/RSI but require more data.
                                </p>
                            </div>
                        </div>

                        <!-- Timeframe Favorites -->
                        <div class="flex flex-col gap-2 p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)]">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-bold">Favorite Timeframes (Max 4)</span>
                                <span class="text-xs text-[var(--text-secondary)]">{favoriteTimeframes.length}/4</span>
                            </div>
                            <div class="flex flex-col gap-1 mt-1">
                                <input
                                    type="text"
                                    class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm"
                                    value={favoriteTimeframesInput}
                                    on:input={handleTimeframeInput}
                                    on:blur={handleTimeframeBlur}
                                    placeholder="e.g. 5m, 15m, 1h, 4h"
                                />
                                <p class="text-[10px] text-[var(--text-secondary)]">
                                    Enter up to 4 comma-separated timeframes. Inputs like '60m' or '1S' are automatically normalized.
                                </p>
                            </div>
                            <!-- Display Tags Preview -->
                            <div class="flex flex-wrap gap-2 mt-2">
                                {#each favoriteTimeframes as tf}
                                     <span class="px-2 py-1 text-xs rounded bg-[var(--accent-color)] text-[var(--btn-accent-text)] border border-[var(--accent-color)]">
                                        {tf}
                                     </span>
                                {/each}
                            </div>
                        </div>

                        <!-- RSI Settings -->
                        <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden">
                            <div class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1">
                                <h4 class="text-sm font-bold">Relative Strength Index (RSI)</h4>
                                {#if !isPro}
                                     <span class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-2 py-0.5 rounded-full">PRO Feature</span>
                                {/if}
                            </div>

                            <!-- Sync Toggle -->
                            <label class="flex items-center justify-between cursor-pointer">
                                <span class="text-xs font-medium">Sync with Calculator Timeframe</span>
                                <input type="checkbox" bind:checked={syncRsiTimeframe} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                            </label>

                            {#if !syncRsiTimeframe}
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Default RSI Timeframe</span>
                                    <select bind:value={rsiSettings.defaultTimeframe} class="input-field p-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm" disabled={!isPro}>
                                        {#each availableTimeframes as tf}
                                            <option value={tf}>{tf}</option>
                                        {/each}
                                    </select>
                                </div>
                            {/if}

                            <div class="grid grid-cols-2 gap-3 mt-1">
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Length</span>
                                    <input type="number" bind:value={rsiSettings.length} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Source</span>
                                    <select bind:value={rsiSettings.source} class="input-field p-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm" disabled={!isPro}>
                                        <option value="close">Close</option>
                                        <option value="open">Open</option>
                                        <option value="high">High</option>
                                        <option value="low">Low</option>
                                        <option value="hl2">HL/2</option>
                                        <option value="hlc3">HLC/3</option>
                                    </select>
                                </div>
                            </div>

                            <div class="border-t border-[var(--border-color)] pt-3 mt-1">
                                <label class="flex items-center gap-2 cursor-pointer mb-2">
                                    <input type="checkbox" bind:checked={rsiSettings.showSignal} class="accent-[var(--accent-color)] h-3 w-3 rounded" disabled={!isPro} />
                                    <span class="text-xs font-medium">Show Signal Line (MA)</span>
                                </label>

                                {#if rsiSettings.showSignal}
                                     <div class="grid grid-cols-2 gap-3 pl-5">
                                        <div class="flex flex-col gap-1">
                                            <span class="text-xs font-medium text-[var(--text-secondary)]">Type</span>
                                            <select bind:value={rsiSettings.signalType} class="input-field p-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm" disabled={!isPro}>
                                                <option value="sma">SMA</option>
                                                <option value="ema">EMA</option>
                                            </select>
                                        </div>
                                        <div class="flex flex-col gap-1">
                                            <span class="text-xs font-medium text-[var(--text-secondary)]">Length</span>
                                            <input type="number" bind:value={rsiSettings.signalLength} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                        </div>
                                     </div>
                                {/if}
                            </div>

                            {#if !isPro}
                                 <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center rounded z-10">
                                    <div class="bg-[var(--bg-secondary)] p-3 rounded shadow border border-[var(--border-color)] text-center">
                                        <p class="text-xs font-bold mb-1">Advanced Settings Locked</p>
                                        <p class="text-[10px] text-[var(--text-secondary)]">Upgrade to Pro to customize RSI calculation.</p>
                                    </div>
                                 </div>
                            {/if}
                        </div>

                        <!-- MACD Settings -->
                        <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden">
                            <div class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1">
                                <h4 class="text-sm font-bold">MACD (Moving Average Convergence Divergence)</h4>
                                {#if !isPro}
                                     <span class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-2 py-0.5 rounded-full">PRO Feature</span>
                                {/if}
                            </div>

                            <div class="grid grid-cols-2 gap-3 mt-1">
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Fast Length</span>
                                    <input type="number" bind:value={macdSettings.fastLength} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Slow Length</span>
                                    <input type="number" bind:value={macdSettings.slowLength} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Signal Length</span>
                                    <input type="number" bind:value={macdSettings.signalLength} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Source</span>
                                    <select bind:value={macdSettings.source} class="input-field p-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm" disabled={!isPro}>
                                        <option value="close">Close</option>
                                        <option value="open">Open</option>
                                        <option value="high">High</option>
                                        <option value="low">Low</option>
                                        <option value="hl2">HL/2</option>
                                        <option value="hlc3">HLC/3</option>
                                    </select>
                                </div>
                            </div>

                            {#if !isPro}
                                 <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center rounded z-10">
                                    <div class="bg-[var(--bg-secondary)] p-3 rounded shadow border border-[var(--border-color)] text-center">
                                        <p class="text-xs font-bold mb-1">Advanced Settings Locked</p>
                                        <p class="text-[10px] text-[var(--text-secondary)]">Upgrade to Pro to customize MACD.</p>
                                    </div>
                                 </div>
                            {/if}
                        </div>

                         <!-- EMA Settings -->
                        <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden">
                            <div class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1">
                                <h4 class="text-sm font-bold">Moving Averages (EMA)</h4>
                                {#if !isPro}
                                     <span class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-2 py-0.5 rounded-full">PRO Feature</span>
                                {/if}
                            </div>

                            <div class="grid grid-cols-3 gap-3 mt-1">
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">EMA 1</span>
                                    <input type="number" bind:value={emaSettings.ema1Length} min="2" max="500" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">EMA 2</span>
                                    <input type="number" bind:value={emaSettings.ema2Length} min="2" max="500" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">EMA 3</span>
                                    <input type="number" bind:value={emaSettings.ema3Length} min="2" max="500" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                            </div>

                            {#if !isPro}
                                 <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center rounded z-10">
                                    <div class="bg-[var(--bg-secondary)] p-3 rounded shadow border border-[var(--border-color)] text-center">
                                        <p class="text-xs font-bold mb-1">Advanced Settings Locked</p>
                                        <p class="text-[10px] text-[var(--text-secondary)]">Upgrade to Pro to customize EMAs.</p>
                                    </div>
                                 </div>
                            {/if}
                        </div>
                    </div>

                    <!-- Right Column -->
                    <div class="flex flex-col gap-4">

                        <!-- Stochastic Settings -->
                        <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden">
                            <div class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1">
                                <h4 class="text-sm font-bold">Stochastic Oscillator</h4>
                                {#if !isPro}
                                     <span class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-2 py-0.5 rounded-full">PRO Feature</span>
                                {/if}
                            </div>

                            <div class="grid grid-cols-2 gap-3 mt-1">
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">%K Length (Period)</span>
                                    <input type="number" bind:value={stochSettings.kPeriod} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">%D Smoothing (Signal)</span>
                                    <input type="number" bind:value={stochSettings.dPeriod} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                            </div>

                            {#if !isPro}
                                 <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center rounded z-10">
                                    <div class="bg-[var(--bg-secondary)] p-3 rounded shadow border border-[var(--border-color)] text-center">
                                        <p class="text-xs font-bold mb-1">Advanced Settings Locked</p>
                                        <p class="text-[10px] text-[var(--text-secondary)]">Upgrade to Pro to customize Stochastic.</p>
                                    </div>
                                 </div>
                            {/if}
                        </div>

                        <!-- CCI Settings -->
                        <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden">
                            <div class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1">
                                <h4 class="text-sm font-bold">Commodity Channel Index (CCI)</h4>
                                {#if !isPro}
                                     <span class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-2 py-0.5 rounded-full">PRO Feature</span>
                                {/if}
                            </div>

                            <div class="grid grid-cols-1 gap-3 mt-1">
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Length</span>
                                    <input type="number" bind:value={cciSettings.length} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                            </div>

                            {#if !isPro}
                                 <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center rounded z-10">
                                    <div class="bg-[var(--bg-secondary)] p-3 rounded shadow border border-[var(--border-color)] text-center">
                                        <p class="text-xs font-bold mb-1">Advanced Settings Locked</p>
                                        <p class="text-[10px] text-[var(--text-secondary)]">Upgrade to Pro to customize CCI.</p>
                                    </div>
                                 </div>
                            {/if}
                        </div>

                        <!-- ADX Settings -->
                        <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden">
                            <div class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1">
                                <h4 class="text-sm font-bold">Average Directional Index (ADX)</h4>
                                {#if !isPro}
                                     <span class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-2 py-0.5 rounded-full">PRO Feature</span>
                                {/if}
                            </div>

                            <div class="grid grid-cols-1 gap-3 mt-1">
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Length</span>
                                    <input type="number" bind:value={adxSettings.length} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                            </div>

                            {#if !isPro}
                                 <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center rounded z-10">
                                    <div class="bg-[var(--bg-secondary)] p-3 rounded shadow border border-[var(--border-color)] text-center">
                                        <p class="text-xs font-bold mb-1">Advanced Settings Locked</p>
                                        <p class="text-[10px] text-[var(--text-secondary)]">Upgrade to Pro to customize ADX.</p>
                                    </div>
                                 </div>
                            {/if}
                        </div>

                        <!-- Awesome Oscillator Settings -->
                        <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden">
                            <div class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1">
                                <h4 class="text-sm font-bold">Awesome Oscillator (AO)</h4>
                                {#if !isPro}
                                     <span class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-2 py-0.5 rounded-full">PRO Feature</span>
                                {/if}
                            </div>

                            <div class="grid grid-cols-2 gap-3 mt-1">
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Fast Period</span>
                                    <input type="number" bind:value={aoSettings.fastLength} min="1" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                                 <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Slow Period</span>
                                    <input type="number" bind:value={aoSettings.slowLength} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                            </div>

                            {#if !isPro}
                                 <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center rounded z-10">
                                    <div class="bg-[var(--bg-secondary)] p-3 rounded shadow border border-[var(--border-color)] text-center">
                                        <p class="text-xs font-bold mb-1">Advanced Settings Locked</p>
                                        <p class="text-[10px] text-[var(--text-secondary)]">Upgrade to Pro to customize AO.</p>
                                    </div>
                                 </div>
                            {/if}
                        </div>

                        <!-- Momentum Settings -->
                        <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden">
                            <div class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1">
                                <h4 class="text-sm font-bold">Momentum</h4>
                                {#if !isPro}
                                     <span class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-2 py-0.5 rounded-full">PRO Feature</span>
                                {/if}
                            </div>

                            <div class="grid grid-cols-1 gap-3 mt-1">
                                <div class="flex flex-col gap-1">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">Length</span>
                                    <input type="number" bind:value={momentumSettings.length} min="1" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                </div>
                            </div>

                            {#if !isPro}
                                 <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center rounded z-10">
                                    <div class="bg-[var(--bg-secondary)] p-3 rounded shadow border border-[var(--border-color)] text-center">
                                        <p class="text-xs font-bold mb-1">Advanced Settings Locked</p>
                                        <p class="text-[10px] text-[var(--text-secondary)]">Upgrade to Pro to customize Momentum.</p>
                                    </div>
                                 </div>
                            {/if}
                        </div>

                        <!-- Pivots Settings -->
                        <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden">
                            <div class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1">
                                <h4 class="text-sm font-bold">Pivot Points</h4>
                                {#if !isPro}
                                     <span class="text-[10px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-2 py-0.5 rounded-full">PRO Feature</span>
                                {/if}
                            </div>

                            <div class="flex flex-col gap-1 mt-1">
                                <span class="text-xs font-medium text-[var(--text-secondary)]">Type</span>
                                <select bind:value={pivotSettings.type} class="input-field p-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm" disabled={!isPro}>
                                    <option value="classic">Classic</option>
                                    <option value="woodie">Woodie</option>
                                    <option value="camarilla">Camarilla</option>
                                    <option value="fibonacci">Fibonacci</option>
                                </select>
                            </div>

                            <div class="flex flex-col gap-1 mt-1">
                                <span class="text-xs font-medium text-[var(--text-secondary)]">View Mode</span>
                                <select bind:value={pivotSettings.viewMode} class="input-field p-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm" disabled={!isPro}>
                                    <option value="integrated">Integrated (Recommended)</option>
                                    <option value="separated">Separated</option>
                                    <option value="abstract">Abstract (Gauge)</option>
                                </select>
                            </div>

                            {#if !isPro}
                                 <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center rounded z-10">
                                    <div class="bg-[var(--bg-secondary)] p-3 rounded shadow border border-[var(--border-color)] text-center">
                                        <p class="text-xs font-bold mb-1">Advanced Settings Locked</p>
                                        <p class="text-[10px] text-[var(--text-secondary)]">Upgrade to Pro to customize Pivots.</p>
                                    </div>
                                 </div>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>

        {:else if activeTab === 'system'}
            <div class="flex flex-col gap-4" role="tabpanel" id="tab-system">
                 <!-- Backup -->
                <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2">
                     <h4 class="text-sm font-bold">{$_('settings.backup')}</h4>
                     <p class="text-xs text-[var(--text-secondary)] mb-2">
                         Save all your settings, presets, and journal entries to a file.
                     </p>
                     <button class="btn btn-secondary text-sm w-full" on:click={handleBackup} disabled={!isPro}>
                        {$_('app.backupButtonAriaLabel')} {!isPro ? '(Pro only)' : ''}
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
    <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--border-color)] shrink-0">
        <button class="px-6 py-2 text-sm font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded hover:opacity-90 transition-opacity" on:click={close}>
            {$_('common.ok') || 'OK'}
        </button>
    </div>
</ModalFrame>
