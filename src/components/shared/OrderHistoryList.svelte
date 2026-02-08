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
  import { _ } from "../../locales/i18n";
  import { formatDynamicDecimal } from "../../utils/utils";
  import { uiState } from "../../stores/ui.svelte";
  import { OrderType } from "../../types/orderTypes";
  import Decimal from "decimal.js";

  interface Props {
    orders?: any[];
    loading?: boolean;
    error?: string;
  }

  let { orders = [], loading = false, error = "" }: Props = $props();

  // Removed local tooltip state in favor of uiStore

  function handleMouseEnter(event: MouseEvent, order: any) {
    const pos = getTooltipPosition(event);
    uiState.showTooltip("order", order, pos.x, pos.y);
  }

  function handleMouseLeave() {
    uiState.hideTooltip();
  }

  function handleKeyDown(event: KeyboardEvent, order: any) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // Calculate generic center position as we don't have mouse coordinates
      const x = window.innerWidth / 2 - 160;
      const y = window.innerHeight / 2 - 200;
      uiState.showTooltip("order", order, x, y);
    } else if (event.key === 'Escape') {
      uiState.hideTooltip();
    }
  }

  function getTooltipPosition(event: MouseEvent) {
    const tooltipWidth = 320;
    const tooltipHeight = 400;
    const padding = 10;
    let x = event.clientX + padding;
    let y = event.clientY + padding;

    if (x + tooltipWidth > window.innerWidth)
      x = event.clientX - tooltipWidth - padding;
    if (y + tooltipHeight > window.innerHeight)
      y = event.clientY - tooltipHeight - padding;

    return { x: Math.max(padding, x), y: Math.max(padding, y) };
  }

  function formatDate(timestamp: number) {
    if (!timestamp) return $_("dashboard.orderHistory.noDate");
    const date = new Date(Number(timestamp));
    if (isNaN(date.getTime())) return $_("dashboard.orderHistory.noDate");

    // Format: DD.MM HH:mm
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${day}.${month} ${hours}:${minutes}`;
  }

  // Helper to get Fee String
  function getFeeDisplay(order: any) {
    if (order.fee === undefined || order.fee === null) return $_("dashboard.orderHistory.noFee");
    const roleMap: Record<string, string> = {
        MAKER: ` (${$_("dashboard.orderHistory.maker")})`,
        TAKER: ` (${$_("dashboard.orderHistory.taker")})`
    };
    const role = roleMap[order.role] || "";
    return `${formatDynamicDecimal(order.fee)}${role}`;
  }

  function getTypeLabel(type: any) {
    const t = String(type || "").toUpperCase();
    if ([OrderType.LIMIT, "1"].includes(t)) return $_("dashboard.orderHistory.type.limit");
    if ([OrderType.MARKET, "2"].includes(t)) return $_("dashboard.orderHistory.type.market");
    if ([OrderType.STOP_LIMIT, "STOP", "3"].includes(t)) return $_("dashboard.orderHistory.type.stopLimit");
    if ([OrderType.STOP_MARKET, "4"].includes(t)) return $_("dashboard.orderHistory.type.stopMarket");
    if ([OrderType.TRAILING_STOP_MARKET, "5"].includes(t)) return $_("dashboard.orderHistory.type.trailing");
    if (t === OrderType.LIQUIDATION) return $_("dashboard.orderHistory.liq");
    if (!t || t === "UNDEFINED" || t === "NULL") return ""; // Empty for unknown
    // Safe fallback using i18n
    return $_("dashboard.orderHistory.unknownRaw", { values: { type: t.length > 6 ? t.substring(0, 6) + "." : t } });
  }

  function getErrorMessage(err: string) {
    if (!err) return "";
    // Try to translate if it looks like a key
    if ((err.includes(".") || err.startsWith("bitunixErrors")) && typeof $_ === "function") {
        const translated = $_(err as any);
        if (translated && translated !== err) return translated;
    }
    // Fallback: Show raw error
    return err;
  }
</script>

<div class="relative p-2 overflow-y-auto max-h-[500px] scrollbar-thin">
  {#if loading && orders.length === 0}
    <div class="flex justify-center p-4">
      <div
        class="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--accent-color)]"
      ></div>
    </div>
  {:else if error}
    <div class="text-xs text-[var(--danger-color)] p-2 text-center">
      {getErrorMessage(error)}
    </div>
  {:else if orders.length === 0}
    <div class="text-xs text-[var(--text-secondary)] text-center p-4">
      {$_("dashboard.noHistory")}
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each orders as order}
        <div
          class="bg-[var(--bg-primary)] rounded-lg p-2 border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors"
        >
          <div class="grid grid-cols-3 gap-1">
            <!-- Col 1: Identity & Time -->
            <div
              class="flex flex-col justify-center border-r border-[var(--border-color)] border-opacity-30 pr-1 cursor-help relative focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] rounded"
              onmouseenter={(e) => handleMouseEnter(e, order)}
              onmouseleave={handleMouseLeave}
              onkeydown={(e) => handleKeyDown(e, order)}
              tabindex="0"
              role="button"
              aria-label={$_("dashboard.orderHistory.viewDetails")}
            >
              <span
                class="font-bold text-sm text-[var(--text-primary)] leading-tight underline decoration-dotted decoration-[var(--text-tertiary)] underline-offset-2"
                >{order.symbol}</span
              >
              <span class="text-[10px] text-[var(--text-secondary)] mt-1"
                >{formatDate(order.time)}</span
              >
            </div>

            <!-- Col 2: Execution Details -->
            <div
              class="flex flex-col items-center justify-center border-r border-[var(--border-color)] border-opacity-30 px-1"
            >
              <!-- Unified Badge -->
              <div class="flex items-center gap-1 mb-1">
                <span
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tight flex items-center gap-1"
                  class:bg-green-900={order.side === "BUY"}
                  class:text-green-300={order.side === "BUY"}
                  class:bg-red-900={order.side === "SELL"}
                  class:text-red-300={order.side === "SELL"}
                  title={`Type: ${order.type || "-"}`}
                >
                  {getTypeLabel(order.type)}
                  {order.side === "BUY" ? $_("dashboard.orderHistory.side.buy") : $_("dashboard.orderHistory.side.sell")}
                </span>
              </div>

              <span
                class="text-[11px] text-[var(--text-primary)] font-mono font-medium"
              >
                {formatDynamicDecimal(order.filled)}
              </span>
            </div>

            <!-- Col 3: Financials -->
            <div class="flex flex-col items-end justify-center pl-1">
              <!-- Entry/Exit Price: Prefer AvgPrice (Execution) over Price (Limit) if available -->
              <span class="text-xs font-mono text-[var(--text-primary)] mb-0.5">
                {formatDynamicDecimal(
                  (new Decimal(order.avgPrice || 0)).gt(0)
                    ? order.avgPrice
                    : order.price,
                )}
              </span>

              <!-- PnL -->
              {#if (order.realizedPNL || order.realizedPnL) && !(new Decimal(order.realizedPNL || order.realizedPnL || 0).isZero())}
                <span
                  class="text-[10px] font-bold"
                  class:text-[var(--success-color)]={new Decimal(order.realizedPNL || order.realizedPnL || 0).gt(0)}
                  class:text-[var(--danger-color)]={new Decimal(order.realizedPNL || order.realizedPnL || 0).lt(0)}
                >
                  {new Decimal(order.realizedPNL || order.realizedPnL || 0).gt(0)
                    ? "+"
                    : ""}{formatDynamicDecimal(order.realizedPNL || order.realizedPnL)}
                </span>
              {/if}

              <!-- Fee -->
              <span
                class="text-[9px] text-[var(--text-tertiary)] opacity-70 whitespace-nowrap mt-0.5"
              >
                {$_("dashboard.orderHistory.fee")}: {getFeeDisplay(order)}
              </span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Global Tooltip handled in +layout.svelte -->
