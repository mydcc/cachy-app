<script lang="ts">
    import { _ } from '../../locales/i18n';
    import { formatDynamicDecimal } from '../../utils/utils';

    export let orders: any[] = [];
    export let loading: boolean = false;
    export let error: string = '';

    function formatDate(timestamp: number) {
        if (!timestamp) return '-';
        const date = new Date(Number(timestamp));
        if (isNaN(date.getTime())) return '-';

        // Format: DD.MM. HH:mm
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${day}.${month}. ${hours}:${minutes}`;
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
            {$_('dashboard.noHistory') || 'No history found.'}
        </div>
    {:else}
        <div class="flex flex-col gap-2">
            {#each orders as order}
                <div class="bg-[var(--bg-primary)] rounded-lg p-2 border border-[var(--border-primary)]">
                    <!-- Row 1: Symbol & Side -->
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-bold text-sm text-[var(--text-primary)]">{order.symbol}</span>
                        <span class="text-xs font-bold px-1.5 py-0.5 rounded uppercase"
                              class:bg-green-900={order.side === 'BUY'} class:text-green-300={order.side === 'BUY'}
                              class:bg-red-900={order.side === 'SELL'} class:text-red-300={order.side === 'SELL'}>
                            {order.side}
                        </span>
                    </div>

                    <!-- Row 2: Date & Price -->
                    <div class="flex justify-between text-xs mb-1">
                         <span class="text-[var(--text-secondary)]">{formatDate(order.time)}</span>
                         <span class="text-[var(--text-primary)]">{formatDynamicDecimal(order.price)}</span>
                    </div>

                    <!-- Row 3: Filled & PnL -->
                    <div class="flex justify-between text-xs">
                         <span class="text-[var(--text-secondary)]">{$_('dashboard.filled') || 'Filled'}: {formatDynamicDecimal(order.filled)}</span>
                         <span class:text-[var(--success-color)]={order.realizedPnL > 0}
                               class:text-[var(--danger-color)]={order.realizedPnL < 0}
                               class:text-[var(--text-secondary)]={order.realizedPnL === 0}>
                            {order.realizedPnL > 0 ? '+' : ''}{formatDynamicDecimal(order.realizedPnL)}
                        </span>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
