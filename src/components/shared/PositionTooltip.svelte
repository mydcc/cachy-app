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
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";

  interface Props {
    position: any;
  }

  let { position }: Props = $props();
  // Expected structure:
  // symbol, side, leverage, size, entryPrice, unrealizedPnl, margin, marginMode, liquidationPrice, markPrice

  function getRoi(pos: any) {
    if (!pos.margin || new Decimal(pos.margin).isZero()) return 0;
    const pnl = new Decimal(pos.unrealizedPnl || 0);
    const margin = new Decimal(pos.margin);
    return new Decimal(pnl.div(margin).mul(100)).toNumber();
  }
</script>

<div
  class="bg-[var(--bg-tertiary)] border border-[var(--border-color)] shadow-xl rounded-lg p-3 text-xs text-[var(--text-primary)] w-[320px] max-w-[90vw] pointer-events-none z-[9999]"
>
  <!-- Header -->
  <div
    class="flex justify-between items-center mb-2 border-b border-[var(--border-color)] pb-1"
  >
    <span class="font-bold text-sm flex items-center gap-1">
      {position.symbol}
      <span
        class="text-[10px] font-normal text-[var(--text-secondary)] bg-[var(--bg-primary)] px-1 rounded border border-[var(--border-color)]"
      >
        {position.side.toUpperCase()}
        {position.leverage}x
      </span>
    </span>
    <span class="font-mono text-[var(--text-secondary)] uppercase"
      >{position.marginMode}</span
    >
  </div>

  <div class="grid grid-cols-2 gap-x-4 gap-y-1">
    <!-- Main Stats -->
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">{$_("dashboard.orderHistory.details.size")}:</span>
      <span>{formatDynamicDecimal(position.size)}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">{$_("dashboard.orderHistory.details.value")}:</span>
      <span
        >{formatDynamicDecimal(
          new Decimal(position.size).mul(
            position.markPrice || position.entryPrice,
          ),
        )}</span
      >
    </div>

    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">{$_("dashboard.orderHistory.details.entry")}:</span>
      <span>{formatDynamicDecimal(position.entryPrice)}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">{$_("dashboard.orderHistory.details.mark")}:</span>
      <span>{formatDynamicDecimal(position.markPrice)}</span>
    </div>

    <div class="col-span-2 border-t border-[var(--border-color)] my-1"></div>

    <!-- PnL & Margin -->
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">{$_("dashboard.orderHistory.details.pnl")}:</span>
      <span
        class:text-[var(--success-color)]={position.unrealizedPnl > 0}
        class:text-[var(--danger-color)]={position.unrealizedPnl < 0}
      >
        {formatDynamicDecimal(position.unrealizedPnl)} USDT
      </span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">{$_("common.roe")}:</span>
      <span
        class:text-[var(--success-color)]={position.unrealizedPnl > 0}
        class:text-[var(--danger-color)]={position.unrealizedPnl < 0}
      >
        {formatDynamicDecimal(getRoi(position))}%
      </span>
    </div>

    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">{$_("dashboard.orderHistory.details.margin")}:</span>
      <span>{formatDynamicDecimal(position.margin)}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">{$_("dashboard.orderHistory.liq")}:</span>
      {#if position.liquidationPrice && new Decimal(position.liquidationPrice).gt(0)}
        <span class="text-[var(--warning-color)]"
          >{formatDynamicDecimal(position.liquidationPrice)}</span
        >
      {:else}
        <span>-</span>
      {/if}
    </div>
  </div>
</div>
