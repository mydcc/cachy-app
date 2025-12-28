<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { icons } from '../../lib/constants';
    import Tooltip from '../shared/Tooltip.svelte';
    import { _ } from '../../locales/i18n';
    import { trackCustomEvent } from '../../services/trackingService';

    const dispatch = createEventDispatcher();

    export let isPositionSizeLocked: boolean;
    export let showCopyFeedback: boolean;
    export let positionSize: string;
    export let netLoss: string;
    export let requiredMargin: string;
    export let entryFee: string;
    export let liquidationPrice: string;
    export let breakEvenPrice: string;
    export let isMarginExceeded: boolean = false;

    function handleCopy() {
        trackCustomEvent('Result', 'Copy', 'PositionSize');
        navigator.clipboard.writeText(positionSize);
        dispatch('copy');
    }

    function handleToggleLock() {
        trackCustomEvent('Result', 'ToggleLock', !isPositionSizeLocked ? 'On' : 'Off');
        dispatch('toggleLock');
    }
</script>

<div class="result-group">
    <h2 class="section-header">{$_('dashboard.summaryResults.header')}</h2>
    <div class="result-item">
        <div class="result-label">
            {$_('dashboard.summaryResults.positionSizeLabel')}
            <button id="lock-position-size-btn" class="copy-btn ml-2" title="{$_('dashboard.summaryResults.lockPositionSizeTitle')}" aria-label="{$_('dashboard.summaryResults.lockPositionSizeAriaLabel')}" on:click={handleToggleLock}>
                {#if isPositionSizeLocked}
                    {@html icons.lockClosed}
                {:else}
                    {@html icons.lockOpen}
                {/if}
            </button>
            <button id="copy-btn" class="copy-btn" aria-label="{$_('dashboard.summaryResults.copyPositionSizeAriaLabel')}" on:click={handleCopy}>
                {@html icons.copy}
            </button>
            {#if showCopyFeedback}<span id="copy-feedback" class="copy-feedback visible">{$_('dashboard.summaryResults.copiedFeedback')}</span>{/if}
        </div>
        <span id="positionSize" class="result-value text-lg" style:color={isMarginExceeded ? 'var(--danger-color)' : 'var(--success-color)'}>{positionSize}</span>
    </div>
    {#if isMarginExceeded}
        <div class="result-item" style="justify-content: center; margin-bottom: 0.5rem;">
            <span class="text-sm font-bold" style="color: var(--danger-color);">{$_('dashboard.summaryResults.insufficientBalance')}</span>
        </div>
    {/if}
    <div class="result-item"><div class="result-label">{$_('dashboard.summaryResults.maxNetLossLabel')}<Tooltip text={$_('dashboard.summaryResults.maxNetLossTooltip')} /></div><span id="netLoss" class="result-value" style:color="var(--danger-color)">{netLoss}</span></div>
    <div class="result-item"><div class="result-label">{$_('dashboard.summaryResults.requiredMarginLabel')}<Tooltip text={$_('dashboard.summaryResults.requiredMarginTooltip')} /></div><span id="requiredMargin" class="result-value" style:color={isMarginExceeded ? 'var(--danger-color)' : ''}>{requiredMargin}</span></div>
    <div class="result-item"><div class="result-label">{$_('dashboard.summaryResults.entryFeeLabel')}</div><span id="entryFee" class="result-value">{entryFee}</span></div>
    <div class="result-item">
        <span class="result-label">{$_('dashboard.summaryResults.estimatedLiquidationPriceLabel')}<Tooltip text={$_('dashboard.summaryResults.estimatedLiquidationPriceTooltip')} /></span>
        <span id="liquidationPrice" class="result-value">{liquidationPrice}</span>
    </div>
    <div class="result-item"><span class="result-label">{$_('dashboard.summaryResults.breakEvenPriceLabel')}<Tooltip text={$_('dashboard.summaryResults.breakEvenPriceTooltip')} /></span><span id="breakEvenPrice" class="result-value" style:color="var(--warning-color)">{breakEvenPrice}</span></div>
</div>
