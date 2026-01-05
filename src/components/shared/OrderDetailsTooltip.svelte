<script lang="ts">
    import { formatDynamicDecimal } from '../../utils/utils';

    export let order: any;

    function formatDate(ts: any) {
        if (!ts) return '-';
        return new Date(Number(ts)).toLocaleString();
    }
</script>

<div class="bg-[var(--bg-tertiary)] border border-[var(--border-color)] shadow-xl rounded-lg p-3 text-xs text-[var(--text-primary)] w-[320px] max-w-[90vw] pointer-events-none">
    <div class="flex justify-between items-center mb-2 border-b border-[var(--border-color)] pb-1">
        <span class="font-bold text-sm">{order.symbol}</span>
        <span class="font-mono text-[var(--text-secondary)] uppercase">{order.side} {order.type}</span>
    </div>

    <div class="grid grid-cols-2 gap-x-4 gap-y-1">
        <!-- IDs -->
        <div class="col-span-2 flex justify-between group">
            <span class="text-[var(--text-secondary)]">Order ID:</span>
            <span class="font-mono">{order.orderId}</span>
        </div>
        {#if order.clientId}
        <div class="col-span-2 flex justify-between">
            <span class="text-[var(--text-secondary)]">Client ID:</span>
            <span class="font-mono truncate max-w-[150px]">{order.clientId}</span>
        </div>
        {/if}

        <!-- Settings -->
        <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Leverage:</span>
            <span>{order.leverage}x</span>
        </div>
        <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Margin:</span>
            <span class="capitalize">{order.marginMode}</span>
        </div>
        {#if order.positionMode}
         <div class="flex justify-between col-span-2">
            <span class="text-[var(--text-secondary)]">Mode:</span>
            <span class="capitalize">{order.positionMode}</span>
        </div>
        {/if}

        <!-- Trade Stats -->
         <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Price:</span>
            <span>{formatDynamicDecimal(order.price)}</span>
        </div>
         <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Avg Price:</span>
            <span>{formatDynamicDecimal(order.avgPrice || order.averagePrice)}</span>
        </div>
         <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Qty:</span>
            <span>{formatDynamicDecimal(order.qty)}</span>
        </div>
         <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Filled:</span>
            <span>{formatDynamicDecimal(order.tradeQty || order.filled)}</span>
        </div>

        <!-- Financials -->
        <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Fee:</span>
            <span>{formatDynamicDecimal(order.fee)}</span>
        </div>
        <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Realized PnL:</span>
            <span class:text-[var(--success-color)]={Number(order.realizedPNL)>0} class:text-[var(--danger-color)]={Number(order.realizedPNL)<0}>
                {formatDynamicDecimal(order.realizedPNL)}
            </span>
        </div>

        <!-- TP/SL -->
        {#if (order.tpPrice && Number(order.tpPrice) > 0) || (order.slPrice && Number(order.slPrice) > 0)}
            <div class="col-span-2 mt-1 border-t border-[var(--border-color)] pt-1 font-bold text-[var(--text-secondary)]">TP / SL</div>
             {#if order.tpPrice && Number(order.tpPrice) > 0}
                <div class="col-span-2 flex justify-between">
                    <span class="text-[var(--success-color)]">TP:</span>
                    <span>{formatDynamicDecimal(order.tpPrice)} ({order.tpStopType}) -> {order.tpOrderType}</span>
                </div>
            {/if}
            {#if order.slPrice && Number(order.slPrice) > 0}
                <div class="col-span-2 flex justify-between">
                    <span class="text-[var(--danger-color)]">SL:</span>
                    <span>{formatDynamicDecimal(order.slPrice)} ({order.slStopType}) -> {order.slOrderType}</span>
                </div>
            {/if}
        {/if}

         <!-- Timestamps -->
         <div class="col-span-2 mt-1 border-t border-[var(--border-color)] pt-1">
            <div class="flex justify-between text-[10px]">
                <span class="text-[var(--text-secondary)]">Created:</span>
                <span>{formatDate(order.ctime)}</span>
            </div>
             {#if order.mtime && order.mtime !== order.ctime}
             <div class="flex justify-between text-[10px]">
                <span class="text-[var(--text-secondary)]">Updated:</span>
                <span>{formatDate(order.mtime)}</span>
            </div>
            {/if}
        </div>

        <!-- Status -->
         <div class="col-span-2 flex justify-between items-center mt-1 pt-1">
             <span class="font-bold px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[10px] uppercase border border-[var(--border-color)]">{order.status}</span>
             {#if order.reduceOnly}
                <span class="text-[10px] text-[var(--warning-color)] font-bold">Reduce Only</span>
             {/if}
         </div>

    </div>
</div>
