<script lang="ts">
    import { onMount } from 'svelte';
    import { settingsStore } from '../../stores/settingsStore';
    import { tradeStore } from '../../stores/tradeStore';
    import { _ } from '../../locales/i18n';
    import { formatDynamicDecimal } from '../../utils/utils';

    let isOpen = true;
    let positions: any[] = [];
    let loading = false;
    let error = '';

    // Function to fetch positions
    async function fetchPositions() {
        const provider = $settingsStore.apiProvider || 'bitunix';
        const keys = $settingsStore.apiKeys[provider];

        if (!keys?.key || !keys?.secret) {
            return;
        }

        loading = true;
        error = '';
        try {
            const response = await fetch('/api/positions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    exchange: provider,
                    apiKey: keys.key,
                    apiSecret: keys.secret
                })
            });

            const data = await response.json();

            if (data.error) {
                error = data.error;
            } else {
                positions = data.positions || [];
            }
        } catch (e) {
            error = 'Failed to load positions';
            console.error(e);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        const provider = $settingsStore.apiProvider || 'bitunix';
        const keys = $settingsStore.apiKeys[provider];

        // Initial fetch
        if (keys?.key && keys?.secret) {
            fetchPositions();

            // Poll every 10 seconds
            const interval = setInterval(fetchPositions, 10000);
            return () => clearInterval(interval);
        }
    });

    function toggle() {
        isOpen = !isOpen;
    }

    function selectSymbol(symbol: string) {
        // Update trade store with selected symbol
        // We might want to parse the symbol to remove USDT if needed, but usually it matches
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
    <!-- Header -->
    <div
        class="p-3 flex justify-between items-center bg-[var(--bg-tertiary)] cursor-pointer select-none border-b border-[var(--border-primary)]"
        on:click={toggle}
        on:keydown={(e) => handleKeydown(e, toggle)}
        role="button"
        tabindex="0"
        aria-expanded={isOpen}
    >
        <h3 class="font-bold text-sm text-[var(--text-primary)]">{$_('dashboard.openPositions') || 'Open Positions'}</h3>
        <div class="text-[var(--text-secondary)] transform transition-transform duration-200" class:rotate-180={!isOpen}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
        </div>
    </div>

    {#if isOpen}
        <div class="p-2 overflow-y-auto max-h-[600px] scrollbar-thin">
            {#if !$settingsStore.apiKeys[$settingsStore.apiProvider]?.key}
                <div class="text-xs text-[var(--text-secondary)] text-center p-4">
                    {$_('dashboard.configureApiKeys') || 'Please configure API keys in settings.'}
                </div>
            {:else if loading && positions.length === 0}
                <div class="flex justify-center p-4">
                    <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--accent-color)]"></div>
                </div>
            {:else if error}
                <div class="text-xs text-[var(--danger-color)] p-2 text-center">{error}</div>
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
