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
  // import OrderDetailsTooltip from "./OrderDetailsTooltip.svelte"; // Global handled

  interface Props {
    orders?: any[];
    loading?: boolean;
    error?: string;
    oncancel?: (orderId: string, symbol: string) => void;
  }

  let { orders = [], loading = false, error = "", oncancel }: Props = $props();

  // Removed local tooltip state

  function handleMouseEnter(event: MouseEvent, order: any) {
    const coords = getTooltipPosition(event);
    uiState.showTooltip("order", order, coords.x, coords.y);
  }

  function handleMouseLeave() {
    uiState.hideTooltip();
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
    if (!timestamp) return "-";
    const date = new Date(Number(timestamp));
    if (isNaN(date.getTime())) return "-";

    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${day}.${month} ${hours}:${minutes}`;
  }

  function getTypeLabel(type: any) {
    const t = String(type || "").toUpperCase();
    if (["LIMIT", "1"].includes(t)) return "Limit";
    if (["MARKET", "2"].includes(t)) return "Market";
    if (["STOP", "STOP_LIMIT", "3"].includes(t)) return "Stop Limit";
    if (["STOP_MARKET", "4"].includes(t)) return "Stop Market";
    if (["TRAILING_STOP_MARKET", "5"].includes(t)) return "Trailing";
    if (t === "LIQUIDATION") return "Liq.";
    if (!t || t === "UNDEFINED" || t === "NULL") return "";
    return t.length > 6 ? t.substring(0, 6) + "." : t;
  }

  function handleCancel(order: any) {
    if (confirm($_("dashboard.confirmCancelOrder") || "Cancel this order?")) {
        oncancel?.(order.id || order.orderId, order.symbol);
    }
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
      {error}
    </div>
  {:else if orders.length === 0}
    <div class="text-xs text-[var(--text-secondary)] text-center p-4">
      {$_("dashboard.noOpenOrders") || "No open orders."}
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each orders as order}
        <div
          class="bg-[var(--bg-primary)] rounded-lg p-2 border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors relative group"
        >
          <div class="grid grid-cols-3 gap-1">
            <!-- Col 1: Identity & Time (Tooltip Trigger) -->
            <div
              class="flex flex-col justify-center border-r border-[var(--border-color)] border-opacity-30 pr-1 cursor-help relative"
              onmouseenter={(e) => handleMouseEnter(e, order)}
              onmouseleave={handleMouseLeave}
              role="tooltip"
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
              <div class="flex items-center gap-1 mb-1">
                <span
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tight flex items-center gap-1"
                  class:bg-green-900={order.side === "BUY"}
                  class:text-green-300={order.side === "BUY"}
                  class:bg-red-900={order.side === "SELL"}
                  class:text-red-300={order.side === "SELL"}
                  title={`Type: ${order.type || "Unknown"}`}
                >
                  {getTypeLabel(order.type)}
                  {order.side === "BUY" ? "Buy" : "Sell"}
                </span>
              </div>

              <div class="flex flex-col items-center">
                <span
                  class="text-[11px] text-[var(--text-primary)] font-mono font-medium"
                >
                  {formatDynamicDecimal(order.amount)}
                </span>
                {#if Number(order.filled) > 0}
                  <span class="text-[9px] text-[var(--text-secondary)]">
                    ({formatDynamicDecimal(order.filled)})
                  </span>
                {/if}
              </div>
            </div>

            <!-- Col 3: Price & Status & Action -->
            <div class="flex flex-col items-end justify-center pl-1 relative">
              <span class="text-xs font-mono text-[var(--text-primary)] mb-0.5">
                {formatDynamicDecimal(order.price)}
              </span>

              <div class="flex items-center gap-2">
                 <span
                    class="text-[9px] text-[var(--text-tertiary)] uppercase opacity-70 whitespace-nowrap mt-0.5"
                  >
                    {order.status}
                  </span>

                  <!-- Cancel Button (X) -->
                  <button
                    class="w-5 h-5 flex items-center justify-center bg-[var(--danger-color)] bg-opacity-10 text-[var(--danger-color)] rounded hover:bg-opacity-20 transition-colors"
                    onclick={() => handleCancel(order)}
                    title="Cancel Order"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Global Tooltip handled in +layout.svelte -->
