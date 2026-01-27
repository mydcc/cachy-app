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
  import { formatDynamicDecimal } from "../../utils/utils";
  import { _ } from "../../locales/i18n";
  import { Decimal } from "decimal.js";

  interface Props {
    account: any;
  }

  let { account }: Props = $props();

  let equity = $derived(
    new Decimal(account.available || 0)
      .plus(new Decimal(account.margin || 0))
      .plus(new Decimal(account.frozen || 0))
      .plus(new Decimal(account.totalUnrealizedPnL || 0))
  );

  // Prevent division by zero
  let marginLevel = $derived(
    equity.gt(0)
      ? new Decimal(account.margin || 0).div(equity).times(100).toNumber()
      : 0
  );

  function getHealthColor(level: number) {
    if (level < 50) return "var(--success-color)";
    if (level < 80) return "var(--warning-color)";
    return "var(--danger-color)";
  }

  let healthColor = $derived(getHealthColor(marginLevel));
  let barWidth = $derived(Math.min(Math.max(marginLevel, 0), 100));
</script>

<div
  class="bg-[var(--bg-tertiary)] border border-[var(--border-color)] shadow-xl rounded-lg p-3 text-xs text-[var(--text-primary)] w-[260px] pointer-events-auto z-50"
>
  <!-- Header: Equity -->
  <div class="flex flex-col mb-2 border-b border-[var(--border-color)] pb-2">
    <div class="flex justify-between items-center mb-1">
      <span class="font-bold text-sm"
        >{$_("dashboard.account.totalEquity")}</span
      >
      <span class="font-bold text-sm"
        >{formatDynamicDecimal(equity, 2)} {account.marginCoin || "USDT"}</span
      >
    </div>

    <!-- Health Bar -->
    <div
      class="w-full h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden mt-1 relative group"
    >
      <div
        class="h-full transition-all duration-300 rounded-full"
        style="width: {barWidth}%; background-color: {healthColor};"
></div>
    </div>
    <div
      class="flex justify-between mt-1 text-[10px] text-[var(--text-secondary)]"
    >
      <span>{$_("dashboard.account.marginLevel")}</span>
      <span style="color: {healthColor}">{(marginLevel ?? 0).toFixed(1)}%</span>
    </div>
  </div>

  <!-- Details Grid -->
  <div class="grid grid-cols-1 gap-1">
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]"
        >{$_("dashboard.account.walletBalance")}:</span
      >
      <span
        >{formatDynamicDecimal(
          new Decimal(account.available || 0)
            .plus(new Decimal(account.margin || 0))
            .plus(new Decimal(account.frozen || 0)),
          2
        )}</span
      >
    </div>

    <div
      class="pl-2 border-l-2 border-[var(--border-primary)] ml-1 flex flex-col gap-0.5 my-1"
    >
      <div class="flex justify-between">
        <span class="text-[var(--text-secondary)] text-[10px]"
          >{$_("dashboard.account.transferable")}:</span
        >
        <span class="text-[10px]">{formatDynamicDecimal(account.transfer)}</span
        >
      </div>
      <div class="flex justify-between">
        <span class="text-[var(--text-secondary)] text-[10px]"
          >{$_("dashboard.account.bonus")}:</span
        >
        <span class="text-[10px]">{formatDynamicDecimal(account.bonus)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-[var(--text-secondary)] text-[10px]"
          >{$_("dashboard.account.frozen")}:</span
        >
        <span class="text-[10px]">{formatDynamicDecimal(account.frozen)}</span>
      </div>
    </div>

    <div
      class="flex justify-between pt-1 border-t border-[var(--border-color)]"
    >
      <span class="text-[var(--text-secondary)]"
        >{$_("dashboard.account.mode")}:</span
      >
      <span class="capitalize">{account.positionMode || "-"}</span>
    </div>

    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]"
        >{$_("dashboard.account.crossPnl")}:</span
      >
      <span
        class:text-[var(--success-color)]={new Decimal(account.crossUnrealizedPNL || 0).gt(0)}
        class:text-[var(--danger-color)]={new Decimal(account.crossUnrealizedPNL || 0).lt(0)}
      >
        {formatDynamicDecimal(account.crossUnrealizedPNL)}
      </span>
    </div>
    {#if !new Decimal(account.isolationUnrealizedPNL || 0).isZero()}
      <div class="flex justify-between">
        <span class="text-[var(--text-secondary)]"
          >{$_("dashboard.account.isoPnl")}:</span
        >
        <span
          class:text-[var(--success-color)]={new Decimal(account.isolationUnrealizedPNL || 0).gt(0)}
          class:text-[var(--danger-color)]={new Decimal(account.isolationUnrealizedPNL || 0).lt(0)}
        >
          {formatDynamicDecimal(account.isolationUnrealizedPNL)}
        </span>
      </div>
    {/if}
  </div>
</div>
