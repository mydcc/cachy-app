<script lang="ts">
    import { icons } from '../../lib/constants';
    import { debounce } from '../../utils/utils';
    import { createEventDispatcher } from 'svelte';
    import { numberInput } from '../../utils/inputUtils';
    import { _ } from '../../locales/i18n';
    import { trackCustomEvent } from '../../services/trackingService';
    import { onboardingService } from '../../services/onboardingService';
    import { updateTradeStore } from '../../stores/tradeStore';

    const dispatch = createEventDispatcher();

    export let symbol: string;
    export let entryPrice: number | null;
    export let useAtrSl: boolean;
    export let atrValue: number | null;
    export let atrMultiplier: number | null;
    export let stopLossPrice: number | null;
    export let atrMode: 'manual' | 'auto';
    export let atrTimeframe: string;


    export let atrFormulaDisplay: string;
    export let showAtrFormulaDisplay: boolean;
    export let isAtrSlInvalid: boolean;
    export let isPriceFetching: boolean;
    export let symbolSuggestions: string[];
    export let showSymbolSuggestions: boolean;

    function toggleAtrSl() {
        trackCustomEvent('ATR', 'Toggle', useAtrSl ? 'On' : 'Off');
        dispatch('toggleAtrInputs', useAtrSl);
    }

    function handleFetchPriceClick() {
        trackCustomEvent('Price', 'Fetch', symbol);
        dispatch('fetchPrice');
    }

    import { app } from '../../services/app';

    const handleSymbolInput = debounce(() => {
        app.updateSymbolSuggestions(symbol);
        // Automatically fetch price and ATR when user stops typing a valid symbol
        if (symbol && symbol.length >= 3) {
             dispatch('fetchPrice');
             // Also fetch ATR if in auto mode
             if (useAtrSl && atrMode === 'auto') {
                 dispatch('fetchAtr');
             }
        }
    }, 500); // Increased debounce to 500ms to avoid fetching while still typing rapidly

    function selectSuggestion(s: string) {
        trackCustomEvent('Symbol', 'SelectSuggestion', s);
        dispatch('selectSymbolSuggestion', s);
    }

    function handleKeyDownSuggestion(event: KeyboardEvent, s: string) {
        if (event.key === 'Enter') {
            selectSuggestion(s);
        }
    }

    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.symbol-input-container')) {
            app.updateSymbolSuggestions(''); // Clear suggestions
        }
    }

    const format = (val: number | null) => (val === null || val === undefined) ? '' : String(val);

    function handleEntryPriceInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        updateTradeStore(s => ({ ...s, entryPrice: value === '' ? null : parseFloat(value) }));
    }

    function handleAtrValueInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        updateTradeStore(s => ({ ...s, atrValue: value === '' ? null : parseFloat(value) }));
    }

    function handleAtrMultiplierInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        updateTradeStore(s => ({ ...s, atrMultiplier: value === '' ? null : parseFloat(value) }));
    }

    function handleStopLossPriceInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        updateTradeStore(s => ({ ...s, stopLossPrice: value === '' ? null : parseFloat(value) }));
    }
</script>

<svelte:window on:click={handleClickOutside} />

<div>
    <h2 class="section-header">{$_('dashboard.tradeSetupInputs.header')}</h2>
    <div class="flex gap-4 mb-4">
        <div class="relative flex-grow symbol-input-container">
            <input
                id="symbol-input"
                type="text"
                bind:value={symbol}
                on:input={() => { handleSymbolInput(); onboardingService.trackFirstInput(); }}
                class="input-field w-full px-4 py-2 rounded-md pr-10"
                placeholder="{$_('dashboard.tradeSetupInputs.symbolPlaceholder')}"
                autocomplete="off"
            >
            <button
                type="button"
                class="price-fetch-btn absolute top-1/2 right-2 -translate-y-1/2 {isPriceFetching ? 'animate-spin' : ''}"
                title="{$_('dashboard.tradeSetupInputs.fetchPriceTitle')}"
                aria-label="{$_('dashboard.tradeSetupInputs.fetchPriceAriaLabel')}"
                on:click={handleFetchPriceClick}
            >
                {@html icons.fetch}
            </button>
            {#if showSymbolSuggestions}
                <div class="absolute top-full left-0 w-full rounded-md shadow-lg mt-1 overflow-hidden border border-[var(--border-color)] z-20 bg-[var(--bg-secondary)]">
                    {#each symbolSuggestions as s}
                        <div
                            class="suggestion-item p-2 cursor-pointer hover:bg-[var(--accent-color)] hover:text-white"
                            on:click={() => selectSuggestion(s)}
                            on:keydown={(e) => handleKeyDownSuggestion(e, s)}
                            role="button"
                            tabindex="0"
                        >
                            {s}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
        <div class="flex-grow">
            <input id="entry-price-input" type="text" use:numberInput={{ maxDecimalPlaces: 4 }} value={format(entryPrice)} on:input={handleEntryPriceInput} class="input-field w-full px-4 py-2 rounded-md" placeholder="{$_('dashboard.tradeSetupInputs.entryPricePlaceholder')}" on:input={onboardingService.trackFirstInput}>
        </div>
    </div>

    <div class="p-2 rounded-lg mb-4" style="background-color: var(--bg-tertiary);">
        <div class="flex items-center mb-2 {useAtrSl ? 'justify-between' : 'justify-end'}">
            {#if useAtrSl}
            <div class="atr-mode-switcher">
                <button
                    class="btn-switcher {atrMode === 'manual' ? 'active' : ''}"
                    on:click={() => dispatch('setAtrMode', 'manual')}
                >
                    {$_('dashboard.tradeSetupInputs.atrModeManual')}
                </button>
                <button
                    class="btn-switcher {atrMode === 'auto' ? 'active' : ''}"
                    on:click={() => dispatch('setAtrMode', 'auto')}
                >
                    {$_('dashboard.tradeSetupInputs.atrModeAuto')}
                </button>
            </div>
            {/if}
            <label class="flex items-center cursor-pointer">
                <span class="mr-2 text-sm">{$_('dashboard.tradeSetupInputs.atrStopLossLabel')}</span>
                <input id="use-atr-sl-checkbox" type="checkbox" bind:checked={useAtrSl} on:change={toggleAtrSl} class="sr-only peer" role="switch" aria-checked={useAtrSl}>
                <div class="atr-toggle-track relative w-11 h-6 peer-focus:outline-none rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:border after:rounded-full after:h-5 after:w-5"></div>
            </label>
        </div>
        {#if !useAtrSl}
            <div>
                <input id="stop-loss-price-input" type="text" use:numberInput={{ maxDecimalPlaces: 4 }} value={format(stopLossPrice)} on:input={handleStopLossPriceInput} class="input-field w-full px-4 py-2 rounded-md" placeholder="{$_('dashboard.tradeSetupInputs.manualStopLossPlaceholder')}">
            </div>
        {:else}
            {#if atrMode === 'manual'}
                <div class="grid grid-cols-2 gap-2 mt-2">
                    <input id="atr-value-input" type="text" use:numberInput={{ maxDecimalPlaces: 4 }} value={format(atrValue)} on:input={handleAtrValueInput} class="input-field w-full px-4 py-2 rounded-md" placeholder="{$_('dashboard.tradeSetupInputs.atrValuePlaceholder')}">
                    <input id="atr-multiplier-input" type="text" use:numberInput={{ maxDecimalPlaces: 4 }} value={format(atrMultiplier)} on:input={handleAtrMultiplierInput} class="input-field w-full px-4 py-2 rounded-md" placeholder="{$_('dashboard.tradeSetupInputs.multiplierPlaceholder')}">
                </div>
            {:else}
                <div class="grid grid-cols-3 gap-2 mt-2 items-end">
                    <div>
                        <label for="atr-timeframe" class="input-label !mb-1 text-xs">{$_('dashboard.tradeSetupInputs.atrTimeframeLabel')}</label>
                        <select id="atr-timeframe" bind:value={atrTimeframe} on:change={(e) => dispatch('setAtrTimeframe', e.currentTarget.value)} class="input-field w-full px-4 py-2 rounded-md">
                            <option value="5m">5m</option>
                            <option value="15m">15m</option>
                            <option value="1h">1h</option>
                            <option value="4h">4h</option>
                            <option value="1d">1d</option>
                        </select>
                    </div>
                    <div>
                        <label for="atr-value-input-auto" class="input-label !mb-1 text-xs">{$_('dashboard.tradeSetupInputs.atrLabel')}</label>
                        <div class="relative">
                            <input id="atr-value-input-auto" type="text" use:numberInput={{ maxDecimalPlaces: 4 }} value={format(atrValue)} on:input={handleAtrValueInput} class="input-field w-full px-4 py-2 rounded-md pr-10" placeholder="ATR">
                            <button 
                                type="button" 
                                class="price-fetch-btn absolute top-1/2 right-2 -translate-y-1/2 {isPriceFetching ? 'animate-spin' : ''}" 
                                on:click={() => { trackCustomEvent('ATR', 'Fetch', symbol); dispatch('fetchAtr'); }} 
                                title="Fetch ATR Value"
                            >
                                {@html icons.fetch}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label for="atr-multiplier-input-auto" class="input-label !mb-1 text-xs">{$_('dashboard.tradeSetupInputs.atrMultiplierLabel')}</label>
                        <input id="atr-multiplier-input-auto" type="text" use:numberInput={{ maxDecimalPlaces: 4 }} value={format(atrMultiplier)} on:input={handleAtrMultiplierInput} class="input-field w-full px-4 py-2 rounded-md" placeholder="1.2">
                    </div>
                </div>
            {/if}

            {#if showAtrFormulaDisplay}
                {@const lastEq = atrFormulaDisplay.lastIndexOf('=')}
                {@const formula = atrFormulaDisplay.substring(0, lastEq + 1)}
                {@const result = atrFormulaDisplay.substring(lastEq + 1)}
                <div class="text-center text-xs mt-2" style="color: var(--text-primary);">
                    <span>{formula}</span>
                    <span style={isAtrSlInvalid ? 'color: var(--danger-color)' : 'color: var(--accent-color)'}>{result}</span>
                </div>
            {/if}
        {/if}
    </div>
</div>
