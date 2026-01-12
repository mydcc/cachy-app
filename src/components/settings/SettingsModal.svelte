<script lang="ts">
    import ModalFrame from '../shared/ModalFrame.svelte';
    import { settingsStore, type ApiKeys, type HotkeyMode, type PositionViewMode, type AiProvider, type SidePanelLayout } from '../../stores/settingsStore';
    import { indicatorStore, type IndicatorSettings } from '../../stores/indicatorStore';
    import { uiStore } from '../../stores/uiStore';
    import { _, locale, setLocale } from '../../locales/i18n';
    import { createBackup, restoreFromBackup } from '../../services/backupService';
    import { trackCustomEvent } from '../../services/trackingService';
    import { normalizeTimeframeInput } from '../../utils/utils';
    import HotkeySettings from './HotkeySettings.svelte';
    import { HOTKEY_ACTIONS, MODE1_MAP, MODE2_MAP, MODE3_MAP } from '../../services/hotkeyService';

    // Local state for the form inputs
    let apiProvider: 'bitunix' | 'binance';
    let marketDataInterval: '1s' | '1m' | '10m';
    let autoUpdatePriceInput: boolean;
    let autoFetchBalance: boolean;
    let showSidebars: boolean;
    let showTechnicals: boolean;
    let showIndicatorParams: boolean;
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
    let sidePanelLayout: SidePanelLayout;

    // AI Settings
    let aiProviderState: AiProvider;
    let openaiApiKey: string;
    let openaiModel: string;
    let geminiApiKey: string;
    let geminiModel: string;
    let anthropicApiKey: string;
    let anthropicModel: string;

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
    let activeTab: 'general' | 'api' | 'ai' | 'behavior' | 'system' | 'sidebar' | 'indicators' | 'hotkeys' = 'general';
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
            showIndicatorParams = $settingsStore.showIndicatorParams;
            hideUnfilledOrders = $settingsStore.hideUnfilledOrders;
            positionViewMode = $settingsStore.positionViewMode || 'detailed';
            feePreference = $settingsStore.feePreference;
            hotkeyMode = $settingsStore.hotkeyMode;
            enableSidePanel = $settingsStore.enableSidePanel;
            sidePanelMode = $settingsStore.sidePanelMode;
            sidePanelLayout = $settingsStore.sidePanelLayout || 'standard';
            isPro = $settingsStore.isPro;

            aiProviderState = $settingsStore.aiProvider || 'gemini';
            openaiApiKey = $settingsStore.openaiApiKey || '';
            openaiModel = $settingsStore.openaiModel || 'gpt-4o';
            geminiApiKey = $settingsStore.geminiApiKey || '';
            geminiModel = $settingsStore.geminiModel || 'gemini-2.0-flash';
            anthropicApiKey = $settingsStore.anthropicApiKey || '';
            anthropicModel = $settingsStore.anthropicModel || 'claude-3-5-sonnet-20240620';

            favoriteTimeframes = [...$settingsStore.favoriteTimeframes];
            favoriteTimeframesInput = favoriteTimeframes.join(', '); // Init text input
            syncRsiTimeframe = $settingsStore.syncRsiTimeframe;

            historyLimit = $indicatorStore.historyLimit || 2000;
            rsiSettings = { ...$indicatorStore.rsi };
            macdSettings = { ...$indicatorStore.macd };
            stochSettings = { ...$indicatorStore.stochastic };
            cciSettings = { ...$indicatorStore.cci };
            adxSettings = { ...$indicatorStore.adx };
            aoSettings = { ...$indicatorStore.ao };
            momentumSettings = { ...$indicatorStore.momentum };
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
            showIndicatorParams,
            hideUnfilledOrders,
            feePreference,
            hotkeyMode,
            enableSidePanel,
            sidePanelMode,
            sidePanelLayout,
            favoriteTimeframes,
            syncRsiTimeframe,
            imgbbApiKey,
            imgbbExpiration,
            aiProvider: aiProviderState,
            openaiApiKey,
            openaiModel,
            geminiApiKey,
            geminiModel,
            anthropicApiKey,
            anthropicModel,
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

    function getHotkeyDescriptions(mode: string) {
        let map: Record<string, string> = {};
        if (mode === 'mode1') map = MODE1_MAP;
        else if (mode === 'mode2') map = MODE2_MAP;
        else if (mode === 'mode3') map = MODE3_MAP;
        else return [];

        // Group slightly for display or just list them?
        // Listing all might be long. Let's list primary ones.
        return HOTKEY_ACTIONS.map(action => {
            const key = map[action.id];
            if (!key) return null;
            return { keys: key, action: action.label };
        }).filter(x => x !== null);
    }

    // Reactive descriptions based on selected mode
    $: activeDescriptions = getHotkeyDescriptions(hotkeyMode);
</script>

<ModalFrame
    isOpen={$uiStore.showSettingsModal}
    title={$_('settings.title') || 'Settings'}
    on:close={close}
    extraClasses="!w-auto !max-w-[85vw] !h-[80vh] flex flex-col overflow-hidden"
    alignment="top"
>
    <!-- Main Content Container (Split View) -->
    <div class="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        <!-- Sidebar Navigation -->
        <div class="flex md:flex-col overflow-x-auto md:overflow-y-auto md:w-56 border-b md:border-b-0 md:border-r border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)]" role="tablist">
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab === 'general' ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => activeTab = 'general'}
                role="tab"
                aria-selected={activeTab === 'general'}
            >
                {$_('settings.tabs.general')}
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab === 'api' ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => activeTab = 'api'}
                role="tab"
                aria-selected={activeTab === 'api'}
            >
                {$_('settings.tabs.api')}
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab === 'ai' ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => activeTab = 'ai'}
                role="tab"
                aria-selected={activeTab === 'ai'}
            >
                AI Chat
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab === 'behavior' ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => activeTab = 'behavior'}
                role="tab"
                aria-selected={activeTab === 'behavior'}
            >
                {$_('settings.tabs.behavior')}
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab === 'hotkeys' ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => activeTab = 'hotkeys'}
                role="tab"
                aria-selected={activeTab === 'hotkeys'}
            >
                Hotkeys
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab === 'sidebar' ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => activeTab = 'sidebar'}
                role="tab"
                aria-selected={activeTab === 'sidebar'}
            >
                Sidebar
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab === 'indicators' ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => activeTab = 'indicators'}
                role="tab"
                aria-selected={activeTab === 'indicators'}
            >
                Technicals
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab === 'system' ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => activeTab = 'system'}
                role="tab"
                aria-selected={activeTab === 'system'}
            >
                {$_('settings.tabs.system')}
            </button>
        </div>

        <!-- Tab Content Area -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-[var(--bg-primary)]">

            {#if activeTab === 'general'}
                <div class="flex flex-col gap-4" role="tabpanel" id="tab-general" aria-labelledby="tab-general-label">
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
                    <div class="flex flex-col gap-1">
                        <span class="text-sm font-medium">{$_('settings.providerLabel')}</span>
                        <select bind:value={apiProvider} class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                            <option value="bitunix">Bitunix</option>
                            <option value="binance">Binance Futures</option>
                        </select>
                    </div>
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
                        <div class="flex flex-col gap-4 pt-4 border-t border-[var(--border-color)]">
                            <div class="flex flex-col gap-2">
                                <label for="openai-key" class="text-xs font-bold flex items-center gap-2">
                                    <span>OpenAI</span>
                                    {#if aiProviderState === 'openai'}<span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"></span>{/if}
                                </label>
                                <input id="openai-key" type="password" bind:value={openaiApiKey} class="input-field p-1 px-2 rounded text-sm mb-1" placeholder="API Key (sk-...)" />
                                <div class="flex items-center gap-2">
                                    <span class="text-[10px] text-[var(--text-secondary)] w-12">Model:</span>
                                    <input type="text" bind:value={openaiModel} class="input-field p-1 px-2 rounded text-xs flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)]" placeholder="gpt-4o" />
                                </div>
                            </div>
                            <div class="flex flex-col gap-2 border-t border-[var(--border-color)] pt-3">
                                <label for="gemini-key" class="text-xs font-bold flex items-center gap-2">
                                    <span>Google Gemini</span>
                                    {#if aiProviderState === 'gemini'}<span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"></span>{/if}
                                </label>
                                <input id="gemini-key" type="password" bind:value={geminiApiKey} class="input-field p-1 px-2 rounded text-sm mb-1" placeholder="API Key (AIza...)" />
                                <div class="flex items-center gap-2">
                                    <span class="text-[10px] text-[var(--text-secondary)] w-12">Model:</span>
                                    <input type="text" bind:value={geminiModel} class="input-field p-1 px-2 rounded text-xs flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)]" placeholder="gemini-2.0-flash-exp" />
                                </div>
                                <p class="text-[10px] text-[var(--text-secondary)] italic">
                                    Use <code>gemini-1.5-flash</code> for stability if the experimental version fails.
                                </p>
                            </div>
                            <div class="flex flex-col gap-2 border-t border-[var(--border-color)] pt-3">
                                <label for="anthropic-key" class="text-xs font-bold flex items-center gap-2">
                                    <span>Anthropic</span>
                                    {#if aiProviderState === 'anthropic'}<span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"></span>{/if}
                                </label>
                                <input id="anthropic-key" type="password" bind:value={anthropicApiKey} class="input-field p-1 px-2 rounded text-sm mb-1" placeholder="API Key (sk-ant-...)" />
                                <div class="flex items-center gap-2">
                                    <span class="text-[10px] text-[var(--text-secondary)] w-12">Model:</span>
                                    <input type="text" bind:value={anthropicModel} class="input-field p-1 px-2 rounded text-xs flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)]" placeholder="claude-3-5-sonnet-20240620" />
                                </div>
                            </div>
                        </div>
                        <p class="text-[10px] text-[var(--text-secondary)] mt-2 italic border-t border-[var(--border-color)] pt-2">
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
                    <div class="flex flex-col gap-2 pt-2 border-t border-[var(--border-color)]">
                         <span class="text-sm font-medium">Hotkey Profile</span>
                         <select bind:value={hotkeyMode} class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                            <option value="custom">Custom (Fully Configurable)</option>
                            <option value="mode2">Safety Mode (Alt + Key)</option>
                            <option value="mode1">Direct Mode (Fast)</option>
                            <option value="mode3">Hybrid Mode</option>
                         </select>
                         {#if hotkeyMode !== 'custom'}
                             <div class="bg-[var(--bg-tertiary)] p-3 rounded text-xs text-[var(--text-secondary)] mt-1">
                                <div class="font-bold mb-2 text-[var(--text-primary)]">Active Hotkeys ({activeDescriptions.length}):</div>
                                <div class="grid grid-cols-2 gap-x-4 gap-y-1 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                    {#each activeDescriptions as desc}
                                        <div class="flex justify-between gap-4">
                                            <span class="font-mono text-[var(--accent-color)] whitespace-nowrap">{desc.keys}</span>
                                            <span class="truncate">{desc.action}</span>
                                        </div>
                                    {/each}
                                </div>
                             </div>
                         {:else}
                             <div class="bg-[var(--bg-tertiary)] p-3 rounded text-xs text-[var(--text-secondary)] mt-1">
                                <p>Configure your custom hotkeys in the "Hotkeys" tab.</p>
                             </div>
                         {/if}
                    </div>
                </div>

            {:else if activeTab === 'hotkeys'}
                <div class="flex flex-col h-full" role="tabpanel" id="tab-hotkeys">
                    {#if hotkeyMode !== 'custom'}
                        <div class="flex flex-col items-center justify-center h-full p-6 text-center text-[var(--text-secondary)]">
                            <p class="mb-4">You are currently using a preset Hotkey Mode.</p>
                            <button
                                class="px-4 py-2 bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded font-bold text-sm"
                                on:click={() => hotkeyMode = 'custom'}
                            >
                                Switch to Custom Mode to Edit
                            </button>
                        </div>
                    {:else}
                        <HotkeySettings />
                    {/if}
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
                    <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium">{$_('settings.enableSidePanel')}</span>
                            <span class="text-xs text-[var(--text-secondary)]">{$_('settings.sidePanelDesc')}</span>
                        </div>
                        <input type="checkbox" bind:checked={enableSidePanel} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                    </label>
                    <div class="flex flex-col gap-3 ml-4 border-l-2 border-[var(--border-color)] pl-4 transition-opacity duration-200 {enableSidePanel ? 'opacity-100' : 'opacity-50 pointer-events-none'}">
                        <div class="flex flex-col gap-1">
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
                        <div class="flex flex-col gap-1">
                            <span class="text-sm font-medium">{$_('settings.sidePanelLayout')}</span>
                            <div class="flex flex-col gap-2">
                                 <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                                    <input type="radio" bind:group={sidePanelLayout} value="standard" class="accent-[var(--accent-color)]" />
                                    <div class="flex flex-col">
                                        <span class="text-sm">{$_('settings.layoutStandard')}</span>
                                        <span class="text-[10px] text-[var(--text-secondary)]">{$_('settings.layoutStandardDesc')}</span>
                                    </div>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                                    <input type="radio" bind:group={sidePanelLayout} value="transparent" class="accent-[var(--accent-color)]" />
                                    <div class="flex flex-col">
                                        <span class="text-sm">{$_('settings.layoutTransparent')}</span>
                                        <span class="text-[10px] text-[var(--text-secondary)]">{$_('settings.layoutTransparentDesc')}</span>
                                    </div>
                                </label>
                                 <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                                    <input type="radio" bind:group={sidePanelLayout} value="floating" class="accent-[var(--accent-color)]" />
                                    <div class="flex flex-col">
                                        <span class="text-sm">{$_('settings.layoutFloating')}</span>
                                        <span class="text-[10px] text-[var(--text-secondary)]">{$_('settings.layoutFloatingDesc')}</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                     <label class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]">
                        <span class="text-sm font-medium">{$_('settings.hideUnfilledOrders')}</span>
                        <input type="checkbox" bind:checked={hideUnfilledOrders} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                    </label>
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
                    <!-- Moved Toggle Here -->
                    <label class="flex items-center justify-between p-3 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)] bg-[var(--bg-tertiary)] mb-2">
                        <span class="text-sm font-medium">{$_('settings.showIndicatorParams')}</span>
                        <input type="checkbox" bind:checked={showIndicatorParams} class="accent-[var(--accent-color)] h-4 w-4 rounded" />
                    </label>

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
                                <!-- NEW: MA Types -->
                                <div class="grid grid-cols-2 gap-3 mt-1 pt-2 border-t border-[var(--border-color)]">
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">Oscillator MA Type</span>
                                        <select bind:value={macdSettings.oscillatorMaType} class="input-field p-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm" disabled={!isPro}>
                                            <option value="ema">EMA</option>
                                            <option value="sma">SMA</option>
                                        </select>
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">Signal MA Type</span>
                                        <select bind:value={macdSettings.signalMaType} class="input-field p-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm" disabled={!isPro}>
                                            <option value="ema">EMA</option>
                                            <option value="sma">SMA</option>
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

                                <div class="grid grid-cols-3 gap-3 mt-1">
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">%K Length</span>
                                        <input type="number" bind:value={stochSettings.kPeriod} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">%K Smooth</span>
                                        <input type="number" bind:value={stochSettings.kSmoothing} min="1" max="50" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">%D Smooth</span>
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

                                <div class="grid grid-cols-2 gap-3 mt-1">
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">Length</span>
                                        <input type="number" bind:value={cciSettings.length} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">Source</span>
                                        <select bind:value={cciSettings.source} class="input-field p-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm" disabled={!isPro}>
                                            <option value="close">Close</option>
                                            <option value="open">Open</option>
                                            <option value="high">High</option>
                                            <option value="low">Low</option>
                                            <option value="hl2">HL/2</option>
                                            <option value="hlc3">HLC/3</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="border-t border-[var(--border-color)] pt-3 mt-1 grid grid-cols-2 gap-3">
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">Smoothing Type</span>
                                        <select bind:value={cciSettings.smoothingType} class="input-field p-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm" disabled={!isPro}>
                                            <option value="sma">SMA</option>
                                            <option value="ema">EMA</option>
                                        </select>
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">Smoothing Len</span>
                                        <input type="number" bind:value={cciSettings.smoothingLength} min="1" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
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

                                <div class="grid grid-cols-2 gap-3 mt-1">
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">ADX Smoothing</span>
                                        <input type="number" bind:value={adxSettings.adxSmoothing} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">DI Length</span>
                                        <input type="number" bind:value={adxSettings.diLength} min="2" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
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

                                <div class="grid grid-cols-2 gap-3 mt-1">
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">Length</span>
                                        <input type="number" bind:value={momentumSettings.length} min="1" max="100" class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]" disabled={!isPro} />
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <span class="text-xs font-medium text-[var(--text-secondary)]">Source</span>
                                        <select bind:value={momentumSettings.source} class="input-field p-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm" disabled={!isPro}>
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
                <!-- ... [System tab content same as read file] ... -->
                <div class="flex flex-col gap-4" role="tabpanel" id="tab-system">
                    <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2">
                         <h4 class="text-sm font-bold">CachyLog Debug</h4>
                         <p class="text-xs text-[var(--text-secondary)] mb-2">
                             Trigger a test log on the server to verify browser console logging (CL: prefix).
                         </p>
                         <button class="btn btn-secondary text-sm w-full" on:click={() => fetch('/api/test-log', { method: 'POST' })}>
                            Trigger Server Log
                         </button>
                    </div>
                    <div class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2">
                         <h4 class="text-sm font-bold">{$_('settings.backup')}</h4>
                         <p class="text-xs text-[var(--text-secondary)] mb-2">
                             Save all your settings, presets, and journal entries to a file.
                         </p>
                         <button class="btn btn-secondary text-sm w-full" on:click={handleBackup} disabled={!isPro}>
                            {$_('app.backupButtonAriaLabel')} {!isPro ? '(Pro only)' : ''}
                         </button>
                    </div>
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
                    <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
                         <button class="text-xs text-[var(--danger-color)] hover:underline" on:click={handleReset}>
                             {$_('settings.reset')}
                         </button>
                    </div>
                </div>
            {/if}

        </div>
    </div>

    <!-- Footer Actions -->
    <div class="flex justify-end gap-3 pt-4 border-t border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)] px-4 pb-4">
        <button class="px-6 py-2 text-sm font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded hover:opacity-90 transition-opacity" on:click={close}>
            {$_('common.ok') || 'OK'}
        </button>
    </div>
</ModalFrame>
