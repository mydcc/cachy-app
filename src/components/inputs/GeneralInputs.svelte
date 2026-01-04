<script lang="ts">
    import { CONSTANTS } from '../../lib/constants';
    import { updateTradeStore, tradeStore } from '../../stores/tradeStore';
    import { settingsStore } from '../../stores/settingsStore';
    import { numberInput } from '../../utils/inputUtils';
    import { enhancedInput } from '../../lib/actions/inputEnhancements';
    import { _ } from '../../locales/i18n';
    import { trackClick } from '../../lib/actions';
    import { Decimal } from 'decimal.js';

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

    // Leverage Sync Status
    $: isLeverageSynced = $tradeStore.remoteLeverage !== undefined && leverage === $tradeStore.remoteLeverage;

    function syncLeverage() {
        if ($tradeStore.remoteLeverage !== undefined) {
            updateTradeStore(s => ({ ...s, leverage: s.remoteLeverage! }));
        }
    }

    // Fee Logic
    // feeMode defaults to maker_taker
    $: feeMode = $tradeStore.feeMode || 'maker_taker';

    // Derived "Entry Type" and "Exit Type" based on mode string
    $: entryType = feeMode.split('_')[0] as 'maker' | 'taker';
    $: exitType = feeMode.split('_')[1] as 'maker' | 'taker';

    function cycleFeeMode() {
        const modes: ('maker_maker' | 'maker_taker' | 'taker_taker' | 'taker_maker')[] = [
            'maker_taker',
            'taker_taker',
            'taker_maker',
            'maker_maker'
        ];
        const currentIndex = modes.indexOf(feeMode as any);
        const nextMode = modes[(currentIndex + 1) % modes.length];

        updateTradeStore(s => {
            const updates: any = { feeMode: nextMode };

            // Auto-update values if remote fees exist
            if (s.remoteMakerFee !== undefined && s.remoteTakerFee !== undefined) {
                const nextEntryType = nextMode.split('_')[0];
                const nextExitType = nextMode.split('_')[1];

                updates.fees = nextEntryType === 'maker' ? s.remoteMakerFee : s.remoteTakerFee;
                updates.exitFees = nextExitType === 'maker' ? s.remoteMakerFee : s.remoteTakerFee;
            }

            return { ...s, ...updates };
        });
    }

    // Initialize exitFees if missing
    $: if ($tradeStore.exitFees === undefined && fees !== null) {
        updateTradeStore(s => ({ ...s, exitFees: fees }));
    }

</script>

<style>
    /* Add subtle shadow for focused inputs */
    .input-field:focus {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border-color: var(--accent-color); /* Ensure border highlights too */
    }
</style>

<div>
    <h2 class="section-header" id="trade-type-label">{$_('dashboard.generalInputs.header')}</h2>
    <div class="grid grid-cols-1 gap-4 mb-4">
        <!-- Trade Type Switch -->
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
                    use:enhancedInput={{ step: 1, min: 1, max: 125, noDecimals: true, rightOffset: '18px' }}
                    value={format(leverage)}
                    on:input={handleLeverageInput}
                    class="input-field w-full h-full px-4 py-2 rounded-md transition-colors {isLeverageSynced ? 'border-[var(--success-color)]' : ''}"
                    placeholder="{$_('dashboard.generalInputs.leveragePlaceholder')}"
                >
                <!-- Sync Indicator -->
                {#if $tradeStore.remoteLeverage !== undefined}
                    <button
                        class="absolute right-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-colors duration-300 focus:outline-none z-30"
                        style="background-color: {isLeverageSynced ? 'var(--success-color)' : 'var(--warning-color)'};"
                        title={isLeverageSynced ? 'Synced with API' : `Manual Override (Click to sync to ${$tradeStore.remoteLeverage}x)`}
                        on:click={syncLeverage}
                    ></button>
                     <!-- Small Label for Margin Mode -->
                    {#if $tradeStore.remoteMarginMode}
                         <span class="absolute -bottom-5 left-1 text-[10px] uppercase text-[var(--text-secondary)] font-bold tracking-wider">
                             {$tradeStore.remoteMarginMode}
                         </span>
                    {/if}
                {/if}
            </div>

            <!-- Fees Input Wrapper -->
            <div class="relative mt-5"> <!-- Adjusted top margin for label -->
                 <!-- Interactive Fee Label -->
                 <div
                    class="absolute -top-5 left-1 text-xs font-bold cursor-pointer select-none flex gap-1 z-10"
                    on:click={cycleFeeMode}
                    title="Click to toggle Fee Mode (Entry / Exit)"
                    role="button"
                    tabindex="0"
                 >
                    <span
                        class="relative px-1 transition-colors"
                        style="color: var(--text-primary); border-bottom: {entryType === 'taker' ? '2px solid var(--warning-color)' : '2px solid transparent'}; opacity: {entryType === 'maker' ? '0.5' : '1'};"
                    >
                        Taker
                    </span>
                    <span class="text-[var(--text-secondary)]">/</span>
                    <span
                        class="relative px-1 transition-colors"
                        style="color: var(--text-primary); border-bottom: {exitType === 'maker' ? '2px solid var(--success-color)' : '2px solid transparent'}; opacity: {exitType === 'taker' ? '0.5' : '1'};"
                    >
                        Maker
                    </span>
                 </div>

                <input
                    id="fees-input"
                    type="text"
                    use:numberInput={{ maxDecimalPlaces: 4 }}
                    use:enhancedInput={{ step: 0.01 }}
                    value={format(fees)}
                    on:input={handleFeesInput}
                    class="input-field w-full px-4 py-2 rounded-md transition-colors"
                    placeholder="{$_('dashboard.generalInputs.feesPlaceholder')}"
                >
            </div>
        </div>
        <!-- Spacer for the labels below inputs -->
        <div class="mb-1"></div>
    </div>
</div>
