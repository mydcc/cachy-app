<script lang="ts">
    import { onMount } from 'svelte';
    import { settingsStore } from '../../stores/settingsStore';
    import { tradeStore } from '../../stores/tradeStore';
    import { accountStore } from '../../stores/accountStore';
    import { _ } from '../../locales/i18n';
    
    // Sub-components
    import AccountSummary from './AccountSummary.svelte';
    import OpenOrdersList from './OpenOrdersList.svelte';
    import OrderHistoryList from './OrderHistoryList.svelte';
    import PositionsList from './PositionsList.svelte';

    export let isMobile = false;

    let isOpen = true;

    // Data State
    // Using store subscription for positions to react to WebSocket updates
    // For orders/history, we still fetch, but accountStore also has openOrders

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

    // Context Menu State
    let showContextMenu = false;
    let contextMenuX = 0;
    let contextMenuY = 0;

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
            else {
                // Initial Population of Store if needed, or just let WS handle it?
                // For now, let's trust the WS to update, but initial fetch is good.
                // We'll update the local store manually? Or rely on accountStore?
                // Since PositionsList uses `positions` prop, let's pass data.
                // Ideally, accountStore should manage this.
                if (data.positions) {
                    accountStore.set(prev => ({ ...prev, positions: data.positions }));
                }
            }
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
            if (activeTab === 'orders') fetchOrders('pending');
            if (activeTab === 'history') fetchOrders('history');
        }
    }

    onMount(() => {
        refreshAll();
        const provider = $settingsStore.apiProvider || 'bitunix';
        const keys = $settingsStore.apiKeys[provider];
        if (keys?.key && keys?.secret) {
             fetchOrders('pending');
        }

        const interval = setInterval(refreshAll, 10000);
        return () => clearInterval(interval);
    });

    $: if (activeTab === 'orders') fetchOrders('pending');
    $: if (activeTab === 'history') fetchOrders('history');

    // Filter History
    let filteredHistoryOrders: any[] = [];
    $: {
        if ($settingsStore.hideUnfilledOrders) {
             filteredHistoryOrders = historyOrders.filter(o => Number(o.filled || o.dealAmount || 0) > 0);
        } else {
             filteredHistoryOrders = historyOrders;
        }
    }

    function toggle() {
        isOpen = !isOpen;
    }

    function handleKeydown(event: KeyboardEvent, callback: () => void) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            callback();
        }
    }

    // Context Menu Handling
    function handleContextMenu(event: MouseEvent) {
        if (activeTab !== 'positions') return;
        event.preventDefault();
        contextMenuX = event.clientX;
        contextMenuY = event.clientY;
        showContextMenu = true;
    }

    function setViewMode(mode: 'detailed' | 'focus') {
        settingsStore.update(s => ({ ...s, positionViewMode: mode }));
        showContextMenu = false;
    }

    function closeContextMenu() {
        showContextMenu = false;
    }

    // Actions
    async function handleClosePosition(event: CustomEvent) {
        const pos = event.detail;
        console.log("Closing Position:", pos);

        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exchange: $settingsStore.apiProvider,
                    apiKey: $settingsStore.apiKeys[$settingsStore.apiProvider].key,
                    apiSecret: $settingsStore.apiKeys[$settingsStore.apiProvider].secret,
                    type: 'close-position', // Helper type
                    symbol: pos.symbol,
                    side: pos.side === 'long' ? 'sell' : 'buy', // Close opposite
                    amount: pos.size
                })
            });

            const res = await response.json();
            if (res.error) {
                alert(`Error closing position: ${res.error}`);
            } else {
                // Trigger refresh or wait for WS
            }
        } catch (e) {
            alert('Failed to send close order.');
        }
    }

    async function handleTpSl(event: CustomEvent) {
        const pos = event.detail;
        console.log("Edit TP/SL for:", pos);
        // Placeholder: Could open a modal or just pre-fill trade inputs
        // For now, let's load it into the Trade Inputs
        tradeStore.update(s => ({
            ...s,
            symbol: pos.symbol,
            entryPrice: Number(pos.entryPrice),
            quantity: Number(pos.size),
            leverage: Number(pos.leverage)
        }));
        alert(`Loaded ${pos.symbol} into trade inputs. Configure TP/SL there and submit.`);
    }

</script>

<svelte:window on:click={closeContextMenu} />

<div class="bg-[var(--bg-secondary)] rounded-xl shadow-lg border border-[var(--border-color)] overflow-hidden flex flex-col transition-all duration-300 {isMobile ? 'w-full' : 'w-80'}" class:h-auto={isOpen} class:h-12={!isOpen}>
    <!-- Header / Toggle -->
    <div
        class="p-3 flex justify-between items-center bg-[var(--bg-tertiary)] cursor-pointer select-none border-b border-[var(--border-color)]"
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
        <div class="flex border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
            <button 
                class="flex-1 py-2 text-xs font-bold transition-colors border-b-2"
                class:text-[var(--accent-color)]={activeTab === 'positions'}
                class:border-[var(--accent-color)]={activeTab === 'positions'}
                class:text-[var(--text-secondary)]={activeTab !== 'positions'}
                class:border-transparent={activeTab !== 'positions'}
                on:click={() => activeTab = 'positions'}
                on:contextmenu={handleContextMenu}
            >
                {$_('dashboard.positions') || 'Positions'} ({$accountStore.positions.length})
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
                <PositionsList
                    positions={$accountStore.positions}
                    loading={loadingPositions}
                    error={errorPositions}
                    on:close={handleClosePosition}
                    on:tpSl={handleTpSl}
                />
            {:else if activeTab === 'orders'}
                <OpenOrdersList orders={openOrders} loading={loadingOrders} error={errorOrders} />
            {:else if activeTab === 'history'}
                <OrderHistoryList orders={filteredHistoryOrders} loading={loadingHistory} error={errorHistory} />
            {/if}
        </div>
    {/if}
</div>

{#if showContextMenu}
    <div
        class="fixed z-[10000] bg-[var(--bg-tertiary)] border border-[var(--border-color)] shadow-xl rounded py-1 w-40 text-xs"
        style="top: {contextMenuY}px; left: {contextMenuX}px;"
    >
        <div class="px-3 py-1 text-[var(--text-secondary)] font-bold border-b border-[var(--border-color)] mb-1">View Mode</div>
        <button class="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] flex justify-between"
                on:click={() => setViewMode('detailed')}>
            Detailed
            {#if $settingsStore.positionViewMode === 'detailed'}✓{/if}
        </button>
        <button class="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] flex justify-between"
                on:click={() => setViewMode('focus')}>
            Focus
            {#if $settingsStore.positionViewMode === 'focus'}✓{/if}
        </button>
    </div>
{/if}
