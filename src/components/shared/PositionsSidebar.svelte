<script lang="ts">
    import { onMount } from 'svelte';
    import { settingsStore } from '../../stores/settingsStore';
    import { tradeStore } from '../../stores/tradeStore';
    import { _ } from '../../locales/i18n';
    import { formatDynamicDecimal } from '../../utils/utils';

    // Sub-components
    import AccountSummary from './AccountSummary.svelte';
    import OpenOrdersList from './OpenOrdersList.svelte';
    import OrderHistoryList from './OrderHistoryList.svelte';

    let isOpen = true;

    // Data State
    let positions: any[] = [];
    let openOrders: any[] = [];
    let historyOrders: any[] = [];
    let accountInfo: any = { available: 0, margin: 0, totalUnrealizedPnL: 0, marginCoin: 'USDT' };

    // Loading State
    let loadingPositions = false;
    let loadingOrders = false;
    let loadingHistory = false;
    let loadingAccount = false;

    // Error State
    let errorPositions = '';
    let errorOrders = '';
    let errorHistory = '';

    // Tab State
    type Tab = 'positions' | 'orders' | 'history';
    let activeTab: Tab = 'positions';

    async function fetchPositions() {
        const provider = $settingsStore.apiProvider || 'bitunix';
        const keys = $settingsStore.apiKeys[provider];

        if (!keys?.key || !keys?.secret) return;

        loadingPositions = true;
        errorPositions = '';
        try {
            const response = await fetch('/api/positions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exchange: provider, apiKey: keys.key, apiSecret: keys.secret })
            });
            const data = await response.json();
            if (data.error) errorPositions = data.error;
            else positions = data.positions || [];
        } catch (e) {
            errorPositions = 'Failed to load positions';
        } finally {
            loadingPositions = false;
        }
    }

    async function fetchOrders(type: 'pending' | 'history') {
        const provider = $settingsStore.apiProvider || 'bitunix';
        const keys = $settingsStore.apiKeys[provider];
        if (!keys?.key || !keys?.secret) return;

        if (type === 'pending') {
            loadingOrders = true;
            errorOrders = '';
        } else {
            loadingHistory = true;
            errorHistory = '';
        }

        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exchange: provider, apiKey: keys.key, apiSecret: keys.secret, type })
            });
            const data = await response.json();
            if (data.error) {
                if (type === 'pending') errorOrders = data.error;
                else errorHistory = data.error;
            } else {
                if (type === 'pending') openOrders = data.orders || [];
                else historyOrders = data.orders || [];
            }
        } catch (e) {
            const msg = `Failed to load ${type} orders`;
            if (type === 'pending') errorOrders = msg;
            else errorHistory = msg;
        } finally {
            if (type === 'pending') loadingOrders = false;
            else loadingHistory = false;
        }
    }

    async function fetchAccount() {
        const provider = $settingsStore.apiProvider || 'bitunix';
        const keys = $settingsStore.apiKeys[provider];
        if (!keys?.key || !keys?.secret) return;

        loadingAccount = true;
        try {
            const response = await fetch('/api/account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exchange: provider, apiKey: keys.key, apiSecret: keys.secret })
            });
            const data = await response.json();
            if (!data.error) {
                accountInfo = data;
            }
        } catch (e) {
            console.error(e);
        } finally {
            loadingAccount = false;
        }
    }

    function refreshAll() {
        const provider = $settingsStore.apiProvider || 'bitunix';
        const keys = $settingsStore.apiKeys[provider];
        if (keys?.key && keys?.secret) {
            fetchAccount();
            fetchPositions();
            // Fetch orders only if tab is active to save API calls, or just fetch all?
            // Let's fetch active tab data more frequently
            if (activeTab === 'orders') fetchOrders('pending');
            if (activeTab === 'history') fetchOrders('history');
        }
    }

    onMount(() => {
        refreshAll();
        // Initial fetch for background tabs too so they aren't empty when clicked
        const provider = $settingsStore.apiProvider || 'bitunix';
        const keys = $settingsStore.apiKeys[provider];
        if (keys?.key && keys?.secret) {
             fetchOrders('pending');
             // History maybe less frequent?
        }

        const interval = setInterval(refreshAll, 10000); // 10s poll
        return () => clearInterval(interval);
    });

    // React to tab changes
    $: if (activeTab === 'orders') fetchOrders('pending');
    $: if (activeTab === 'history') fetchOrders('history');

    function toggle() {
        isOpen = !isOpen;
    }

    function selectSymbol(symbol: string) {
        tradeStore.update(s => ({ ...s, symbol: symbol }));
    }

    function handleKeydown(event: KeyboardEvent, callback: () => void) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            callback();
        }
    }
</script>

<div class="bg-[var(--bg-secondary)] rounded-xl shadow-lg border border-[var(--border-primary)] overflow-hidden flex flex-col transition-all duration-300 w-80" class:h-auto={isOpen} class:h-12={!isOpen}>
    <!-- Header / Toggle -->
    <div
        class="p-3 flex justify-between items-center bg-[var(--bg-tertiary)] cursor-pointer select-none border-b border-[var(--border-primary)]"
        on:click={toggle}
        on:keydown={(e) => handleKeydown(e, toggle)}
        role="button"
        tabindex="0"
        aria-expanded={isOpen}
    >
        <h3 class="font-bold text-sm text-[var(--text-primary)]">{$_('dashboard.marketActivity') || 'Market Activity'}</h3>
        <div class="text-[var(--text-secondary)] transform transition-transform duration-200" class:rotate-180={!isOpen}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
        </div>
    </div>

    {#if isOpen}
        <!-- Account Summary -->
        <AccountSummary
            available={accountInfo.available}
            margin={accountInfo.margin}
            pnl={accountInfo.totalUnrealizedPnL}
            currency={accountInfo.marginCoin}
        />

        <!-- Tabs -->
        <div class="flex border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
            <button
                class="flex-1 py-2 text-xs font-bold transition-colors border-b-2"
                class:text-[var(--accent-color)]={activeTab === 'positions'}
                class:border-[var(--accent-color)]={activeTab === 'positions'}
                class:text-[var(--text-secondary)]={activeTab !== 'positions'}
                class:border-transparent={activeTab !== 'positions'}
                on:click={() => activeTab = 'positions'}
            >
                {$_('dashboard.positions') || 'Positions'} ({positions.length})
            </button>
            <button
                class="flex-1 py-2 text-xs font-bold transition-colors border-b-2"
                class:text-[var(--accent-color)]={activeTab === 'orders'}
                class:border-[var(--accent-color)]={activeTab === 'orders'}
                class:text-[var(--text-secondary)]={activeTab !== 'orders'}
                class:border-transparent={activeTab !== 'orders'}
                on:click={() => activeTab = 'orders'}
            >
                {$_('dashboard.orders') || 'Orders'} ({openOrders.length})
            </button>
            <button
                class="flex-1 py-2 text-xs font-bold transition-colors border-b-2"
                class:text-[var(--accent-color)]={activeTab === 'history'}
                class:border-[var(--accent-color)]={activeTab === 'history'}
                class:text-[var(--text-secondary)]={activeTab !== 'history'}
                class:border-transparent={activeTab !== 'history'}
                on:click={() => activeTab = 'history'}
            >
                {$_('dashboard.history') || 'History'}
            </button>
        </div>

        <!-- Content Area -->
        <div class="bg-[var(--bg-secondary)]">
            {#if activeTab === 'positions'}
                 <div class="p-2 overflow-y-auto max-h-[500px] scrollbar-thin">
                    {#if !$settingsStore.apiKeys[$settingsStore.apiProvider]?.key}
                        <div class="text-xs text-[var(--text-secondary)] text-center p-4">
                            {$_('dashboard.configureApiKeys') || 'Please configure API keys in settings.'}
                        </div>
                    {:else if loadingPositions && positions.length === 0}
                        <div class="flex justify-center p-4">
                            <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--accent-color)]"></div>
                        </div>
                    {:else if errorPositions}
                        <div class="text-xs text-[var(--danger-color)] p-2 text-center">{errorPositions}</div>
                    {:else if positions.length === 0}
                        <div class="text-xs text-[var(--text-secondary)] text-center p-4">
                            {$_('dashboard.noOpenPositions') || 'No open positions.'}
                        </div>
                    {:else}
                        <div class="flex flex-col gap-2">
                            {#each positions as pos}
                                <div
                                    class="bg-[var(--bg-primary)] rounded-lg p-2 border border-[var(--border-primary)] hover:border-[var(--accent-color)] cursor-pointer transition-colors"
                                    on:click={() => selectSymbol(pos.symbol)}
                                    on:keydown={(e) => handleKeydown(e, () => selectSymbol(pos.symbol))}
                                    role="button"
                                    tabindex="0"
                                >
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="font-bold text-sm text-[var(--text-primary)]">{pos.symbol}</span>
                                        <span class="text-xs font-bold px-1.5 py-0.5 rounded"
                                            class:bg-green-900={pos.side === 'LONG'} class:text-green-300={pos.side === 'LONG'}
                                            class:bg-red-900={pos.side === 'SHORT'} class:text-red-300={pos.side === 'SHORT'}>
                                            {pos.side} {pos.leverage}x
                                        </span>
                                    </div>
                                    <div class="flex justify-between text-xs mb-1">
                                        <span class="text-[var(--text-secondary)]">Size:</span>
                                        <span class="text-[var(--text-primary)]">{formatDynamicDecimal(pos.size)}</span>
                                    </div>
                                    <div class="flex justify-between text-xs mb-1">
                                        <span class="text-[var(--text-secondary)]">Entry:</span>
                                        <span class="text-[var(--text-primary)]">{formatDynamicDecimal(pos.entryPrice)}</span>
                                    </div>
                                     <div class="flex justify-between text-xs border-t border-[var(--border-primary)] pt-1 mt-1">
                                        <span class="text-[var(--text-secondary)]">PnL:</span>
                                        <span class:text-[var(--success-color)]={pos.unrealizedPnL > 0} class:text-[var(--danger-color)]={pos.unrealizedPnL < 0}>
                                            {formatDynamicDecimal(pos.unrealizedPnL)} USDT
                                        </span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {:else if activeTab === 'orders'}
                <OpenOrdersList orders={openOrders} loading={loadingOrders} error={errorOrders} />
            {:else if activeTab === 'history'}
                <OrderHistoryList orders={historyOrders} loading={loadingHistory} error={errorHistory} />
            {/if}
        </div>
    {/if}
</div>

<style>
    /* Custom scrollbar for the list */
    .scrollbar-thin::-webkit-scrollbar {
        width: 4px;
    }
    .scrollbar-thin::-webkit-scrollbar-track {
        background: transparent;
    }
    .scrollbar-thin::-webkit-scrollbar-thumb {
        background-color: var(--border-primary);
        border-radius: 20px;
    }
</style>
