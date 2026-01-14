<script lang="ts">
  import { icons } from "../../lib/constants";
  import { createEventDispatcher } from "svelte";
  import { numberInput } from "../../utils/inputUtils";
  import { enhancedInput } from "../../lib/actions/inputEnhancements";
  import { _ } from "../../locales/i18n";
  import { trackClick } from "../../lib/actions";
  import { updateTradeStore, tradeStore } from "../../stores/tradeStore";
  import { app } from "../../services/app";
  import { get } from "svelte/store";
  import type { IndividualTpResult } from "../../stores/types";

  const dispatch = createEventDispatcher();

  interface Props {
    index: number;
    price: number | null;
    percent: number | null;
    isLocked: boolean;
    tpDetail?: IndividualTpResult | undefined;
  }

  let {
    index,
    price,
    percent,
    isLocked,
    tpDetail = undefined
  }: Props = $props();

  function toggleLock() {
    const newLockState = !isLocked;
    const currentTargets = get(tradeStore).targets;
    if (currentTargets[index]) {
      currentTargets[index].isLocked = newLockState;
      updateTradeStore((s) => ({ ...s, targets: currentTargets }));
      app.adjustTpPercentages(index);
    }
  }

  function removeRow() {
    dispatch("remove", index);
  }

  const format = (val: number | null) =>
    val === null || val === undefined ? "" : String(val);

  function handlePriceInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    const newPrice = value === "" ? null : parseFloat(value);

    const currentTargets = get(tradeStore).targets;
    if (currentTargets[index]) {
      currentTargets[index].price = newPrice;
      updateTradeStore((s) => ({ ...s, targets: currentTargets }));
    }
  }

  function handlePercentInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    const newPercent = value === "" ? null : parseFloat(value);

    const currentTargets = get(tradeStore).targets;
    if (currentTargets[index]) {
      currentTargets[index].percent = newPercent;
      updateTradeStore((s) => ({ ...s, targets: currentTargets }));
      app.adjustTpPercentages(index);
    }
  }

  // Determine dynamic step
  let priceStep =
    $derived(price && price > 1000 ? 0.5 : price && price > 100 ? 0.1 : 0.01);
</script>

<div
  class="tp-row p-2 rounded-lg relative"
  style="background-color: var(--bg-tertiary);"
>
  <div class="flex justify-between items-center mb-1">
    <label
      class="tp-label text-xs text-[var(--text-secondary)] font-bold"
      for="tp-price-{index}">TP {index + 1}</label
    >

    <div class="flex items-center gap-2">
      {#if tpDetail}
        <div
          class="text-xs text-[var(--text-secondary)] text-right stats-container"
        >
          <span class="mr-2"
            >{$_("dashboard.takeProfitRow.winLabel")}
            <span class="text-[var(--success-color)]"
              >+${tpDetail.netProfit.toFixed(2)}</span
            ></span
          >
          <span
            >{$_("dashboard.takeProfitRow.rrLabel")}
            <span
              class={tpDetail.riskRewardRatio.gte(2)
                ? "text-[var(--success-color)]"
                : tpDetail.riskRewardRatio.gte(1.5)
                ? "text-[var(--warning-color)]"
                : "text-[var(--danger-color)]"}
              >{tpDetail.riskRewardRatio.toFixed(2)}</span
            ></span
          >
        </div>
      {/if}

      <button
        class="lock-tp-btn btn-lock-icon p-1"
        title={$_("dashboard.takeProfitRow.lockButtonTitle")}
        tabindex="-1"
        onclick={toggleLock}
        use:trackClick={{
          category: "TakeProfitRow",
          action: "Click",
          name: "ToggleLock",
        }}
      >
        {#if isLocked}
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

  <div class="flex items-center gap-2">
    <!-- TP Price Input -->
    <div class="relative flex-grow">
      <input
        id="tp-price-{index}"
        name="tpPrice-{index}"
        type="text"
        use:numberInput={{ maxDecimalPlaces: 4 }}
        use:enhancedInput={{ step: priceStep, min: 0, rightOffset: "2px" }}
        value={format(price)}
        oninput={handlePriceInput}
        class="tp-price input-field w-full px-4 py-2 rounded-md"
        placeholder={$_("dashboard.takeProfitRow.pricePlaceholder")}
      />
    </div>

    <!-- TP Percent Input -->
    <div class="relative flex-grow">
      <input
        id="tp-percent-{index}"
        name="tpPercent-{index}"
        type="text"
        use:numberInput={{
          noDecimals: true,
          isPercentage: true,
          minValue: 0,
          maxValue: 100,
        }}
        use:enhancedInput={{
          step: 1,
          min: 0,
          max: 100,
          noDecimals: true,
          rightOffset: "2px",
        }}
        value={format(percent)}
        oninput={handlePercentInput}
        class="tp-percent input-field w-full px-4 py-2 rounded-md"
        class:locked-input={isLocked}
        disabled={isLocked}
        placeholder="%"
      />
    </div>

    <button
      class="remove-tp-btn text-[var(--danger-color)] hover:opacity-80 p-1 flex-shrink-0"
      title={$_("dashboard.takeProfitRow.removeButtonTitle")}
      tabindex="-1"
      onclick={removeRow}
      use:trackClick={{
        category: "TakeProfitRow",
        action: "Click",
        name: "RemoveRow",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        fill="currentColor"
        class="pointer-events-none"
        viewBox="0 0 16 16"
        ><path
          d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"
        /><path
          fill-rule="evenodd"
          d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
        /></svg
      >
    </button>
  </div>
</div>

<style>
  .input-field:focus {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border-color: var(--accent-color);
    z-index: 10;
  }

  /* Ensure disabled input still looks distinct */
  .locked-input {
    background-color: var(--bg-primary);
    color: var(--text-secondary);
    cursor: not-allowed;
  }

  .stats-container {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    width: 150px; /* Fixed width to prevent jitter */
    white-space: nowrap;
  }
</style>
