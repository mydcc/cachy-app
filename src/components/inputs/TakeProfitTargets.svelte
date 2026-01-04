<script lang="ts">
    import { icons } from '../../lib/constants';
    import { updateTradeStore, tradeStore } from '../../stores/tradeStore';
    import { numberInput } from '../../utils/inputUtils';
    import { enhancedInput } from '../../lib/actions/inputEnhancements';
    import { _ } from '../../locales/i18n';
    import { app } from '../../services/app';
    import { onMount } from 'svelte';
    import { flip } from 'svelte/animate';
    import { slide } from 'svelte/transition';

    export let targets: { price: number | null, percent: number | null, isLocked: boolean }[];
    export let calculatedTpDetails: any[];

    function handleTpPriceInput(index: number, e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        updateTradeStore(s => {
            const newTargets = [...s.targets];
            newTargets[index].price = value === '' ? null : parseFloat(value);
            return { ...s, targets: newTargets };
        });
    }

    function handleTpPercentInput(index: number, e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        const newPercent = value === '' ? null : parseFloat(value);

        updateTradeStore(s => {
            const newTargets = [...s.targets];
            newTargets[index].percent = newPercent;
            return { ...s, targets: newTargets };
        });

        app.adjustTpPercentages(index);
    }

    function addRow() {
        if (targets.length < 5) {
            app.addTakeProfitRow(null, 0);
             // Re-balance percentages?
             app.adjustTpPercentages(null);
        }
    }

    function removeRow(index: number) {
        updateTradeStore(s => {
            const newTargets = s.targets.filter((_, i) => i !== index);
            return { ...s, targets: newTargets };
        });
        app.adjustTpPercentages(null);
    }

    function toggleLock(index: number) {
        updateTradeStore(s => {
            const newTargets = [...s.targets];
            newTargets[index].isLocked = !newTargets[index].isLocked;
            return { ...s, targets: newTargets };
        });
    }

    $: activeCount = targets.filter(t => t.price && t.price > 0).length;
</script>

<style>
    .tp-row {
        transition: all 0.3s ease;
    }
    .input-field:focus {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border-color: var(--accent-color);
        z-index: 10;
    }
    .lock-btn {
        opacity: 0.3;
        transition: opacity 0.2s;
    }
    .lock-btn:hover {
        opacity: 0.7;
    }
    .lock-btn.locked {
        opacity: 1;
        color: var(--accent-color);
    }
</style>

<div>
    <div class="flex justify-between items-center mb-2">
        <h2 class="section-header !mb-0">{$_('dashboard.takeProfitTargets.header')}</h2>
        {#if targets.length < 5}
            <button class="text-xs text-[var(--accent-color)] hover:underline flex items-center gap-1" on:click={addRow}>
                {@html icons.plus} Add TP
            </button>
        {/if}
    </div>

    <div class="space-y-2">
        {#each targets as tp, index (index)}
            <div class="tp-row grid grid-cols-[1fr_1fr_auto] gap-2 items-center" animate:flip={{duration: 200}}>
                <div class="relative">
                     <label for="tp-price-{index}" class="sr-only">TP Price {index + 1}</label>
                     <input
                        id="tp-price-{index}"
                        type="text"
                        use:numberInput={{ maxDecimalPlaces: 4 }}
                        use:enhancedInput={{ step: 0.5, min: 0 }}
                        value={tp.price === null ? '' : tp.price}
                        on:input={(e) => handleTpPriceInput(index, e)}
                        class="input-field w-full px-3 py-1.5 rounded-md text-sm"
                        placeholder="Price"
                    >
                    {#if calculatedTpDetails[index] && calculatedTpDetails[index].pnl}
                        <div class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--success-color)] pointer-events-none font-mono opacity-80">
                            +{calculatedTpDetails[index].pnl}
                        </div>
                    {/if}
                </div>
                <div class="relative">
                    <label for="tp-percent-{index}" class="sr-only">TP Percent {index + 1}</label>
                    <input
                        id="tp-percent-{index}"
                        type="text"
                        use:numberInput={{ maxDecimalPlaces: 2 }}
                        use:enhancedInput={{ step: 5, min: 0, max: 100 }}
                        value={tp.percent === null ? '' : tp.percent}
                        on:input={(e) => handleTpPercentInput(index, e)}
                        class="input-field w-full px-3 py-1.5 rounded-md text-sm pr-7 {tp.isLocked ? 'border-[var(--accent-color)]' : ''}"
                        placeholder="%"
                    >
                    <button
                        class="lock-btn absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 {tp.isLocked ? 'locked' : ''}"
                        on:click={() => toggleLock(index)}
                        title={tp.isLocked ? "Unlock %" : "Lock %"}
                        tabindex="-1"
                    >
                         {@html tp.isLocked ? icons.locked : icons.unlocked}
                    </button>
                </div>
                <div>
                    {#if index > 0 || targets.length > 1}
                        <button
                            class="text-[var(--text-secondary)] hover:text-[var(--danger-color)] transition-colors p-1"
                            on:click={() => removeRow(index)}
                            title="Remove TP"
                            tabindex="-1"
                        >
                            {@html icons.trash}
                        </button>
                    {:else}
                         <div class="w-6"></div>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</div>
