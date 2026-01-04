<script lang="ts">
    import { icons } from '../../lib/constants';
    import TakeProfitRow from '../shared/TakeProfitRow.svelte';
    import Tooltip from '../shared/Tooltip.svelte';
    import { createEventDispatcher } from 'svelte';
    import { app } from '../../services/app';
    import { _ } from '../../locales/i18n';
    import type { IndividualTpResult } from '../../stores/types';

    const dispatch = createEventDispatcher();

    export let targets: Array<{ price: number | null; percent: number | null; isLocked: boolean }>;
    export let calculatedTpDetails: IndividualTpResult[] = [];

    function addTakeProfitRow() {
        app.addTakeProfitRow();
    }

    function handleRemove(event: CustomEvent<number>) {
        const index = event.detail;
        // Dispatch the index to be removed. The parent component will handle the logic.
        dispatch('remove', index);
    }
</script>

<section class="mt-4 md:col-span-2">
    <h2 class="section-header">
        <span>{$_('dashboard.takeProfitTargets.header')}</span>
        <div class="flex items-center gap-2">
            <Tooltip text={$_('dashboard.takeProfitTargets.tooltip')} />
            <button id="add-tp-btn" class="btn-icon-accent" title="{$_('dashboard.takeProfitTargets.addTargetTitle')}" tabindex="-1" on:click={addTakeProfitRow}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
            </button>
        </div>
    </h2>
    <div id="take-profit-list" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        {#each targets as target, i (i)}
            {@const tpDetail = calculatedTpDetails.find(d => d.index === i)}
            <TakeProfitRow
                index={i}
                price={target.price}
                percent={target.percent}
                isLocked={target.isLocked}
                tpDetail={tpDetail}
                on:remove={handleRemove}
            />
        {/each}
    </div>
</section>
