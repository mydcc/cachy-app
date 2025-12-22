<script lang="ts">
    import { _ } from '../../locales/i18n';
    import { formatDynamicDecimal } from '../../utils/utils';

    export let orders: any[] = [];
    export let loading: boolean = false;
    export let error: string = '';

    function handleCancel(orderId: string) {
        // Implement cancellation logic later if API allows, for now just log
        console.log('Cancel order', orderId);
        // Dispatch event if parent handles it
    }
</script>

<div class="p-2 overflow-y-auto max-h-[500px] scrollbar-thin">
    {#if loading && orders.length === 0}
        <div class="flex justify-center p-4">
            <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--accent-color)]"></div>
        </div>
    {:else if error}
        <div class="text-xs text-[var(--danger-color)] p-2 text-center">{error}</div>
    {:else if orders.length === 0}
        <div class="text-xs text-[var(--text-secondary)] text-center p-4">
            {$_('dashboard.noOpenOrders') || 'No open orders.'}
        </div>
    {:else}
        <div class="flex flex-col gap-2">
            {#each orders as order}
                <div class="bg-[var(--bg-primary)] rounded-lg p-2 border border-[var(--border-primary)] relative group">
                     <!-- Header -->
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-bold text-sm text-[var(--text-primary)]">{order.symbol}</span>
                        <span class="text-xs font-bold px-1.5 py-0.5 rounded uppercase"
                              class:bg-green-900={order.side === 'BUY'} class:text-green-300={order.side === 'BUY'}
                              class:bg-red-900={order.side === 'SELL'} class:text-red-300={order.side === 'SELL'}>
                            {order.side}
                        </span>
                    </div>

                    <!-- Details -->
                    <div class="grid grid-cols-2 gap-y-1 text-xs">
                        <span class="text-[var(--text-secondary)]">{$_('dashboard.type') || 'Type'}:</span>
                        <span class="text-right text-[var(--text-primary)]">{order.type}</span>
                        
                        <span class="text-[var(--text-secondary)]">{$_('dashboard.price') || 'Price'}:</span>
                        <span class="text-right text-[var(--text-primary)]">{formatDynamicDecimal(order.price)}</span>
                        
                        <span class="text-[var(--text-secondary)]">{$_('dashboard.amount') || 'Amount'}:</span>
                        <span class="text-right text-[var(--text-primary)]">{formatDynamicDecimal(order.amount)}</span>
                        
                        <span class="text-[var(--text-secondary)]">{$_('dashboard.filled') || 'Filled'}:</span>
                        <span class="text-right text-[var(--text-primary)]">{formatDynamicDecimal(order.filled)}</span>
                    </div>

                    <!-- Cancel Button (Visual only for now unless endpoint added) -->
                    <!-- 
                    <button class="absolute top-2 right-2 text-[var(--text-secondary)] hover:text-[var(--danger-color)] opacity-0 group-hover:opacity-100 transition-opacity" 
                            on:click|stopPropagation={() => handleCancel(order.id)} title="Cancel Order">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    -->
                </div>
            {/each}
        </div>
    {/if}
</div>
