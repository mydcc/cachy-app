<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { settingsStore } from '../../stores/settingsStore';
    import ModalFrame from './ModalFrame.svelte';

    export let order: any;

    const dispatch = createEventDispatcher();

    let triggerPrice = order?.triggerPrice || '';
    let amount = order?.qty || order?.amount || '';
    let loading = false;
    let error = '';

    async function handleSave() {
        const provider = $settingsStore.apiProvider || 'bitunix';
        const keys = $settingsStore.apiKeys[provider];

        if (!triggerPrice) {
            error = 'Trigger price is required';
            return;
        }

        loading = true;
        error = '';

        try {
            const response = await fetch('/api/tpsl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exchange: provider,
                    apiKey: keys.key,
                    apiSecret: keys.secret,
                    action: 'modify',
                    params: {
                        orderId: order.orderId || order.id || order.planId, // Check ID field name
                        symbol: order.symbol,
                        planType: order.planType,
                        triggerPrice: String(triggerPrice),
                        qty: amount ? String(amount) : undefined
                    }
                })
            });
            const res = await response.json();
            if (res.error) {
                error = res.error;
            } else {
                dispatch('success');
            }
        } catch (e) {
            error = 'Failed to modify order';
        } finally {
            loading = false;
        }
    }
</script>

<ModalFrame title="Edit {order?.planType === 'PROFIT' ? 'Take Profit' : 'Stop Loss'}" on:close>
    <div class="flex flex-col gap-4 p-4 min-w-[300px]">

        <div class="text-sm text-[var(--text-secondary)] mb-2">
            Symbol: <span class="text-[var(--text-primary)] font-bold">{order?.symbol}</span>
        </div>

        <div class="flex flex-col gap-1">
            <label class="text-xs font-bold text-[var(--text-secondary)]">Trigger Price</label>
            <input
                type="number"
                step="any"
                bind:value={triggerPrice}
                class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)]"
            />
        </div>

        <div class="flex flex-col gap-1">
            <label class="text-xs font-bold text-[var(--text-secondary)]">Amount (Qty)</label>
            <input
                type="number"
                step="any"
                bind:value={amount}
                class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)]"
            />
        </div>

        {#if error}
            <div class="text-xs text-[var(--danger-color)]">{error}</div>
        {/if}

        <div class="flex justify-end gap-2 mt-2">
            <button
                class="px-3 py-1.5 rounded text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                on:click={() => dispatch('close')}
                disabled={loading}
            >
                Cancel
            </button>
            <button
                class="px-3 py-1.5 rounded text-xs font-bold text-white bg-[var(--accent-color)] hover:bg-opacity-90 disabled:opacity-50"
                on:click={handleSave}
                disabled={loading}
            >
                {loading ? 'Saving...' : 'Save'}
            </button>
        </div>
    </div>
</ModalFrame>
