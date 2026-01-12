<script lang="ts">
    import { numberInput } from '../../utils/inputUtils';
    import { enhancedInput } from '../../lib/actions/inputEnhancements';
    import { _ } from '../../locales/i18n';
    import { onboardingService } from '../../services/onboardingService';
    import { createEventDispatcher, onMount } from 'svelte';
    import { icons } from '../../lib/constants';
    import { updateTradeStore } from '../../stores/tradeStore';
    import { settingsStore } from '../../stores/settingsStore';
    import { uiStore } from '../../stores/uiStore';
    import { get } from 'svelte/store';

    export let accountSize: number | null;
    export let riskPercentage: number | null;
    export let riskAmount: number | null;
    export let isRiskAmountLocked: boolean;
    export let isPositionSizeLocked: boolean;

    let isFetchingBalance = false;

    const dispatch = createEventDispatcher();

    function handleLockClick() {
        dispatch('toggleRiskAmountLock');
    }

    const format = (val: number | null) => (val === null || val === undefined) ? '' : String(val);

    function handleAccountSizeInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        updateTradeStore(s => ({ ...s, accountSize: value === '' ? null : parseFloat(value) }));
    }

    function handleRiskPercentageInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        updateTradeStore(s => ({ ...s, riskPercentage: value === '' ? null : parseFloat(value) }));
    }

    function handleRiskAmountInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        updateTradeStore(s => ({ ...s, riskAmount: value === '' ? null : parseFloat(value) }));
    }

    async function handleFetchBalance(silent = false) {
        const settings = get(settingsStore);
        const provider = settings.apiProvider;
        const keys = settings.apiKeys[provider];

        if (!keys.key || !keys.secret) {
            if (!silent) {
                uiStore.showError('settings.missingApiKeys');
                uiStore.toggleSettingsModal(true);
            }
            return;
        }

        isFetchingBalance = true;
        try {
            const res = await fetch('/api/balance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    exchange: provider,
                    apiKey: keys.key,
                    apiSecret: keys.secret
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch balance');
            }

            if (typeof data.balance === 'number') {
                updateTradeStore(s => ({ ...s, accountSize: data.balance }));
                if (!silent) {
                    uiStore.showFeedback('save'); // Show success feedback
                }
            } else {
                throw new Error('Invalid balance data received');
            }

        } catch (e: any) {
            if (!silent) {
                uiStore.showError(e.message || 'Error fetching balance');
            } else {
                console.warn('Auto-fetch balance failed:', e);
            }
        } finally {
            isFetchingBalance = false;
        }
    }

    onMount(() => {
        const settings = get(settingsStore);
        if (settings.autoFetchBalance) {
            handleFetchBalance(true);
        }
    });
</script>

<style>
    .input-field:focus {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border-color: var(--accent-color);
        z-index: 10;
    }
</style>

<div>
    <h2 class="section-header !mt-6">{$_('dashboard.portfolioInputs.header')}</h2>
    <div class="grid grid-cols-3 gap-4">
        <div>
            <label for="account-size" class="input-label text-xs">{$_('dashboard.portfolioInputs.accountSizeLabel')}</label>
            <div class="relative">
                <input
                    id="account-size"
                    name="accountSize"
                    type="text"
                    use:numberInput={{ maxDecimalPlaces: 4 }}
                    use:enhancedInput={{ step: 100, min: 0, rightOffset: '40px' }}
                    value={format(accountSize)}
                    on:input={handleAccountSizeInput}
                    class="input-field w-full px-4 py-2 rounded-md pr-10"
                    placeholder="{$_('dashboard.portfolioInputs.accountSizePlaceholder')}"
                    on:input={onboardingService.trackFirstInput}
                >
                <button 
                    class="price-fetch-btn absolute top-1/2 right-2 -translate-y-1/2 {isFetchingBalance ? 'animate-spin' : ''}"
                    on:click={() => handleFetchBalance(false)} 
                    title="{$_('dashboard.portfolioInputs.fetchBalanceTitle') || 'Fetch Balance'}"
                    disabled={isFetchingBalance}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.5 5.5a.5.5 0 0 0-1 0v3.354l-1.46-1.47a.5.5 0 0 0-.708.708l2.146 2.147a.5.5 0 0 0 .708 0l2.146-2.147a.5.5 0 0 0-.708-.708L8.5 8.854V5.5z"/><path d="M8 16a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm7-8a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"/></svg>
                </button>
            </div>
        </div>
        <div>
            <label for="risk-percentage" class="input-label text-xs">{$_('dashboard.portfolioInputs.riskPerTradeLabel')}</label>
            <div class="relative">
                <input
                    id="risk-percentage"
                    name="riskPercentage"
                    type="text"
                    use:numberInput={{ maxDecimalPlaces: 2, isPercentage: true, maxValue: 100, minValue: 0 }}
                    use:enhancedInput={{ step: 0.5, min: 0, max: 100, rightOffset: '2px' }}
                    value={format(riskPercentage)}
                    on:input={handleRiskPercentageInput}
                    class="input-field w-full px-4 py-2 rounded-md"
                    placeholder="{$_('dashboard.portfolioInputs.riskPerTradePlaceholder')}"
                    on:input={onboardingService.trackFirstInput}
                    disabled={isRiskAmountLocked || isPositionSizeLocked}
                >
            </div>
        </div>
        <div>
            <label for="risk-amount" class="input-label text-xs">{$_('dashboard.portfolioInputs.riskAmountLabel')}</label>
            <div class="relative">
                <input
                    id="risk-amount"
                    name="riskAmount"
                    type="text"
                    use:numberInput={{ maxDecimalPlaces: 2 }}
                    use:enhancedInput={{ step: 10, min: 0, rightOffset: '40px' }}
                    value={format(riskAmount)}
                    on:input={handleRiskAmountInput}
                    class="input-field w-full px-4 py-2 rounded-md pr-10"
                    placeholder="e.g. 100"
                    disabled={isPositionSizeLocked}
                >
                <button
                    class="absolute top-1/2 right-2 -translate-y-1/2 btn-lock-icon"
                    on:click={handleLockClick}
                    title="{$_('dashboard.portfolioInputs.toggleRiskAmountLockTitle')}"
                    disabled={isPositionSizeLocked}
                >
                    {#if isRiskAmountLocked}
                        <svg class="lock-icon-closed" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>
                    {:else}
                        <svg class="lock-icon-open" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-4 0H8V6c0-2.21 1.79-4 4-4s4 1.79 4 4v2z"/></svg>
                    {/if}
                </button>
            </div>
        </div>
    </div>
</div>
