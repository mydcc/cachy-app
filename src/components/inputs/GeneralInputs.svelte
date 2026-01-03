<script lang="ts">
    import { CONSTANTS } from '../../lib/constants';
    import { updateTradeStore, tradeStore } from '../../stores/tradeStore';
    import { settingsStore } from '../../stores/settingsStore';
    import { numberInput } from '../../utils/inputUtils';
    import { _ } from '../../locales/i18n';
    import { trackClick } from '../../lib/actions';

    export let tradeType: string;
    export let leverage: number | null;
    export let fees: number | null;

    function setTradeType(type: string) {
        updateTradeStore(s => ({ ...s, tradeType: type }));
    }

    const format = (val: number | null) => (val === null || val === undefined) ? '' : String(val);

    function handleLeverageInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        updateTradeStore(s => ({ ...s, leverage: value === '' ? null : parseFloat(value) }));
    }

    function handleFeesInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        updateTradeStore(s => ({ ...s, fees: value === '' ? null : parseFloat(value) }));
    }

    // Reactive checks for sync status
    // "Synced" means current input value matches the remote value exactly.
    $: isLeverageSynced = $tradeStore.remoteLeverage !== undefined && leverage === $tradeStore.remoteLeverage;
    $: isFeesSynced = ($settingsStore.feePreference === 'maker'
                        ? ($tradeStore.remoteMakerFee !== undefined && fees === $tradeStore.remoteMakerFee)
                        : ($tradeStore.remoteTakerFee !== undefined && fees === $tradeStore.remoteTakerFee));

    // Helper to revert to remote values
    function syncLeverage() {
        if ($tradeStore.remoteLeverage !== undefined) {
            updateTradeStore(s => ({ ...s, leverage: s.remoteLeverage! }));
        }
    }

    function syncFees() {
        if ($settingsStore.feePreference === 'maker' && $tradeStore.remoteMakerFee !== undefined) {
             updateTradeStore(s => ({ ...s, fees: s.remoteMakerFee! }));
        } else if ($tradeStore.remoteTakerFee !== undefined) {
             updateTradeStore(s => ({ ...s, fees: s.remoteTakerFee! }));
        }
    }
</script>

<div>
    <h2 class="section-header" id="trade-type-label">{$_('dashboard.generalInputs.header')}</h2>
    <div class="grid grid-cols-1 gap-4 mb-4">
        <div class="trade-type-switch p-1 rounded-lg flex" role="radiogroup" aria-labelledby="trade-type-label">
            <button
                class="long w-1/2"
                class:active={tradeType === CONSTANTS.TRADE_TYPE_LONG}
                role="radio"
                aria-checked={tradeType === CONSTANTS.TRADE_TYPE_LONG}
                on:click={() => setTradeType(CONSTANTS.TRADE_TYPE_LONG)}
                use:trackClick={{ category: 'GeneralInputs', action: 'SetTradeType', name: 'Long' }}
            >{$_('dashboard.generalInputs.longButton')}</button>
            <button
                class="short w-1/2"
                class:active={tradeType === CONSTANTS.TRADE_TYPE_SHORT}
                role="radio"
                aria-checked={tradeType === CONSTANTS.TRADE_TYPE_SHORT}
                on:click={() => setTradeType(CONSTANTS.TRADE_TYPE_SHORT)}
                use:trackClick={{ category: 'GeneralInputs', action: 'SetTradeType', name: 'Short' }}
            >{$_('dashboard.generalInputs.shortButton')}</button>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <!-- Leverage Input Wrapper -->
            <div class="relative">
                <input
                    id="leverage-input"
                    type="text"
                    use:numberInput={{ noDecimals: true, maxValue: 125, minValue: 1 }}
                    value={format(leverage)}
                    on:input={handleLeverageInput}
                    class="input-field w-full h-full px-4 py-2 rounded-md transition-colors {isLeverageSynced ? 'border-[var(--success-color)]' : ''}"
                    placeholder="{$_('dashboard.generalInputs.leveragePlaceholder')}"
                >
                <!-- Sync Indicator / Reset Button -->
                {#if $tradeStore.remoteLeverage !== undefined}
                    <button
                        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-xs rounded hover:bg-[var(--bg-tertiary)] transition-colors {isLeverageSynced ? 'text-[var(--success-color)]' : 'text-[var(--text-secondary)]'}"
                        title={isLeverageSynced ? 'Synced with API' : `Reset to API: ${$tradeStore.remoteLeverage}x`}
                        on:click={syncLeverage}
                    >
                        {#if isLeverageSynced}
                             <!-- Link Icon -->
                             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        {:else}
                             <!-- Sync/Refresh Icon -->
                             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 5.5A10 10 0 1 1 11.99 2.02"/></svg>
                        {/if}
                    </button>
                    <!-- Small Label for Margin Mode -->
                    {#if $tradeStore.remoteMarginMode}
                         <span class="absolute -bottom-5 left-1 text-[10px] uppercase text-[var(--text-secondary)] font-bold tracking-wider">
                             {$tradeStore.remoteMarginMode}
                         </span>
                    {/if}
                {/if}
            </div>

            <!-- Fees Input Wrapper -->
            <div class="relative">
                <input
                    id="fees-input"
                    type="text"
                    use:numberInput={{ maxDecimalPlaces: 4 }}
                    value={format(fees)}
                    on:input={handleFeesInput}
                    class="input-field w-full px-4 py-2 rounded-md transition-colors {isFeesSynced ? 'border-[var(--success-color)]' : ''}"
                    placeholder="{$_('dashboard.generalInputs.feesPlaceholder')}"
                >
                <!-- Sync Indicator / Reset Button -->
                {#if $tradeStore.remoteMakerFee !== undefined || $tradeStore.remoteTakerFee !== undefined}
                    <button
                        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-xs rounded hover:bg-[var(--bg-tertiary)] transition-colors {isFeesSynced ? 'text-[var(--success-color)]' : 'text-[var(--text-secondary)]'}"
                        title={isFeesSynced ? 'Synced with API' : 'Reset to API default'}
                        on:click={syncFees}
                    >
                         {#if isFeesSynced}
                             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        {:else}
                             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 5.5A10 10 0 1 1 11.99 2.02"/></svg>
                        {/if}
                    </button>
                    <!-- Small Labels for Both Fees -->
                    <div class="absolute -bottom-5 right-1 flex gap-2 text-[10px] text-[var(--text-secondary)] font-mono">
                         {#if $tradeStore.remoteMakerFee !== undefined}
                             <span class:font-bold={$settingsStore.feePreference === 'maker'} class:text-[var(--accent-color)]={$settingsStore.feePreference === 'maker'}>M:{$tradeStore.remoteMakerFee}%</span>
                         {/if}
                         {#if $tradeStore.remoteTakerFee !== undefined}
                             <span class:font-bold={$settingsStore.feePreference === 'taker'} class:text-[var(--accent-color)]={$settingsStore.feePreference === 'taker'}>T:{$tradeStore.remoteTakerFee}%</span>
                         {/if}
                    </div>
                {/if}
            </div>
        </div>
        <!-- Spacer for the labels below inputs -->
        <div class="mb-1"></div>
    </div>
</div>
