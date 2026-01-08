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
    let hideUnfilledOrders: boolean;
    let feePreference: 'maker' | 'taker';
    let hotkeyMode: HotkeyMode;

    // Side Panel Settings
    let enableSidePanel: boolean;
    let sidePanelMode: 'chat' | 'notes';

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
    let activeTab: 'general' | 'api' | 'behavior' | 'system' | 'sidebar' = 'general';
    let isInitialized = false;

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
            hideUnfilledOrders = $settingsStore.hideUnfilledOrders;
            feePreference = $settingsStore.feePreference;
            hotkeyMode = $settingsStore.hotkeyMode;
            enableSidePanel = $settingsStore.enableSidePanel;
            sidePanelMode = $settingsStore.sidePanelMode;
            isPro = $settingsStore.isPro;

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
            hideUnfilledOrders,
            feePreference,
            hotkeyMode,
            enableSidePanel,
            sidePanelMode,
            imgbbApiKey,
            imgbbExpiration,
            apiKeys: {
                bitunix: bitunixKeys,
                binance: binanceKeys
            }
        }));
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
    extraClasses="!w-[90vw] md:!w-[62vw] !h-[70vh] flex flex-col"
>
    <!-- Tabs Header -->
    <div class="flex border-b border-[var(--border-color)] mb-4 overflow-x-auto shrink-0">
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
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'sidebar' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'sidebar'}
        >
            Sidebar
        </button>
        <button
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === 'system' ? 'border-[var(--accent-color)] text-[var(--accent-color)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => activeTab = 'system'}
        >
            {$_('settings.tabs.system')}
        </button>
    </div>

    <!-- Tab Content -->
    <div class="flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar flex-1 min-h-0">\n' +
    '\n' +
    "        {#if activeTab === 'general'}\n" +
    '            <div class="flex flex-col gap-4">\n' +
    '                <!-- Language & Theme -->\n' +
    '                <div class="grid grid-cols-2 gap-4">\n' +
    '                    <div class="flex flex-col gap-1">\n' +
    '                        <span class="text-xs font-medium text-[var'... 13968 more characters
}
