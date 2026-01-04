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
        
        // Format: DD.MM HH:mm
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${day}.${month} ${hours}:${minutes}`;
    }

    // Helper to get Fee String
    function getFeeDisplay(order: any) {
        if (order.fee === undefined || order.fee === null) return '-';
        const role = order.role === 'MAKER' ? ' (M)' : order.role === 'TAKER' ? ' (T)' : '';
        // If fee is positive, it's a cost? Or revenue? Usually negative for cost.
        // Bitunix: Fee is usually negative number in PnL terms? Or positive absolute value?
        // Assuming fee is absolute value or negative. Let's show as is.
        return `${formatDynamicDecimal(order.fee)}${role}`;
    }
</script>

<div class="relative p-2 overflow-y-auto max-h-[500px] scrollbar-thin">

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
                <div class="bg-[var(--bg-primary)] rounded-lg p-2 border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors">
                    
                    <div class="grid grid-cols-3 gap-1">

                        <!-- Col 1: Identity & Time -->
                        <div class="flex flex-col justify-center border-r border-[var(--border-color)] border-opacity-30 pr-1">
                            <span class="font-bold text-sm text-[var(--text-primary)] leading-tight">{order.symbol}</span>
                            <span class="text-[10px] text-[var(--text-secondary)] mt-1">{formatDate(order.time)}</span>
                        </div>

                        <!-- Col 2: Execution Details -->
                        <div class="flex flex-col items-center justify-center border-r border-[var(--border-color)] border-opacity-30 px-1">
                             <div class="flex items-center gap-1 mb-1">
                                <span class="text-[10px] font-bold px-1 rounded uppercase tracking-tighter"
                                      class:bg-green-900={order.side === 'BUY'} class:text-green-300={order.side === 'BUY'}
                                      class:bg-red-900={order.side === 'SELL'} class:text-red-300={order.side === 'SELL'}>
                                    {order.side === 'BUY' ? 'BUY' : 'SELL'}
                                </span>
                                <!-- Type Badge (L/M) -->
                                <span class="text-[10px] font-bold px-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" title={order.type}>
                                    {#if ['LIMIT', 'limit', '1'].includes(String(order.type).toUpperCase())}
                                        L
                                    {:else if ['MARKET', 'market', '2'].includes(String(order.type).toUpperCase())}
                                        M
                                    {:else}
                                        {String(order.type).charAt(0).toUpperCase()}
                                    {/if}
                                </span>
                            </div>
                            <span class="text-[10px] text-[var(--text-primary)] font-mono">
                                {formatDynamicDecimal(order.filled)}
                            </span>
                             <span class="text-[9px] text-[var(--text-secondary)]">
                                Vol: {formatDynamicDecimal(order.filled * order.price)}
                            </span>
                        </div>

                        <!-- Col 3: Financials -->
                        <div class="flex flex-col items-end justify-center pl-1">
                             <!-- Entry/Exit Price -->
                            <span class="text-xs font-mono text-[var(--text-primary)] mb-0.5">{formatDynamicDecimal(order.price)}</span>

                            <!-- PnL -->
                             {#if order.realizedPnL && Number(order.realizedPnL) !== 0}
                                <span class="text-[10px] font-bold"
                                      class:text-[var(--success-color)]={Number(order.realizedPnL) > 0}
                                      class:text-[var(--danger-color)]={Number(order.realizedPnL) < 0}>
                                    {Number(order.realizedPnL) > 0 ? '+' : ''}{formatDynamicDecimal(order.realizedPnL)}
                                </span>
                            {/if}

                            <!-- Fee -->
                            <span class="text-[9px] text-[var(--text-secondary)] whitespace-nowrap mt-0.5">
                                Fee: {getFeeDisplay(order)}
                            </span>
                        </div>

                    </div>

                </div>
            {/each}
        </div>
    {/if}
</div>
