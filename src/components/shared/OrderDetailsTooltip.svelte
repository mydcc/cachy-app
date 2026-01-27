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

  import { icons } from "../../lib/constants";

  interface Props {
    order: any;
  }

  let { order }: Props = $props();

  let isDetailsOpen = $state(false);

  function toggleDetails() {
    isDetailsOpen = !isDetailsOpen;
  }

  function formatDate(ts: any) {
    if (!ts) return "-";
    return new Date(Number(ts)).toLocaleString();
  }

  function getOrderType(order: any) {
    // Prefer 'orderType' or 'type'
    // Handle numeric codes: 1=LIMIT, 2=MARKET, 3=STOP_LIMIT, 4=STOP_MARKET, 5=TRAILING_STOP_MARKET
    const rawType = order.orderType || order.type;
    const t = String(rawType || "").toUpperCase();

    if (["LIMIT", "1"].includes(t)) return "LIMIT";
    if (["MARKET", "2"].includes(t)) return "MARKET";
    if (["STOP", "STOP_LIMIT", "3"].includes(t)) return "STOP LIMIT";
    if (["STOP_MARKET", "4"].includes(t)) return "STOP MARKET";
    if (["TRAILING_STOP_MARKET", "5"].includes(t)) return "TRAILING";
    if (t === "LIQUIDATION") return "LIQ.";
    if (!t || t === "UNDEFINED" || t === "NULL") return "";

    return t;
  }
</script>

<div
  class="bg-[var(--bg-tertiary)] border border-[var(--border-color)] shadow-xl rounded-lg p-3 text-xs text-[var(--text-primary)] w-[320px] max-w-[90vw] pointer-events-auto"
>
  <div
    class="flex justify-between items-center mb-2 border-b border-[var(--border-color)] pb-1"
  >
    <span class="font-bold text-sm">{order.symbol}</span>
    <span class="font-mono text-[var(--text-secondary)] uppercase"
      >{order.side} {getOrderType(order)}</span
    >
  </div>

  <div class="grid grid-cols-2 gap-x-4 gap-y-1">
    <!-- Settings -->
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Leverage:</span>
      <span>{order.leverage}x</span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Margin:</span>
      <span class="capitalize">{order.marginMode}</span>
    </div>
    {#if order.positionMode}
      <div class="flex justify-between col-span-2">
        <span class="text-[var(--text-secondary)]">Mode:</span>
        <span class="capitalize">{order.positionMode}</span>
      </div>
    {/if}

    <!-- Trade Stats -->
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Price:</span>
      <span>{formatDynamicDecimal(order.price)}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Avg Price:</span>
      <span>{formatDynamicDecimal(order.avgPrice || order.averagePrice)}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Qty:</span>
      <span>{formatDynamicDecimal(order.qty)}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Filled:</span>
      <span>{formatDynamicDecimal(order.tradeQty || order.filled)}</span>
    </div>

    <!-- Financials -->
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Fee:</span>
      <span>{formatDynamicDecimal(order.fee)}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-[var(--text-secondary)]">Realized PnL:</span>
      <span
        class:text-[var(--success-color)]={Number(order.realizedPNL) > 0}
        class:text-[var(--danger-color)]={Number(order.realizedPNL) < 0}
      >
        {formatDynamicDecimal(order.realizedPNL)}
      </span>
    </div>

    <!-- TP/SL -->
    {#if (order.tpPrice && Number(order.tpPrice) > 0) || (order.slPrice && Number(order.slPrice) > 0)}
      <div
        class="col-span-2 mt-1 border-t border-[var(--border-color)] pt-1 font-bold text-[var(--text-secondary)]"
      >
        TP / SL
      </div>
      {#if order.tpPrice && Number(order.tpPrice) > 0}
        <div class="col-span-2 flex justify-between">
          <span class="text-[var(--success-color)]">TP:</span>
          <span
            >{formatDynamicDecimal(order.tpPrice)} ({order.tpStopType}) -> {order.tpOrderType}</span
          >
        </div>
      {/if}
      {#if order.slPrice && Number(order.slPrice) > 0}
        <div class="col-span-2 flex justify-between">
          <span class="text-[var(--danger-color)]">SL:</span>
          <span
            >{formatDynamicDecimal(order.slPrice)} ({order.slStopType}) -> {order.slOrderType}</span
          >
        </div>
      {/if}
    {/if}

    <!-- Accordion Toggle -->
    <div
      class="col-span-2 mt-1 border-t border-[var(--border-color)] pt-1 cursor-pointer select-none flex items-center justify-between text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      onclick={toggleDetails}
      onkeydown={(e) => e.key === "Enter" && toggleDetails()}
      role="button"
      tabindex="0"
    >
      <span class="text-[10px] font-bold">Details...</span>
      <span
        class="transform transition-transform duration-200"
        class:rotate-180={isDetailsOpen}
      >
        {@html icons.chevronDown}
      </span>
    </div>

    <!-- Accordion Content -->
    {#if isDetailsOpen}
      <div
        class="col-span-2 flex flex-col gap-1 text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-primary)] p-2 rounded mt-1"
      >
        <div class="flex justify-between">
          <span>Created:</span>
          <span>{formatDate(order.ctime)}</span>
        </div>
        {#if order.mtime && order.mtime !== order.ctime}
          <div class="flex justify-between">
            <span>Updated:</span>
            <span>{formatDate(order.mtime)}</span>
          </div>
        {/if}
        <div class="flex justify-between gap-2">
          <span>Order ID:</span>
          <span class="font-mono truncate">{order.orderId}</span>
        </div>
        {#if order.clientId}
          <div class="flex justify-between gap-2">
            <span>Client ID:</span>
            <span class="font-mono truncate">{order.clientId}</span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Footer (Status) -->
    <div
      class="col-span-2 flex justify-between items-center mt-2 border-t border-[var(--border-color)] pt-2"
    >
      <span
        class="font-bold px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[10px] uppercase border border-[var(--border-color)]"
        >{order.status}</span
      >
      {#if order.reduceOnly}
        <span class="text-[10px] text-[var(--warning-color)] font-bold"
          >Reduce Only</span
        >
      {/if}
    </div>
  </div>
</div>
