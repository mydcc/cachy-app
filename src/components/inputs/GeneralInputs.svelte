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
  import { CONSTANTS } from "../../lib/constants";
  import { tradeState } from "../../stores/trade.svelte";

  import { numberInput } from "../../utils/inputUtils";
  import { enhancedInput } from "../../lib/actions/inputEnhancements";
  import { _ } from "../../locales/i18n";
  import { trackClick } from "../../lib/actions";
  import { trackCustomEvent } from "../../services/trackingService";
  import { Decimal } from "decimal.js";

  interface Props {
    tradeType: string;
    leverage: string | null;
    fees: string | null;
  }

  let {
    tradeType = $bindable(),
    leverage = $bindable(),
    fees = $bindable(),
  }: Props = $props();

  function setTradeType(type: string) {
    // Direct assignment instead of .update()
    tradeState.tradeType = type;
    trackCustomEvent("Trade", "ChangeType", type);
  }

  const format = (val: string | number | null) =>
    val === null || val === undefined ? "" : String(val);

  function handleLeverageInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    // Direct assignment
    tradeState.leverage = value === "" ? null : value;
  }

  function handleFeesInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    // Direct assignment
    tradeState.fees = value === "" ? null : value;
  }

  // Leverage Sync Status
  let remoteLev = $derived(tradeState.remoteLeverage);
  let isLeverageSynced = $derived(
    remoteLev !== undefined && leverage === String(remoteLev),
  );

  function syncLeverage() {
    if (remoteLev !== undefined) {
      // Direct assignment
      tradeState.leverage = String(remoteLev);
    }
  }

  // Fee Logic
  let feeMode = $derived(tradeState.feeMode || "maker_taker");
  let entryType = $derived(feeMode.split("_")[0] as "maker" | "taker");
  let targetRemoteFee = $derived(
    entryType === "maker"
      ? tradeState.remoteMakerFee
      : tradeState.remoteTakerFee,
  );

  let isFeeSynced = $derived(
    targetRemoteFee !== undefined && fees === String(targetRemoteFee),
  );

  function syncFee() {
    if (targetRemoteFee !== undefined) {
      // Direct assignment
      tradeState.fees = String(targetRemoteFee);
    }
  }
</script>

<div>
  <h2 class="section-header" id="trade-type-label">
    {$_("dashboard.generalInputs.header")}
  </h2>
  <div class="grid grid-cols-1 gap-4 mb-4">
    <!-- Trade Type Switch -->
    <div
      class="trade-type-switch p-1 rounded-lg flex"
      role="radiogroup"
      aria-labelledby="trade-type-label"
    >
      <button
        id="trade-long-btn"
        name="tradeType"
        data-track-id="trade-type-long"
        value={CONSTANTS.TRADE_TYPE_LONG}
        class="long w-1/2"
        class:active={tradeType === CONSTANTS.TRADE_TYPE_LONG}
        role="radio"
        aria-checked={tradeType === CONSTANTS.TRADE_TYPE_LONG}
        onclick={() => setTradeType(CONSTANTS.TRADE_TYPE_LONG)}
        >{$_("dashboard.generalInputs.longButton")}</button
      >
      <button
        id="trade-short-btn"
        name="tradeType"
        data-track-id="trade-type-short"
        value={CONSTANTS.TRADE_TYPE_SHORT}
        class="short w-1/2"
        class:active={tradeType === CONSTANTS.TRADE_TYPE_SHORT}
        role="radio"
        aria-checked={tradeType === CONSTANTS.TRADE_TYPE_SHORT}
        onclick={() => setTradeType(CONSTANTS.TRADE_TYPE_SHORT)}
        >{$_("dashboard.generalInputs.shortButton")}</button
      >
    </div>

    <div class="grid grid-cols-2 gap-4">
      <!-- Leverage Input Wrapper -->
      <div class="relative">
        <label
          for="leverage-input"
          class="text-[10px] text-[var(--text-secondary)] absolute -top-4 left-0"
          >{$_("dashboard.generalInputs.leverage")}</label
        >
        <input
          id="leverage-input"
          name="leverage"
          type="text"
          data-track-id="input-leverage"
          use:numberInput={{
            noDecimals: true,
            maxValue: 125,
            minValue: 1,
          }}
          use:enhancedInput={{
            step: 1,
            min: 1,
            max: 125,
            noDecimals: true,
            rightOffset: "24px",
          }}
          value={format(leverage)}
          oninput={handleLeverageInput}
          class="input-field w-full px-4 py-2 rounded-md transition-colors"
          class:border-green-500={isLeverageSynced}
          class:text-green-400={isLeverageSynced}
          placeholder={$_("dashboard.generalInputs.leveragePlaceholder")}
        />
        <!-- Sync Indicator -->
        {#if remoteLev !== undefined}
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-colors duration-300 focus:outline-none z-30"
            style="background-color: {isLeverageSynced
              ? 'var(--success-color)'
              : 'var(--warning-color)'}; margin-right: 14px;"
            data-track-id="btn-sync-leverage"
            title={isLeverageSynced
              ? $_("dashboard.generalInputs.syncedWithApi")
              : $_("dashboard.generalInputs.manualOverride", { value: remoteLev + "x" })}
            onclick={syncLeverage}
          ></button>
        {/if}
      </div>

      <!-- Fees Input Wrapper -->
      <div class="relative">
        <label
          for="fees-input"
          class="text-[10px] text-[var(--text-secondary)] absolute -top-4 left-0"
          >{$_("dashboard.generalInputs.fees")}</label
        >
        <input
          id="fees-input"
          name="fees"
          type="text"
          data-track-id="input-fees"
          use:numberInput={{ maxDecimalPlaces: 4 }}
          use:enhancedInput={{
            step: 0.01,
            min: 0,
            rightOffset: "24px",
          }}
          value={format(fees)}
          oninput={handleFeesInput}
          class="input-field w-full px-4 py-2 rounded-md transition-colors"
          class:border-green-500={isFeeSynced}
          class:text-green-400={isFeeSynced}
          placeholder={$_("dashboard.generalInputs.feesPlaceholder")}
        />
        <!-- Sync Indicator for Fees -->
        {#if targetRemoteFee !== undefined}
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-colors duration-300 focus:outline-none z-30"
            style="background-color: {isFeeSynced
              ? 'var(--success-color)'
              : 'var(--warning-color)'}; margin-right: 14px;"
            data-track-id="btn-sync-fees"
            title={isFeeSynced
              ? $_("dashboard.generalInputs.syncedWithApi")
              : $_("dashboard.generalInputs.manualOverride", { value: targetRemoteFee + "%" })}
            onclick={syncFee}
          ></button>
        {/if}
      </div>
    </div>
    <!-- Spacer -->
    <div class="mb-0"></div>
  </div>
</div>

<style>
  /* Add subtle shadow for focused inputs */
  .input-field:focus {
    box-shadow: var(--shadow-card);
    border-color: var(--accent-color);
    z-index: 10;
  }
</style>
