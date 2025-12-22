<script lang="ts">
    import { formatDynamicDecimal } from '../../utils/utils';
    import { _ } from '../../locales/i18n';

    export let available: number = 0;
    export let margin: number = 0;
    export let pnl: number = 0;
    export let currency: string = 'USDT';
</script>

<div class="p-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)] flex flex-col gap-2">
    <div class="flex justify-between items-center">
        <span class="text-xs text-[var(--text-secondary)]">{$_('dashboard.balance') || 'Available'}</span>
        <span class="text-sm font-bold text-[var(--text-primary)]">{formatDynamicDecimal(available, 2)} {currency}</span>
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
