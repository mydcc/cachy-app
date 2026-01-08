<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { settingsStore } from '../../stores/settingsStore';
    import ModalFrame from './ModalFrame.svelte';

    export let order: any;

    const dispatch = createEventDispatcher();

    // Initialize with existing order values
    // Using 'amount' for display/binding to match generic input names, but mapped from order.amount (original qty)
    let price = order?.price || '';
    let amount = order?.amount || '';

    let loading = false;
    let error = '';

    async function handleSave() {
        const provider = $settingsStore.apiProvider || 'bitunix';
        const keys = $settingsStore.apiKeys[provider];

        if (!price || !amount) {
            error = 'Price and Amount are required';
            return;
        }

        loading = true;
        error = '';

        try {
            const newOrderData = {
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                qty: String(amount),
                price: String(price),
                reduceOnly: order.reduceOnly,
                // Preserve TP/SL if they exist
                tpPrice: order.tpPrice,
                tpType: order.tpOrderType, // Assuming bitunix needs type? Or just price. Logic in server passes through what keys match.
                slPrice: order.slPrice,
                slType: order.slOrderType
            };

            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exchange: provider,
                    apiKey: keys.key,
                    apiSecret: keys.secret,
                    type: 'modify-order',
                    orderId: order.orderId || order.id,
                    newOrder: newOrderData
                })
            });

            const res = await response.json();
            if (res.error) {
                error = res.error;
            } else {
                dispatch('success');
                dispatch('close');
            }
        } catch (e) {
            error = 'Failed to modify order';
        } finally {
            loading = false;
        }
    }
</script>

<ModalFrame title="Edit Order" on:close>
    <div class="flex flex-col gap-4 p-4 min-w-[300px]">

        <div class="text-sm text-[var(--text-secondary)] mb-2 flex justify-between items-center">
            <span>Symbol: <span class="text-[var(--text-primary)] font-bold">{order?.symbol}</span></span>
            <span class="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold {order?.side === 'BUY' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}">
                {order?.side}
            </span>
        </div>

        <div class="flex flex-col gap-1">
            <label for="edit-order-price" class="text-xs font-bold text-[var(--text-secondary)]">Price</label>
            <input
                id="edit-order-price"
                type="number"
                step="any"
                bind:value={price}
                class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)] focus:border-[var(--accent-color)] outline-none"
            />
        </div>

        <div class="flex flex-col gap-1">
            <label for="edit-order-amount" class="text-xs font-bold text-[var(--text-secondary)]">Amount (Qty)</label>
            <input
                id="edit-order-amount"
                type="number"
                step="any"
                bind:value={amount}
                class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)] focus:border-[var(--accent-color)] outline-none"
            />
        </div>

        {#if order?.tpPrice || order?.slPrice}
            <div class="mt-2 pt-2 border-t border-[var(--border-color)] border-opacity-50 text-[10px] text-[var(--text-tertiary)] flex gap-4">
                {#if order.tpPrice}
                    <span>TP: {order.tpPrice} (Preserved)</span>
                {/if}
                {#if order.slPrice}
                    <span>SL: {order.slPrice} (Preserved)</span>
                {/if}
            </div>
        {/if}

        {#if error}
            <div class="text-xs text-[var(--danger-color)]">{error}</div>
        {/if}

        <div class="flex justify-end gap-2 mt-4">
            <button
                class="px-3 py-1.5 rounded text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border border-transparent hover:border-[var(--border-color)] transition-colors"
                on:click={() => dispatch('close')}
                disabled={loading}
            >
                Cancel
            </button>
            <button
                class="px-3 py-1.5 rounded text-xs font-bold text-white bg-[var(--accent-color)] hover:bg-opacity-90 disabled:opacity-50 shadow-sm"
                on:click={handleSave}
                disabled={loading}
            >
                {loading ? 'Updating...' : 'Update Order'}
            </button>
        </div>
    </div>
</ModalFrame>
