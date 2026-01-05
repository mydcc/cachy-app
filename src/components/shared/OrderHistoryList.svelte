<script lang="ts">
    import { _ } from '../../locales/i18n';
    import { formatDynamicDecimal } from '../../utils/utils';
    import OrderDetailsTooltip from './OrderDetailsTooltip.svelte';

    export let orders: any[] = [];
    export let loading: boolean = false;
    export let error: string = '';

    let hoveredOrder: any = null;
    let tooltipX = 0;
    let tooltipY = 0;

    function handleMouseEnter(event: MouseEvent, order: any) {
        hoveredOrder = order;
        updateTooltipPosition(event);
    }

    function handleMouseMove(event: MouseEvent) {
        if (hoveredOrder) {
            updateTooltipPosition(event);
        }
    }

    function handleMouseLeave() {
        hoveredOrder = null;
    }

    function updateTooltipPosition(event: MouseEvent) {
        const tooltipWidth = 320; // Approx width
        const tooltipHeight = 400; // Approx max height
        const padding = 10;

        let x = event.clientX + padding;
        let y = event.clientY + padding;

        // Check right edge
        if (x + tooltipWidth > window.innerWidth) {
            x = event.clientX - tooltipWidth - padding;
        }

        // Check bottom edge
        if (y + tooltipHeight > window.innerHeight) {
            y = event.clientY - tooltipHeight - padding;
        }

        // Ensure not off-screen top/left
        x = Math.max(padding, x);
        y = Math.max(padding, y);

        tooltipX = x;
        tooltipY = y;
    }

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
        return `${formatDynamicDecimal(order.fee)}${role}`;
    }

    function getTypeLabel(type: any) {
        const t = String(type || '').toUpperCase();
        if (['LIMIT', '1'].includes(t)) return 'Limit';
        if (['MARKET', '2'].includes(t)) return 'Market';
        if (['STOP', 'STOP_LIMIT', '3'].includes(t)) return 'Stop Limit';
        if (['STOP_MARKET', '4'].includes(t)) return 'Stop Market';
        if (['TRAILING_STOP_MARKET', '5'].includes(t)) return 'Trailing';
        if (t === 'LIQUIDATION') return 'Liq.';
        if (!t || t === 'UNDEFINED' || t === 'NULL') return ''; // Empty for unknown
        return t.length > 6 ? t.substring(0, 6) + '.' : t; // Truncate long types
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
                        <div
                            class="flex flex-col justify-center border-r border-[var(--border-color)] border-opacity-30 pr-1 cursor-help relative"
                            on:mouseenter={(e) => handleMouseEnter(e, order)}
                            on:mousemove={handleMouseMove}
                            on:mouseleave={handleMouseLeave}
                            role="tooltip"
                        >
                            <span class="font-bold text-sm text-[var(--text-primary)] leading-tight underline decoration-dotted decoration-[var(--text-tertiary)] underline-offset-2">{order.symbol}</span>
                            <span class="text-[10px] text-[var(--text-secondary)] mt-1">{formatDate(order.time)}</span>
                        </div>

                        <!-- Col 2: Execution Details -->
                        <div class="flex flex-col items-center justify-center border-r border-[var(--border-color)] border-opacity-30 px-1">
                             <!-- Unified Badge -->
                             <div class="flex items-center gap-1 mb-1">
                                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tight flex items-center gap-1"
                                      class:bg-green-900={order.side === 'BUY'} class:text-green-300={order.side === 'BUY'}
                                      class:bg-red-900={order.side === 'SELL'} class:text-red-300={order.side === 'SELL'}
                                      title={`Type: ${order.type || 'Unknown'}`}>
                                    {getTypeLabel(order.type)} {order.side === 'BUY' ? 'Buy' : 'Sell'}
                                </span>
                            </div>

                            <span class="text-[11px] text-[var(--text-primary)] font-mono font-medium">
                                {formatDynamicDecimal(order.filled)}
                            </span>
                        </div>

                        <!-- Col 3: Financials -->
                        <div class="flex flex-col items-end justify-center pl-1">
                             <!-- Entry/Exit Price: Prefer AvgPrice (Execution) over Price (Limit) if available -->
                            <span class="text-xs font-mono text-[var(--text-primary)] mb-0.5">
                                {formatDynamicDecimal(order.avgPrice && Number(order.avgPrice) > 0 ? order.avgPrice : order.price)}
                            </span>

                            <!-- PnL -->
                             {#if order.realizedPnL && Number(order.realizedPnL) !== 0}
                                <span class="text-[10px] font-bold"
                                      class:text-[var(--success-color)]={Number(order.realizedPnL) > 0}
                                      class:text-[var(--danger-color)]={Number(order.realizedPnL) < 0}>
                                    {Number(order.realizedPnL) > 0 ? '+' : ''}{formatDynamicDecimal(order.realizedPnL)}
                                </span>
                            {/if}

                            <!-- Fee -->
                            <span class="text-[9px] text-[var(--text-tertiary)] opacity-70 whitespace-nowrap mt-0.5">
                                Fee: {getFeeDisplay(order)}
                            </span>
                        </div>

                    </div>

                </div>
            {/each}
        </div>
    {/if}
</div>

{#if hoveredOrder}
    <div
        class="fixed z-[9999] pointer-events-none"
        style="top: {tooltipY}px; left: {tooltipX}px;"
    >
        <OrderDetailsTooltip order={hoveredOrder} />
    </div>
{/if}
