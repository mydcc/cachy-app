<script lang="ts">
    import { formatDynamicDecimal } from '../../utils/utils';
    import { _ } from '../../locales/i18n';
    import AccountTooltip from './AccountTooltip.svelte';

    export let available: number = 0;
    export let margin: number = 0;
    export let pnl: number = 0;
    export let currency: string = 'USDT';

    // Extended props
    export let frozen: number = 0;
    export let transfer: number = 0;
    export let bonus: number = 0;
    export let positionMode: string = '';
    export let crossUnrealizedPNL: number = 0;
    export let isolationUnrealizedPNL: number = 0;

    let showDetails = false;

    function handleMouseEnter() {
        showDetails = true;
    }

    function handleMouseLeave() {
        showDetails = false;
    }
</script>

<div class="p-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)] flex flex-col gap-2 relative">
    <div class="flex justify-between items-center group cursor-help relative"
         on:mouseenter={handleMouseEnter}
         on:mouseleave={handleMouseLeave}
         role="tooltip"
    >
        <div class="flex items-center gap-1">
             <span class="text-xs text-[var(--text-secondary)] border-b border-dashed border-[var(--text-secondary)]">{$_('dashboard.balance') || 'Available'}</span>
        </div>
        <span class="text-sm font-bold text-[var(--text-primary)]">{formatDynamicDecimal(available, 2)} {currency}</span>

        {#if showDetails}
            <div class="absolute z-[100] left-0 top-full mt-2">
                <AccountTooltip account={{
                    available,
                    margin,
                    marginCoin: currency,
                    frozen,
                    transfer,
                    bonus,
                    positionMode,
                    crossUnrealizedPNL,
                    isolationUnrealizedPNL
                }} />
            </div>
        {/if}
    </div>
    
    <div class="flex justify-between items-center">
        <span class="text-xs text-[var(--text-secondary)]">{$_('dashboard.margin') || 'Margin'}</span>
        <span class="text-sm font-bold text-[var(--text-primary)]">{formatDynamicDecimal(margin, 2)} {currency}</span>
    </div>

    <div class="flex justify-between items-center pt-1 border-t border-[var(--border-primary)] border-dashed">
        <span class="text-xs text-[var(--text-secondary)]">{$_('dashboard.pnl') || 'Total PnL'}</span>
        <span class="text-sm font-bold" class:text-[var(--success-color)]={pnl > 0} class:text-[var(--danger-color)]={pnl < 0}>
            {pnl > 0 ? '+' : ''}{formatDynamicDecimal(pnl, 2)} {currency}
        </span>
    </div>
</div>
