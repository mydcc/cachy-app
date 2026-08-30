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
  import { tradeState } from "../../stores/trade.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { safeJsonParse } from "../../utils/safeJson";
  import { mapApiErrorToLabel } from "../../utils/errorUtils";
  import { appFetch } from "../../lib/appAuth";
  import { paperAccountFeed } from "../../services/paperAccountFeed";
  import { paperState } from "../../stores/paperTrading.svelte";

  interface Props {
    accountSize: string | null;
    riskPercentage: string | null;
    riskAmount: string | number | null;
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
  let hasApiKeys = $derived(
    Boolean(settingsState.apiKeys[settingsState.apiProvider]?.key) &&
      Boolean(settingsState.apiKeys[settingsState.apiProvider]?.secret),
  );
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
    const val = value.trim();
    // Hardening: Treat empty input as null (if allowed) or "0" to prevent Decimal constructor crashes
    if (val === "") return allowEmpty ? null : "0";

    const num = parseFloat(val);
    if (isNaN(num)) return "0"; // Safe fallback

    if (num < min) return String(min);
    if (num > max) return String(max);
    return val;
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
      accountSize: validated ?? "0",
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
      riskPercentage: validated ?? "0",
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
      riskAmount: validated ?? "0",
    }));
  }


  async function handleFetchBalance(silent = false) {
    /*
     * FEAT-0327 — the read seam. While paper mode is on, the account this
     * field sizes against is the simulated one.
     *
     * This asked the broker regardless of mode, so the calculator sized every
     * simulated trade against real money the simulated trade would never be
     * charged to: the risk percentage, the position size and the stop distance
     * were all computed from an account balance the fill had nothing to do
     * with. It also needs no credentials, and reaches no network.
     */
    const paper = paperAccountFeed();
    if (paper) {
      tradeState.update((s) => ({ ...s, accountSize: paper.balance() }));
      if (!silent) uiState.showFeedback("save");
      return;
    }

    const settings = settingsState;
    const provider = settings.apiProvider;
    const keys = settings.apiKeys[provider];

    if (!keys.key || !keys.secret) {
      if (!silent) {
        uiState.showError("settings.missingApiKeys");
      }
      return;
    }

    isFetchingBalance = true;
    try {
      const res = await appFetch("/api/balance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": keys.key,
          "X-Api-Secret": keys.secret,
          ...(keys.passphrase ? { "X-Api-Passphrase": keys.passphrase } : {}),
        },
        body: JSON.stringify({
          exchange: provider,
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
    } catch (e) {
      if (!silent) {
        // [HARDENING] Map technical errors to friendly labels
        const mappedKey = mapApiErrorToLabel(e);
        if (mappedKey) {
            uiState.showError(mappedKey);
        } else {
            uiState.showError((e instanceof Error ? e.message : null) || $_("dashboard.portfolioInputs.fetchBalanceError"));
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

<div class="mb-4">
  <h2 class="section-header">
    {$_("dashboard.portfolioInputs.header")}
  </h2>
  <div class="flex flex-nowrap items-end gap-2 justify-start w-full">
    <div class="flex-[1.5] min-w-0">
      <label
        for="account-size"
        class="text-[11px] font-medium text-[var(--text-secondary)] whitespace-nowrap truncate block mb-1"
        title={$_("dashboard.portfolioInputs.accountSizeLabel")}
        >{$_("dashboard.portfolioInputs.accountSizeLabel")}</label
      >
      <div class="relative">
        <input
          id="account-size"
          name="accountSize"
          type="text"
          use:numberInput={{ maxDecimalPlaces: 4 }}
          use:enhancedInput={{
            step: 100,
            min: 0,
            hasAction: true,
          }}
          bind:value={localAccountSize}
          onfocus={() => (isAccountSizeFocused = true)}
          onblur={() => (isAccountSizeFocused = false)}
          oninput={handlers(
            handleAccountSizeInput,
            onboardingService.trackFirstInput,
          )}
          class="input-field w-full px-3 rounded-md text-sm"
          placeholder={$_("dashboard.portfolioInputs.accountSizePlaceholder")}
        />
        <button
          type="button"
          class="price-fetch-btn absolute top-1/2 right-2 -translate-y-1/2 {isFetchingBalance
            ? 'animate-spin'
            : ''}"
          onclick={() => handleFetchBalance(false)}
          title={paperState.enabled
            ? $_("dashboard.portfolioInputs.fetchBalanceTitlePaper")
            : $_("dashboard.portfolioInputs.fetchBalanceTitle")}
          disabled={isFetchingBalance || (!isConnected && !paperState.enabled)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 5.5A10 10 0 1 1 11.99 2.02"/></svg>
        </button>
      </div>
      {#if !hasApiKeys}
        <p class="mt-1 text-xs text-[var(--color-warning)]">
          {$_("dashboard.alerts.noApiKeys")}
        </p>
      {/if}
    </div>

    <div class="flex-[0.75] min-w-0">
      <label
        for="risk-percentage"
        class="text-[11px] font-medium text-[var(--text-secondary)] whitespace-nowrap truncate block mb-1"
        title={$_("dashboard.portfolioInputs.riskPerTradeLabel")}
        >{$_("dashboard.portfolioInputs.riskPerTradeLabel")}</label
      >
      <div class="relative">
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
          }}
          bind:value={localRiskPercentage}
          onfocus={() => (isRiskPercentageFocused = true)}
          onblur={() => (isRiskPercentageFocused = false)}
          oninput={handlers(
            handleRiskPercentageInput,
            onboardingService.trackFirstInput,
          )}
          class="input-field w-full px-3 rounded-md text-sm"
          placeholder={$_("dashboard.portfolioInputs.riskPerTradePlaceholder")}
          disabled={isRiskAmountLocked || isPositionSizeLocked}
        />
      </div>
    </div>

    <div class="flex-[1.0] min-w-0">
      <label
        for="risk-amount"
        class="text-[11px] font-medium text-[var(--text-secondary)] whitespace-nowrap truncate block mb-1"
        title={$_("dashboard.portfolioInputs.riskAmountLabel")}
        >{$_("dashboard.portfolioInputs.riskAmountLabel")}</label
      >
      <div class="relative">
        <input
          id="risk-amount"
          name="riskAmount"
          type="text"
          use:numberInput={{ maxDecimalPlaces: 2 }}
          use:enhancedInput={{
            step: 10,
            min: 0,
            hasAction: true,
          }}
          bind:value={localRiskAmount}
          onfocus={() => (isRiskAmountFocused = true)}
          onblur={() => (isRiskAmountFocused = false)}
          oninput={handleRiskAmountInput}
          class="input-field w-full px-3 rounded-md text-sm"
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
