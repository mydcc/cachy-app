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
  import { settingsState } from "../../stores/settings.svelte";
  import { uiState } from "../../stores/ui.svelte";

  interface Props {
    accountSize: number | null;
    riskPercentage: number | null;
    riskAmount: number | null;
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

  let isFetchingBalance = $state(false);

  const dispatch = createEventDispatcher();

  function handleLockClick() {
    dispatch("toggleRiskAmountLock");
  }

  const format = (val: number | null) =>
    val === null || val === undefined ? "" : String(val);

  function handleAccountSizeInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    tradeState.update((s) => ({
      ...s,
      accountSize: value === "" ? null : parseFloat(value),
    }));
  }

  function handleRiskPercentageInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    tradeState.update((s) => ({
      ...s,
      riskPercentage: value === "" ? null : parseFloat(value),
    }));
  }

  function handleRiskAmountInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    tradeState.update((s) => ({
      ...s,
      riskAmount: value === "" ? null : parseFloat(value),
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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch balance");
      }

      if (typeof data.balance === "number") {
        tradeState.update((s) => ({ ...s, accountSize: data.balance }));
        if (!silent) {
          uiState.showFeedback("save"); // Show success feedback
        }
      } else {
        throw new Error("Invalid balance data received");
      }
    } catch (e: any) {
      if (!silent) {
        uiState.showError(e.message || "Error fetching balance");
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
          value={format(accountSize)}
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
          title={$_("dashboard.portfolioInputs.fetchBalanceTitle") ||
            "Fetch Balance"}
          disabled={isFetchingBalance}
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
          value={format(riskPercentage)}
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
          value={format(riskAmount)}
          oninput={handleRiskAmountInput}
          class="input-field w-full px-4 py-2 rounded-md pr-10"
          placeholder="e.g. 100"
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
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.3),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border-color: var(--accent-color);
    z-index: 10;
  }
</style>
