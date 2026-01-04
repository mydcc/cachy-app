<script lang="ts">
    import { _ } from '../../locales/i18n';
    import { formatDynamicDecimal } from '../../utils/utils';

    export let orders: any[] = [];
    export let loading: boolean = false;
    export let error: string = '';

    // View Mode State
    // 0: Minimal, 1: Compact (Default), 2: Full
    let viewMode = 1;

    function toggleViewMode() {
        viewMode = (viewMode + 1) % 3;
    }

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

    // Helper to get Fee String
    function getFeeDisplay(order: any) {
        if (order.fee === undefined) return '';
        const role = order.role === 'MAKER' ? ' (M)' : order.role === 'TAKER' ? ' (T)' : '';
        return `${formatDynamicDecimal(order.fee)}${role}`;
    }
</script>

<div class="relative p-2 overflow-y-auto max-h-[500px] scrollbar-thin">

    <!-- View Mode Toggle (Floating Top Right) -->
    <button
        class="absolute top-2 right-4 z-10 w-2 h-2 rounded-full transition-colors duration-200"
        class:bg-gray-500={viewMode === 0}
        class:bg-blue-500={viewMode === 1}
        class:bg-purple-500={viewMode === 2}
        on:click={toggleViewMode}
        title="Toggle View Mode (Minimal / Compact / Full)"
    ></button>

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
        <div class="flex flex-col gap-2 mt-4"> <!-- Top margin for the toggle button space -->
            {#each orders as order}
                <div class="bg-[var(--bg-primary)] rounded-lg p-2 border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors relative">
                    
                    {#if viewMode === 2}
                         <!-- Full Mode: Order ID Badge -->
                         <div class="absolute -top-2 -left-1 bg-[var(--bg-tertiary)] px-1 rounded text-[10px] text-[var(--text-secondary)] border border-[var(--border-color)]">
                             #{order.orderId ? String(order.orderId).slice(-4) : 'ID'}
                         </div>
                    {/if}

                    <div class="grid gap-y-1" class:grid-cols-2={viewMode === 0} class:grid-cols-3={viewMode >= 1}>

                        <!-- Col 1: Symbol & Time -->
                        <div class="flex flex-col justify-center">
                            <span class="font-bold text-sm text-[var(--text-primary)] leading-tight">{order.symbol}</span>
                            <span class="text-[10px] text-[var(--text-secondary)]">{formatDate(order.time)}</span>
                        </div>

                        <!-- Col 2: Side, Type, Fee (Compact/Full) -->
                        {#if viewMode >= 1}
                            <div class="flex flex-col items-center justify-center border-l border-r border-[var(--border-color)] border-opacity-30 px-1">
                                <div class="flex items-center gap-1 mb-0.5">
                                    <span class="text-[10px] font-bold px-1 rounded uppercase"
                                          class:bg-green-900={order.side === 'BUY'} class:text-green-300={order.side === 'BUY'}
                                          class:bg-red-900={order.side === 'SELL'} class:text-red-300={order.side === 'SELL'}>
                                        {order.side === 'BUY' ? 'B' : 'S'}
                                    </span>
                                    <!-- Type Badge (L/M) -->
                                    <span class="text-[10px] font-bold px-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" title={order.type}>
                                        {order.type === 'LIMIT' ? 'L' : order.type === 'MARKET' ? 'M' : '?'}
                                    </span>
                                </div>
                                <!-- Fee Display -->
                                {#if order.fee}
                                    <span class="text-[10px] whitespace-nowrap" class:text-[var(--danger-color)]={Number(order.fee) < 0} class:text-[var(--success-color)]={Number(order.fee) > 0}>
                                        {getFeeDisplay(order)}
                                    </span>
                                {/if}
                            </div>
                        {:else}
                             <!-- Minimal Mode: Just Side Badge aligned right -->
                             <div class="flex items-center justify-end">
                                 <span class="text-xs font-bold px-1.5 py-0.5 rounded uppercase"
                                      class:bg-green-900={order.side === 'BUY'} class:text-green-300={order.side === 'BUY'}
                                      class:bg-red-900={order.side === 'SELL'} class:text-red-300={order.side === 'SELL'}>
                                    {order.side}
                                </span>
                             </div>
                        {/if}

                        <!-- Col 3: Price & PnL (or just PnL in minimal? No, minimal needs 2 cols) -->
                        {#if viewMode >= 1}
                             <div class="flex flex-col items-end justify-center">
                                <span class="text-xs font-mono text-[var(--text-primary)]">{formatDynamicDecimal(order.price)}</span>
                                {#if order.realizedPnL && Number(order.realizedPnL) !== 0}
                                    <span class="text-[10px] font-bold"
                                          class:text-[var(--success-color)]={Number(order.realizedPnL) > 0}
                                          class:text-[var(--danger-color)]={Number(order.realizedPnL) < 0}>
                                        {Number(order.realizedPnL) > 0 ? '+' : ''}{formatDynamicDecimal(order.realizedPnL)}
                                    </span>
                                {/if}
                            </div>
                        {:else}
                             <!-- Minimal Mode Row 2 (Actually grid cols 2 means we wrap) -->
                             <!-- In Minimal, we keep it simple. -->
                        {/if}
                    </div>

                    <!-- Minimal Mode Extra Row -->
                    {#if viewMode === 0}
                        <div class="flex justify-between items-center mt-1 pt-1 border-t border-[var(--border-color)] border-opacity-30">
                            <span class="text-xs font-mono">{formatDynamicDecimal(order.price)}</span>
                            <span class:text-[var(--success-color)]={Number(order.realizedPnL) > 0}
                                  class:text-[var(--danger-color)]={Number(order.realizedPnL) < 0}
                                  class:text-xs={true}>
                                {Number(order.realizedPnL) > 0 ? '+' : ''}{formatDynamicDecimal(order.realizedPnL)}
                            </span>
                        </div>
                    {/if}

                </div>
            {/each}
        </div>
    {/if}
</div>
