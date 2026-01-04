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
                    type="text"
                    use:numberInput={{ maxDecimalPlaces: 4 }}
                    use:enhancedInput={{ step: 100, min: 0, rightOffset: '24px' }}
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
                    style="margin-right: 16px;"
                >
                    {@html icons.fetch}
                </button>
            </div>
        </div>
        <div>
            <label for="risk-percentage" class="input-label text-xs">{$_('dashboard.portfolioInputs.riskPerTradeLabel')}</label>
            <div class="relative">
                <input
                    id="risk-percentage"
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
                    type="text"
                    use:numberInput={{ maxDecimalPlaces: 2 }}
                    use:enhancedInput={{ step: 10, min: 0, rightOffset: '24px' }}
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
                    style="margin-right: 16px;"
                >
                    {@html isRiskAmountLocked ? icons.lockClosed : icons.lockOpen}
                </button>
            </div>
        </div>
    </div>
</div>
