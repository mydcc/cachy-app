<script lang="ts">
    import { icons } from '../../lib/constants';
    import { debounce } from '../../utils/utils';
    import { createEventDispatcher } from 'svelte';
    import { numberInput } from '../../utils/inputUtils';
    import { enhancedInput } from '../../lib/actions/inputEnhancements';
    import { _ } from '../../locales/i18n';
    import { trackCustomEvent } from '../../services/trackingService';
    import { onboardingService } from '../../services/onboardingService';
    import { updateTradeStore } from '../../stores/tradeStore';
    import { settingsStore } from '../../stores/settingsStore';

    const dispatch = createEventDispatcher();

    export let symbol: string;
    export let entryPrice: number | null;
    export let useAtrSl: boolean;
    export let atrValue: number | null;
    export let atrMultiplier: number | null;
    export let stopLossPrice: number | null;
    export let atrMode: 'manual' | 'auto';
    export let atrTimeframe: string;
    export let tags: string[] = []; // Default empty array


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

    function toggleAutoUpdatePrice() {
        settingsStore.update(s => ({ ...s, autoUpdatePriceInput: !s.autoUpdatePriceInput }));
    }

    // Trigger Multi-ATR Scan when Price or ATR is fetched
    let wasPriceFetching = false;
    $: if (wasPriceFetching && !isPriceFetching && symbol && symbol.length >= 3) {
         scanMultiAtr();
    }
    $: wasPriceFetching = isPriceFetching;

    // Determine dynamic step based on price magnitude
    $: priceStep = entryPrice && entryPrice > 1000 ? 0.5 : (entryPrice && entryPrice > 100 ? 0.1 : 0.01);

    // Tags Logic
    let tagInput = '';

    function addTag() {
        const cleaned = tagInput.trim();
        if (cleaned) {
            if (!tags.includes(cleaned)) {
                // We update the store via the parent binding or store update
                // Since tags is a prop, we can update it if it's bound, but safer to use store update directly
                // to ensure consistency if parent relies on store.
                // However, the template iterates over `tags`.
                // Let's update store.
                updateTradeStore(s => ({ ...s, tags: [...s.tags, cleaned] }));
            }
            tagInput = '';
        }
    }

    function handleTagKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag();
        }
    }

    function removeTag(tagToRemove: string) {
        updateTradeStore(s => ({ ...s, tags: s.tags.filter(t => t !== tagToRemove) }));
    }

    // Multi-ATR Logic
    let isScanningAtr = false;
    let multiAtrData: Record<string, number> = {};

    async function scanMultiAtr() {
        if (!symbol) return;
        isScanningAtr = true;
        try {
            multiAtrData = await app.scanMultiAtr(symbol);
        } catch (e) {
            console.error(e);
        } finally {
            isScanningAtr = false;
        }
    }

    function applyAtr(tf: string, val: number) {
        updateTradeStore(s => ({ ...s, atrTimeframe: tf, atrValue: val }));
        // Trigger calculation via fetchAtr (which does calc) or just recalc
        // Since we set value directly, we can just trigger calc.
        // But app.setAtrTimeframe does more.
        dispatch('setAtrTimeframe', tf);
        // We manually updated atrValue in store, so we might need to notify app or just rely on reactivity?
        // app.setAtrTimeframe triggers fetchAtr if auto.
        // If we want to force this specific value:
        updateTradeStore(s => ({ ...s, atrValue: val }));
        // We might want to switch to manual mode if we are applying a specific value?
        // Or keep it auto but with this value?
        // If we keep auto, fetchAtr might overwrite it.
        // The UI button says "Apply {tf} ATR".
        // Let's assume we just want to set it.
    }
</script>

<style>
    .input-field:focus {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border-color: var(--accent-color);
        z-index: 10;
    }
</style>

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
                class="price-fetch-btn absolute top-2 right-2 {isPriceFetching ? 'animate-spin' : ''}"
                title="{$_('dashboard.tradeSetupInputs.fetchPriceTitle')}"
                aria-label="{$_('dashboard.tradeSetupInputs.fetchPriceAriaLabel')}"
                on:click={handleFetchPriceClick}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.5 5.5a.5.5 0 0 0-1 0v3.354l-1.46-1.47a.5.5 0 0 0-.708.708l2.146 2.147a.5.5 0 0 0 .708 0l2.146-2.147a.5.5 0 0 0-.708-.708L8.5 8.854V5.5z"/><path d="M8 16a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm7-8a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"/></svg>
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
        <div class="flex-grow relative">
            <input
                id="entry-price-input"
                type="text"
                use:numberInput={{ maxDecimalPlaces: 4 }}
                use:enhancedInput={{ step: priceStep, min: 0, rightOffset: '40px' }}
                value={format(entryPrice)}
                on:input={handleEntryPriceInput}
                class="input-field w-full px-4 py-2 rounded-md"
                placeholder="{$_('dashboard.tradeSetupInputs.entryPricePlaceholder')}"
                on:input={onboardingService.trackFirstInput}
            >

            <!-- Auto Update Price Toggle -->
            <button
                class="absolute top-2 right-2 rounded-full transition-colors duration-300 z-30"
                style="width: 0.382rem; height: 0.382rem; background-color: {$settingsStore.autoUpdatePriceInput ? 'var(--success-color)' : 'var(--danger-color)'}; margin-right: 14px;"
                title={$settingsStore.autoUpdatePriceInput ? 'Auto-Update On' : 'Auto-Update Off'}
                on:click={toggleAutoUpdatePrice}
                aria-label="Toggle Auto Update Price"
            ></button>
        </div>
    </div>

    <!-- Tags Input -->
    <div class="mb-4 relative">
        <div class="input-field w-full px-4 py-2 rounded-md flex flex-wrap items-center gap-2 min-h-[42px]">
            {#each tags as tag}
                <span class="bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs font-bold px-2 py-1 rounded flex items-center gap-1 border border-[var(--border-color)]">
                    #{tag}
                    <button class="hover:text-[var(--danger-color)]" on:click={() => removeTag(tag)}>×</button>
                </span>
            {/each}
            <input
                type="text"
                class="bg-transparent outline-none flex-grow min-w-[60px] text-sm"
                placeholder={tags.length === 0 ? $_('dashboard.tradeSetupInputs.tagsPlaceholder') : ''}
                bind:value={tagInput}
                on:keydown={handleTagKeydown}
                on:blur={addTag}
            />
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
            <div class="relative">
                <input
                    id="stop-loss-price-input"
                    type="text"
                    use:numberInput={{ maxDecimalPlaces: 4 }}
                    use:enhancedInput={{ step: priceStep, min: 0 }}
                    value={format(stopLossPrice)}
                    on:input={handleStopLossPriceInput}
                    class="input-field w-full px-4 py-2 rounded-md"
                    placeholder="{$_('dashboard.tradeSetupInputs.manualStopLossPlaceholder')}"
                >
            </div>
        {:else}
            {#if atrMode === 'manual'}
                <div class="grid grid-cols-2 gap-2 mt-2">
                    <div class="relative">
                        <input id="atr-value-input" type="text" use:numberInput={{ maxDecimalPlaces: 4 }} use:enhancedInput={{ step: 0.1, min: 0 }} value={format(atrValue)} on:input={handleAtrValueInput} class="input-field w-full px-4 py-2 rounded-md" placeholder="{$_('dashboard.tradeSetupInputs.atrValuePlaceholder')}">
                    </div>
                    <div class="relative">
                        <input id="atr-multiplier-input" type="text" use:numberInput={{ maxDecimalPlaces: 4 }} use:enhancedInput={{ step: 0.1, min: 0.1 }} value={format(atrMultiplier)} on:input={handleAtrMultiplierInput} class="input-field w-full px-4 py-2 rounded-md" placeholder="{$_('dashboard.tradeSetupInputs.multiplierPlaceholder')}">
                    </div>
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
                            <input
                                id="atr-value-input-auto"
                                type="text"
                                use:numberInput={{ maxDecimalPlaces: 4 }}
                                use:enhancedInput={{ step: 0.1, min: 0, rightOffset: '40px' }}
                                value={format(atrValue)}
                                on:input={handleAtrValueInput}
                                class="input-field w-full px-4 py-2 rounded-md pr-10"
                                placeholder="ATR"
                            >
                            <button 
                                type="button" 
                                class="price-fetch-btn absolute top-2 right-2 {isPriceFetching ? 'animate-spin' : ''}"
                                on:click={() => { trackCustomEvent('ATR', 'Fetch', symbol); dispatch('fetchAtr'); }} 
                                title="Fetch ATR Value"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.5 5.5a.5.5 0 0 0-1 0v3.354l-1.46-1.47a.5.5 0 0 0-.708.708l2.146 2.147a.5.5 0 0 0 .708 0l2.146-2.147a.5.5 0 0 0-.708-.708L8.5 8.854V5.5z"/><path d="M8 16a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm7-8a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"/></svg>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label for="atr-multiplier-input-auto" class="input-label !mb-1 text-xs">{$_('dashboard.tradeSetupInputs.atrMultiplierLabel')}</label>
                        <div class="relative">
                             <input id="atr-multiplier-input-auto" type="text" use:numberInput={{ maxDecimalPlaces: 4 }} use:enhancedInput={{ step: 0.1, min: 0.1 }} value={format(atrMultiplier)} on:input={handleAtrMultiplierInput} class="input-field w-full px-4 py-2 rounded-md" placeholder="1.2">
                        </div>
                    </div>
                </div>
            {/if}

            {#if showAtrFormulaDisplay}
                {@const lastEq = atrFormulaDisplay.lastIndexOf('=')}
                {@const formula = atrFormulaDisplay.substring(0, lastEq + 1)}
                {@const result = atrFormulaDisplay.substring(lastEq + 1)}
                <div class="text-center text-xs mt-2" style="color: var(--text-primary);">
                    <span>{formula}</span>
                    <span style="color: var(--danger-color);">{result}</span>
                </div>
            {/if}
        {/if}

        <!-- Multi-ATR Preview (Minimalist) -->
        {#if useAtrSl}
        <div class="mt-3 border-t border-[var(--border-color)] pt-2">
            <div class="flex items-center gap-2 flex-wrap text-xs">
                <button class="text-[var(--text-secondary)] hover:text-[var(--accent-color)] font-bold flex items-center gap-1" on:click={scanMultiAtr} disabled={isScanningAtr}>
                    <span class={isScanningAtr ? 'animate-spin' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 5.5A10 10 0 1 1 11.99 2.02"/></svg>
                    </span>
                    SCAN
                </button>
                {#if Object.keys(multiAtrData).length > 0}
                    <span class="text-[var(--border-color)]">|</span>
                    {#each Object.entries(multiAtrData) as [tf, val]}
                         <button class="px-2 py-0.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--accent-color)] hover:text-white transition-colors border border-[var(--border-color)]"
                             on:click={() => applyAtr(tf, val)}
                             title="Apply {tf} ATR"
                         >
                            <span class="font-bold opacity-70 mr-1">{tf}:</span>{val}
                         </button>
                    {/each}
                {:else if !isScanningAtr && symbol}
                    <span class="text-[var(--text-secondary)] italic opacity-50 ml-1">Click scan for multi-TF</span>
                {/if}
            </div>
        </div>
        {/if}
    </div>
</div>
