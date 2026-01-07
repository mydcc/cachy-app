<script lang="ts">
    import { formatDynamicDecimal } from '../../utils/utils';

    export let account: any;
</script>

<div class="bg-[var(--bg-tertiary)] border border-[var(--border-color)] shadow-xl rounded-lg p-3 text-xs text-[var(--text-primary)] w-[240px] pointer-events-auto z-50">
    <div class="flex justify-between items-center mb-2 border-b border-[var(--border-color)] pb-1">
        <span class="font-bold text-sm">Account Details</span>
        <span class="font-mono text-[var(--text-secondary)]">{account.marginCoin || 'USDT'}</span>
    </div>

    <div class="grid grid-cols-1 gap-1">
        <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Available:</span>
            <span>{formatDynamicDecimal(account.available)}</span>
        </div>
        <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Frozen:</span>
            <span>{formatDynamicDecimal(account.frozen)}</span>
        </div>
        <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Transferable:</span>
            <span>{formatDynamicDecimal(account.transfer)}</span>
        </div>
         <div class="flex justify-between border-b border-[var(--border-color)] pb-1 mb-1">
            <span class="text-[var(--text-secondary)]">Bonus:</span>
            <span>{formatDynamicDecimal(account.bonus)}</span>
        </div>

         <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Mode:</span>
            <span class="capitalize">{account.positionMode || '-'}</span>
        </div>

        <div class="flex justify-between mt-1 pt-1 border-t border-[var(--border-color)]">
            <span class="text-[var(--text-secondary)]">Cross PnL:</span>
            <span class:text-[var(--success-color)]={account.crossUnrealizedPNL > 0} class:text-[var(--danger-color)]={account.crossUnrealizedPNL < 0}>
                {formatDynamicDecimal(account.crossUnrealizedPNL)}
            </span>
        </div>
        <div class="flex justify-between">
            <span class="text-[var(--text-secondary)]">Iso PnL:</span>
            <span class:text-[var(--success-color)]={account.isolationUnrealizedPNL > 0} class:text-[var(--danger-color)]={account.isolationUnrealizedPNL < 0}>
                {formatDynamicDecimal(account.isolationUnrealizedPNL)}
            </span>
        </div>
    </div>
</div>
