<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import { handlers } from "svelte/legacy";

  import { numberInput } from "../../utils/inputUtils";
  import { enhancedInput } from "../../lib/actions/inputEnhancements";
  import { _ } from "../../locales/i18n";
  import { onboardingService } from "../../services/onboardingService";
  import { createEventDispatcher, onMount } from "svelte";
  import { icons } from "../../lib/constants";
  import { tradeState } from "../../stores/trade.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { safeJsonParse } from "../../utils/safeJson";
  import { mapApiErrorToLabel } from "../../utils/errorUtils";

  interface Props {
    accountSize: string | null;
    riskPercentage: string | null;
    riskAmount: string | null;
    isRiskAmountLocked: boolean;
    isPositionSizeLocked: boolean;
  }

  let {
    accountSize = $bindable(),
    riskPercentage = $bindable(),
    riskAmount = $bindable(),
    isRiskAmountLocked = $bindable(),
    isPositionSizeLocked = $bindable(),
  }: Props = $props();

  let isConnected = $derived(marketState.connectionStatus === "connected");
  let isFetchingBalance = $state(false);

  const dispatch = createEventDispatcher();

  function handleLockClick() {
    dispatch("toggleRiskAmountLock");
  }

  const format = (val: string | number | null) =>
    val === null || val === undefined ? "" : String(val);

  // Local state to prevent cursor jumps during updates
  let localAccountSize = $state(format(accountSize));
  let isAccountSizeFocused = $state(false);

  let localRiskPercentage = $state(format(riskPercentage));
  let isRiskPercentageFocused = $state(false);

  let localRiskAmount = $state(format(riskAmount));
  let isRiskAmountFocused = $state(false);

  // Sync props to local state (One-way sync when NOT focused)
  $effect(() => {
    if (!isAccountSizeFocused && format(accountSize) !== localAccountSize) {
      localAccountSize = format(accountSize);
    }
  });

  $effect(() => {
    if (!isRiskPercentageFocused && format(riskPercentage) !== localRiskPercentage) {
      localRiskPercentage = format(riskPercentage);
    }
  });

  $effect(() => {
    if (!isRiskAmountFocused && format(riskAmount) !== localRiskAmount) {
      localRiskAmount = format(riskAmount);
    }
  });

  function validateInput(value: string, allowEmpty = true, min = 0, max = Infinity): string | null {
    // Hardening: Treat empty input as "0" to prevent Decimal constructor crashes
    if (value === "") return "0";

    const num = parseFloat(value);
    if (isNaN(num)) return "0"; // Safe fallback

    if (num < min) return String(min);
    if (num > max) return String(max);
    return value;
  }

  function handleAccountSizeInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    // Hardening: Disallow negative inputs immediately
    if (value && !/^\d*\.?\d*$/.test(value)) return; // Regex basic check for positive numbers

    const validated = validateInput(value, true, 0);
    localAccountSize = value; // Keep user input in UI
    tradeState.update((s) => ({
      ...s,
      accountSize: validated,
    }));
  }

  function handleRiskPercentageInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    if (value && !/^\d*\.?\d*$/.test(value)) return;

    const validated = validateInput(value, true, 0, 100);
    localRiskPercentage = value;
    tradeState.update((s) => ({
      ...s,
      riskPercentage: validated,
    }));
  }

  function handleRiskAmountInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    if (value && !/^\d*\.?\d*$/.test(value)) return;

    const validated = validateInput(value, true, 0);
    localRiskAmount = value;
    tradeState.update((s) => ({
      ...s,
      riskAmount: validated,
    }));
  }


  async function handleFetchBalance(silent = false) {
    const settings = settingsState;
    const provider = settings.apiProvider;
    const keys = settings.apiKeys[provider];

    if (!keys.key || !keys.secret) {
      if (!silent) {
        uiState.showError("settings.missingApiKeys");
        uiState.toggleSettingsModal(true);
      }
      return;
    }

    isFetchingBalance = true;
    try {
      const res = await fetch("/api/balance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          exchange: provider,
          apiKey: keys.key,
          apiSecret: keys.secret,
        }),
      });

      const text = await res.text();
      const data = safeJsonParse(text);

      if (!res.ok) {
        throw new Error(data.error || $_("dashboard.portfolioInputs.fetchBalanceError"));
      }

      if (typeof data.balance === "number" || typeof data.balance === "string") {
        tradeState.update((s) => ({ ...s, accountSize: String(data.balance) }));
        if (!silent) {
          uiState.showFeedback("save"); // Show success feedback
        }
      } else {
        throw new Error($_("dashboard.portfolioInputs.invalidBalanceData"));
      }
    } catch (e: any) {
      if (!silent) {
        // [HARDENING] Map technical errors to friendly labels
        const mappedKey = mapApiErrorToLabel(e);
        if (mappedKey) {
            uiState.showError(mappedKey);
        } else {
            uiState.showError(e.message || $_("dashboard.portfolioInputs.fetchBalanceError"));
        }
      } else {
        console.warn("Auto-fetch balance failed:", e);
      }
    } finally {
      isFetchingBalance = false;
    }
  }

  onMount(() => {
    const settings = settingsState;
    if (settings.autoFetchBalance) {
      handleFetchBalance(true);
    }
  });
</script>

<div>
  <h2 class="section-header !mt-6">
    {$_("dashboard.portfolioInputs.header")}
  </h2>
  <div class="flex flex-nowrap items-end gap-3 justify-start w-full">
    <div class="flex-1 min-w-0">
      <label
        for="account-size"
        class="input-label text-xs whitespace-nowrap overflow-visible"
        >{$_("dashboard.portfolioInputs.accountSizeLabel")}</label
      >
      <div class="relative mt-1">
        <input
          id="account-size"
          name="accountSize"
          type="text"
          use:numberInput={{ maxDecimalPlaces: 4 }}
          use:enhancedInput={{
            step: 100,
            min: 0,
            rightOffset: "40px",
            showSpinButtons: false,
          }}
          bind:value={localAccountSize}
          onfocus={() => (isAccountSizeFocused = true)}
          onblur={() => (isAccountSizeFocused = false)}
          oninput={handlers(
            handleAccountSizeInput,
            onboardingService.trackFirstInput,
          )}
          class="input-field w-full px-4 py-2 rounded-md pr-10"
          placeholder={$_("dashboard.portfolioInputs.accountSizePlaceholder")}
        />
        <button
          type="button"
          class="price-fetch-btn absolute top-1/2 right-2 -translate-y-1/2 {isFetchingBalance
            ? 'animate-spin'
            : ''}"
          onclick={() => handleFetchBalance(false)}
          title={$_("dashboard.portfolioInputs.fetchBalanceTitle")}
          disabled={isFetchingBalance || !isConnected}
        >
          {@html icons.refresh ||
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.5 5.5a.5.5 0 0 0-1 0v3.354l-1.46-1.47a.5.5 0 0 0-.708.708l2.146 2.147a.5.5 0 0 0 .708 0l2.146-2.147a.5.5 0 0 0-.708-.708L8.5 8.854V5.5z"/><path d="M8 16a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm7-8a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"/></svg>'}
        </button>
      </div>
    </div>

    <div class="flex-1 min-w-0">
      <label
        for="risk-percentage"
        class="input-label text-xs whitespace-nowrap overflow-visible"
        >{$_("dashboard.portfolioInputs.riskPerTradeLabel")}</label
      >
      <div class="relative mt-1">
        <input
          id="risk-percentage"
          name="riskPercentage"
          type="text"
          use:numberInput={{
            maxDecimalPlaces: 2,
            isPercentage: true,
            maxValue: 100,
            minValue: 0,
          }}
          use:enhancedInput={{
            step: 0.5,
            min: 0,
            max: 100,
            rightOffset: "40px",
            showSpinButtons: false,
          }}
          bind:value={localRiskPercentage}
          onfocus={() => (isRiskPercentageFocused = true)}
          onblur={() => (isRiskPercentageFocused = false)}
          oninput={handlers(
            handleRiskPercentageInput,
            onboardingService.trackFirstInput,
          )}
          class="input-field w-full px-4 py-2 rounded-md"
          placeholder={$_("dashboard.portfolioInputs.riskPerTradePlaceholder")}
          disabled={isRiskAmountLocked || isPositionSizeLocked}
        />
      </div>
    </div>

    <div class="flex-1 min-w-0">
      <label
        for="risk-amount"
        class="input-label text-xs whitespace-nowrap overflow-visible"
        >{$_("dashboard.portfolioInputs.riskAmountLabel")}</label
      >
      <div class="relative mt-1">
        <input
          id="risk-amount"
          name="riskAmount"
          type="text"
          use:numberInput={{ maxDecimalPlaces: 2 }}
          use:enhancedInput={{
            step: 10,
            min: 0,
            rightOffset: "40px",
            showSpinButtons: false,
          }}
          bind:value={localRiskAmount}
          onfocus={() => (isRiskAmountFocused = true)}
          onblur={() => (isRiskAmountFocused = false)}
          oninput={handleRiskAmountInput}
          class="input-field w-full px-4 py-2 rounded-md pr-10"
          placeholder={$_("dashboard.portfolioInputs.riskAmountPlaceholder")}
          disabled={isPositionSizeLocked}
        />
        <button
          class="absolute top-1/2 right-2 -translate-y-1/2 btn-lock-icon"
          onclick={handleLockClick}
          title={$_("dashboard.portfolioInputs.toggleRiskAmountLockTitle")}
          disabled={isPositionSizeLocked}
        >
          {#if isRiskAmountLocked}
            <svg
              class="lock-icon-closed"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              viewBox="0 0 24 24"
              ><path
                d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"
              /></svg
            >
          {:else}
            <svg
              class="lock-icon-open"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              viewBox="0 0 24 24"
              ><path
                d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-4 0H8V6c0-2.21 1.79-4 4-4s4 1.79 4 4v2z"
              /></svg
            >
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .input-field:focus {
    box-shadow: var(--shadow-card);
    border-color: var(--accent-color);
    z-index: 10;
  }
</style>
