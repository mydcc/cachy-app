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
  import { createEventDispatcher } from "svelte";
  import Tooltip from "./Tooltip.svelte";
  import { numberInput } from "../../utils/inputUtils";
  import { enhancedInput } from "../../lib/actions/inputEnhancements";
  import { _ } from "../../locales/i18n";
  import { trackClick } from "../../lib/actions";
  import { tradeState } from "../../stores/trade.svelte";
  import { app } from "../../services/app";
  import type { IndividualTpResult } from "../../stores/types";
  import { parseDecimal } from "../../utils/utils";
  import type { Decimal } from "decimal.js";

  const dispatch = createEventDispatcher();

  interface Props {
    index: number;
    price: string | null;
    percent: string | null;
    isLocked: boolean;
    canRemove?: boolean;
    tpDetail?: IndividualTpResult | undefined;
  }

  let {
    index,
    price,
    percent,
    isLocked,
    canRemove = true,
    tpDetail = undefined,
  }: Props = $props();

  function toggleLock() {
    const newLockState = !isLocked;
    const currentTargets = tradeState.targets;
    if (currentTargets[index]) {
      currentTargets[index].isLocked = newLockState;
      tradeState.update((s) => ({ ...s, targets: currentTargets }));
      app.adjustTpPercentages(newLockState ? index : null);
    }
  }

  function removeRow() {
    dispatch("remove", index);
  }

  const format = (val: string | null) =>
    val === null || val === undefined ? "" : String(val);

  function handlePriceInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    const newPrice = value === "" ? null : value;

    const currentTargets = tradeState.targets;
    if (currentTargets[index]) {
      currentTargets[index].price = newPrice;
      tradeState.update((s) => ({ ...s, targets: currentTargets }));
    }
  }

  function handlePercentInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    const newPercent = value === "" ? null : value;

    const currentTargets = tradeState.targets;
    if (currentTargets[index]) {
      currentTargets[index].percent = newPercent;
      tradeState.update((s) => ({ ...s, targets: currentTargets }));
      app.adjustTpPercentages(index);
    }
  }

  let priceStep = $derived.by(() => {
    if (!price) return 0.01;
    const p = parseDecimal(price).toNumber();
    if (p > 1000) return 0.5;
    if (p > 100) return 0.1;
    return 0.01;
  });

  function formatProfit(val: Decimal): string {
    if (!val || val.isZero()) return "0";
    const abs = val.abs();
    if (abs.lt(0.1)) return val.toFixed(4);
    if (abs.lt(1000)) return val.toFixed(2);
    return val.toNumber().toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
</script>

<div
  class="tp-row p-2.5 rounded-lg border border-[var(--border-color)] space-y-2"
  style="background-color: var(--bg-tertiary);"
>
  <!-- Line 1: Header, Status badges, PnL & R/R, and Actions -->
  <div class="flex items-center justify-between text-xs">
    <div class="flex items-center gap-1.5">
      <span class="font-bold text-[var(--text-primary)]">TP {index + 1}</span>
      {#if index === 0}
        <Tooltip text={$_("orderEntry.notes.firstTargetOnly")}>
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent-paired">
            Exchange Order TP
          </span>
        </Tooltip>
      {:else}
        <span class="text-[9px] font-medium text-[var(--text-secondary)]">
          Partial Target
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      {#if tpDetail}
        <span class="font-mono text-xs text-[var(--success-color)] font-medium">
          +${formatProfit(tpDetail.netProfit)}
        </span>
        <span
          class="font-mono text-xs font-medium {tpDetail.riskRewardRatio.gte(2)
            ? 'text-[var(--success-color)]'
            : tpDetail.riskRewardRatio.gte(1.5)
              ? 'text-[var(--warning-color)]'
              : 'text-[var(--danger-color)]'}"
        >
          R/R: {tpDetail.riskRewardRatio.toFixed(2)}
        </span>
      {/if}

      <!-- Actions -->
      <button
        class="lock-tp-btn p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded hover:bg-[var(--bg-secondary)]"
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
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z" />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-4 0H8V6c0-2.21 1.79-4 4-4s4 1.79 4 4v2z" />
          </svg>
        {/if}
      </button>

      {#if canRemove}
        <button
          class="remove-tp-btn p-1 text-[var(--danger-color)] hover:opacity-80 transition-opacity rounded hover:bg-[var(--bg-secondary)]"
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
            width="14"
            height="14"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Line 2: Price Input (large) & Percent Input (compact) -->
  <div class="flex items-center gap-2">
    <!-- TP Price Input -->
    <div class="relative flex-1 min-w-0">
      <input
        id="tp-price-{index}"
        name="tpPrice-{index}"
        type="text"
        use:numberInput={{ maxDecimalPlaces: 4 }}
        use:enhancedInput={{ step: priceStep, min: 0 }}
        value={format(price)}
        oninput={handlePriceInput}
        class="input-field w-full px-3 rounded-md text-sm font-mono"
        placeholder={$_("dashboard.takeProfitRow.pricePlaceholder")}
      />
    </div>

    <!-- TP Percent Input -->
    <div class="relative w-20 flex-shrink-0">
      <div class="relative flex items-center">
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
          }}
          value={format(percent)}
          oninput={handlePercentInput}
          class="input-field w-full px-2 rounded-md text-sm text-center font-mono pr-5"
          class:locked-input={isLocked}
          disabled={isLocked}
          placeholder="100"
        />
        <span class="absolute right-2 text-xs text-[var(--text-secondary)] pointer-events-none">%</span>
      </div>
    </div>
  </div>
</div>

<style>
  .input-field:focus {
    box-shadow: var(--shadow-card);
    border-color: var(--accent-color);
  }
</style>
