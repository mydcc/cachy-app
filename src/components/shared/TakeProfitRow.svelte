<script lang="ts">
    import { icons } from '../../lib/constants';
    import { createEventDispatcher } from 'svelte';
    import { numberInput } from '../../utils/inputUtils';
    import { enhancedInput } from '../../lib/actions/inputEnhancements';
    import { _ } from '../../locales/i18n';
    import { trackClick } from '../../lib/actions';
    import { updateTradeStore, tradeStore } from '../../stores/tradeStore';
    import { app } from '../../services/app';
    import { get } from 'svelte/store';
    import type { IndividualTpResult } from '../../stores/types';

    const dispatch = createEventDispatcher();

    export let index: number;
    export let price: number | null;
    export let percent: number | null;
    export let isLocked: boolean;
    export let tpDetail: IndividualTpResult | undefined = undefined;

    function toggleLock() {
        const newLockState = !isLocked;
        const currentTargets = get(tradeStore).targets;
        if (currentTargets[index]) {
            currentTargets[index].isLocked = newLockState;
            updateTradeStore(s => ({ ...s, targets: currentTargets }));
            app.adjustTpPercentages(index);
        }
    }

    function removeRow() {
        dispatch('remove', index);
    }

    const format = (val: number | null) => (val === null || val === undefined) ? '' : String(val);

    function handlePriceInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        const newPrice = value === '' ? null : parseFloat(value);

        const currentTargets = get(tradeStore).targets;
        if (currentTargets[index]) {
            currentTargets[index].price = newPrice;
            updateTradeStore(s => ({...s, targets: currentTargets}));
        }
    }

    function handlePercentInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        const newPercent = value === '' ? null : parseFloat(value);

        const currentTargets = get(tradeStore).targets;
        if (currentTargets[index]) {
            currentTargets[index].percent = newPercent;
            updateTradeStore(s => ({...s, targets: currentTargets}));
            app.adjustTpPercentages(index);
        }
    }

    // Determine dynamic step
    $: priceStep = price && price > 1000 ? 0.5 : (price && price > 100 ? 0.1 : 0.01);
</script>

<style>
    .input-field:focus {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border-color: var(--accent-color);
        z-index: 10;
    }

    /* Ensure disabled input still looks distinct */
    .locked-input {
        background-color: var(--bg-primary);
        color: var(--text-secondary);
        cursor: not-allowed;
    }
</style>

<div class="tp-row flex items-center gap-2 p-2 rounded-lg" style="background-color: var(--bg-tertiary);">
    <div class="flex-grow">
        <div class="flex justify-between items-center mb-1">
            <label class="tp-label text-xs text-[var(--text-secondary)]" for="tp-price-{index}">TP {index + 1}</label>
            {#if tpDetail}
                <div class="text-xs text-[var(--text-secondary)] text-right">
                    <span class="mr-2">{$_('dashboard.takeProfitRow.winLabel')} <span class="text-[var(--success-color)]">+${tpDetail.netProfit.toFixed(2)}</span></span>
                    <span>{$_('dashboard.takeProfitRow.rrLabel')} <span class="{tpDetail.riskRewardRatio.gte(2) ? 'text-[var(--success-color)]' : tpDetail.riskRewardRatio.gte(1.5) ? 'text-[var(--warning-color)]' : 'text-[var(--danger-color)]'}">{tpDetail.riskRewardRatio.toFixed(2)}</span></span>
                </div>
            {/if}
        </div>
        <div class="grid grid-cols-2 gap-2">
            <!-- TP Price Input -->
            <div class="relative">
                <input
                    type="text"
                    use:numberInput={{ maxDecimalPlaces: 4 }}
                    use:enhancedInput={{ step: priceStep, min: 0, rightOffset: '2px' }}
                    value={format(price)}
                    on:input={handlePriceInput}
                    class="tp-price input-field w-full px-4 py-2 rounded-md"
                    placeholder="{$_('dashboard.takeProfitRow.pricePlaceholder')}"
                    id="tp-price-{index}"
                >
            </div>

            <!-- TP Percent Input -->
            <div class="relative">
                <input
                    type="text"
                    use:numberInput={{ noDecimals: true, isPercentage: true, minValue: 0, maxValue: 100 }}
                    use:enhancedInput={{ step: 1, min: 0, max: 100, noDecimals: true, rightOffset: '2px' }}
                    value={format(percent)}
                    on:input={handlePercentInput}
                    class="tp-percent input-field w-full px-4 py-2 rounded-md"
                    class:locked-input={isLocked}
                    disabled={isLocked}
                    placeholder="%"
                    id="tp-percent-{index}"
                >
            </div>
        </div>
    </div>

    <!-- Action Buttons Column -->
    <div class="flex flex-col gap-1 justify-center h-full pt-6">
        <button class="lock-tp-btn btn-lock-icon p-1 self-center" title="{$_('dashboard.takeProfitRow.lockButtonTitle')}" tabindex="-1" on:click={toggleLock} use:trackClick={{ category: 'TakeProfitRow', action: 'Click', name: 'ToggleLock' }}>
            {#if isLocked}
                {@html icons.lockClosed}
            {:else}
                {@html icons.lockOpen}
            {/if}
        </button>
        <button class="remove-tp-btn text-[var(--danger-color)] hover:opacity-80 p-1 self-center" title="{$_('dashboard.takeProfitRow.removeButtonTitle')}" tabindex="-1" on:click={removeRow} use:trackClick={{ category: 'TakeProfitRow', action: 'Click', name: 'RemoveRow' }}>
            {@html icons.remove}
        </button>
    </div>
</div>
