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
  import type { NormalizedOrder } from "../../types/exchange";
  import OrderDetailsTooltip from "./OrderDetailsTooltip.svelte";
  import { clampPopoverPosition } from "../../utils/tooltipPosition";

  interface Props {
    orders?: NormalizedOrder[];
    loading?: boolean;
    error?: string;
    oncancel?: (orderId: string, symbol: string) => void;
  }

  let { orders = [], loading = false, error = "", oncancel }: Props = $props();

  const instanceId = $props.id();
  const POPOVER_ID = `order-details-popover-${instanceId}`;
  const POINTER_EXIT_DELAY = 150;
  let openOrderId = $state<string | null>(null);
  let openTrigger = $state<HTMLButtonElement | null>(null);
  let popoverEl = $state<HTMLElement | null>(null);
  let pointerFocusPending = false;
  let suppressNextClick = false;
  let popoverX = $state(0);
  let popoverY = $state(0);
  let pointerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  function getOrderId(order: NormalizedOrder): string {
    return String(order.id || order.orderId);
  }

  function getTriggerId(order: NormalizedOrder): string {
    return `order-details-trigger-${encodeURIComponent(getOrderId(order))}`;
  }

  function isOrderOpen(order: NormalizedOrder): boolean {
    return openOrderId === getOrderId(order);
  }

  function isInsidePopover(node: Node | null): boolean {
    return popoverEl !== null && node !== null && popoverEl.contains(node);
  }

  function clearPointerClose() {
    if (pointerCloseTimer === null) return;
    clearTimeout(pointerCloseTimer);
    pointerCloseTimer = null;
  }

  function openOrderDetails(
    trigger: HTMLButtonElement,
    order: NormalizedOrder,
    clientX: number,
    clientY: number
  ) {
    clearPointerClose();
    const position = clampPopoverPosition(
      clientX,
      clientY,
      window.innerWidth,
      window.innerHeight
    );
    openOrderId = getOrderId(order);
    openTrigger = trigger;
    popoverX = position.x;
    popoverY = position.y;
  }

  function openAtTrigger(
    trigger: HTMLButtonElement,
    order: NormalizedOrder
  ) {
    const rect = trigger.getBoundingClientRect();
    openOrderDetails(trigger, order, rect.right, rect.bottom);
  }

  function closeOrderDetails(restoreFocus: boolean) {
    const trigger = openTrigger;
    clearPointerClose();
    // Focus is restored before the state closes: focusing an open trigger
    // re-fires handleFocus, which early-returns while this order is open.
    if (restoreFocus && trigger?.isConnected) {
      trigger.focus({ preventScroll: true });
    }
    openOrderId = null;
    openTrigger = null;
  }

  function handlePointerEnter(event: MouseEvent, order: NormalizedOrder) {
    openOrderDetails(
      event.currentTarget as HTMLButtonElement,
      order,
      event.clientX,
      event.clientY
    );
  }

  function handlePointerDown() {
    pointerFocusPending = true;
  }

  function handleClick(event: MouseEvent, order: NormalizedOrder) {
    const trigger = event.currentTarget as HTMLButtonElement;
    pointerFocusPending = false;
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (isOrderOpen(order)) {
      // Native Enter/Space activation arrives as a click; the trigger owns
      // the toggle so keyboard, pointer and touch share one code path.
      closeOrderDetails(false);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    openOrderDetails(
      trigger,
      order,
      event.clientX || rect.right,
      event.clientY || rect.bottom
    );
  }

  function handleFocus(event: FocusEvent, order: NormalizedOrder) {
    const trigger = event.currentTarget as HTMLButtonElement;
    if (pointerFocusPending) {
      pointerFocusPending = false;
      suppressNextClick = true;
    }
    if (isOrderOpen(order)) {
      openTrigger = trigger;
      return;
    }
    openAtTrigger(trigger, order);
  }

  function handleTriggerBlur(event: FocusEvent) {
    const related =
      event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (isInsidePopover(related)) return;
    if (openOrderId !== null) closeOrderDetails(false);
  }

  function handleDialogFocusOut(event: FocusEvent) {
    const related =
      event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (openTrigger?.contains(related) || isInsidePopover(related)) return;
    closeOrderDetails(false);
  }

  function schedulePointerClose() {
    clearPointerClose();
    pointerCloseTimer = setTimeout(() => {
      pointerCloseTimer = null;
      const active = document.activeElement;
      if (active === openTrigger || isInsidePopover(active)) return;
      closeOrderDetails(false);
    }, POINTER_EXIT_DELAY);
  }

  $effect(() => {
    if (openOrderId === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOrderDetails(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (openTrigger?.contains(target) || isInsidePopover(target)) return;
      closeOrderDetails(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  });

  $effect(() => {
    return () => clearPointerClose();
  });

  $effect(() => {
    const id = openOrderId;
    if (id === null) return;
    if (!orders.some((order) => getOrderId(order) === id)) {
      closeOrderDetails(false);
    }
  });

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

  function getTypeLabel(type: string) {
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

  function handleCancel(order: NormalizedOrder) {
    if (confirm($_("dashboard.confirmCancelOrder"))) {
        oncancel?.(order.id || order.orderId, order.symbol);
    }
  }
</script>

<div class="relative p-2 overflow-y-auto max-h-[500px] scrollbar-thin">
  {#if loading && orders.length > 0}
    <!-- Non-blocking refresh indicator: the list below stays visible and
         interactive while a background refetch (e.g. after cancel) is in
         flight, instead of the empty-state spinner hiding real data. -->
    <div
      class="absolute top-1 right-1 z-10"
      role="status"
      aria-label={$_("dashboard.refreshing")}
    >
      <div
        class="animate-spin rounded-full h-3 w-3 border-b-2 border-[var(--accent-color)]"
      ></div>
    </div>
  {/if}
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
      {$_("dashboard.noOpenOrders")}
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each orders as order (getOrderId(order))}
        <div
          class="bg-[var(--bg-primary)] rounded-lg p-2 border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors relative group"
        >
          <div class="grid grid-cols-3 gap-1">
            <!-- Col 1: Identity & Time (Details Disclosure) -->
            <div class="relative flex flex-col justify-center border-r border-[var(--border-color)] border-opacity-30 pr-1">
              <button
                type="button"
                id={getTriggerId(order)}
                class="flex flex-col justify-center cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] text-left"
                onpointerenter={(e) => handlePointerEnter(e, order)}
                onpointerleave={schedulePointerClose}
                onclick={(e) => handleClick(e, order)}
                onfocus={(e) => handleFocus(e, order)}
                onpointerdown={handlePointerDown}
                onblur={handleTriggerBlur}
                aria-expanded={isOrderOpen(order)}
                aria-haspopup="dialog"
                aria-controls={isOrderOpen(order) ? POPOVER_ID : undefined}
                aria-label={$_("dashboard.openOrders.viewDetails", {
                  values: { symbol: order.symbol, time: formatDate(order.time) },
                })}
              >
                <span
                  class="font-bold text-sm text-[var(--text-primary)] leading-tight underline decoration-dotted decoration-[var(--text-tertiary)] underline-offset-2"
                  >{order.symbol}</span
                >
                <span class="text-[10px] text-[var(--text-secondary)] mt-1"
                  >{formatDate(order.time)}</span
                >
              </button>

              {#if isOrderOpen(order)}
                <div
                  id={POPOVER_ID}
                  role="dialog"
                  aria-labelledby={getTriggerId(order)}
                  tabindex="-1"
                  bind:this={popoverEl}
                  class="fixed z-[10000] pointer-events-auto max-w-[calc(100vw-20px)] max-h-[calc(100vh-20px)] overflow-y-auto overscroll-contain"
                  style="top: {popoverY}px; left: {popoverX}px;"
                  onpointerenter={clearPointerClose}
                  onpointerleave={schedulePointerClose}
                  onfocusout={handleDialogFocusOut}
                >
                  <OrderDetailsTooltip order={order} />
                </div>
              {/if}
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
                  title={$_("common.orderType", { values: { type: order.type || $_("common.unknown") } })}
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
                    title={$_("dashboard.cancelOrder")}
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

<!-- Order details render as the row-local dialog above. -->
