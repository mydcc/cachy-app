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
  import { onMount } from "svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { accountState } from "../../stores/account.svelte";
  import { tradeState } from "../../stores/trade.svelte";
  import { _ } from "../../locales/i18n";
  import { formatDynamicDecimal } from "../../utils/utils";
  import TpSlEditModal from "./TpSlEditModal.svelte";
  import { toastService } from "../../services/toastService.svelte";

  interface Props {
    isActive?: boolean;
  }

  let { isActive = false }: Props = $props();

  let view: "pending" | "history" = $state("pending");
  let orders: any[] = $state([]);
  let loading = $state(false);
  let error = $state("");

  // Modal State
  let showEditModal = $state(false);
  let editingOrder: any = $state(null);

  async function fetchOrders() {
    if (!isActive) return;

    const provider = settingsState.apiProvider || "bitunix";
    const keys = settingsState.apiKeys[provider];

    if (!keys?.key || !keys?.secret) {
      error = $_("dashboard.alerts.noApiKeys");
      return;
    }

    loading = true;
    error = "";
    try {
      if (provider === "bitunix") {
        // Bitunix default behavior
        const symbolsToFetch = new Set<string>();
        if (tradeState.symbol) symbolsToFetch.add(tradeState.symbol);
        accountState.positions.forEach((p) => symbolsToFetch.add(p.symbol));

        const fetchList =
          symbolsToFetch.size > 0 ? Array.from(symbolsToFetch) : [undefined];
        const results: any[] = [];

        // Rate limit handling: Batch requests (max 5 concurrent)
        const BATCH_SIZE = 5;
        for (let i = 0; i < fetchList.length; i += BATCH_SIZE) {
          const batch = fetchList.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(async (sym) => {
              try {
                const params: any = {};
                if (sym) params.symbol = sym;
                const response = await fetch("/api/tpsl", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    exchange: provider,
                    apiKey: keys.key,
                    apiSecret: keys.secret,
                    action: view,
                    params,
                  }),
                });
                const data = await response.json();
                if (data.error) {
                  // Suppress specific symbol errors, just warn
                  if (!data.error.includes("code: 2")) {
                    console.warn(`TP/SL fetch warning for ${sym}:`, data.error);
                  }
                  return [];
                }
                return Array.isArray(data) ? data : data.rows || [];
              } catch (e) {
                console.warn(`TP/SL network error for ${sym}:`, e);
                return [];
              }
            }),
          );
          results.push(...batchResults.flat());
        }

        // Deduplicate
        const uniqueOrders = new Map();
        results.forEach((o) => {
          const id = o.id || o.orderId || o.planId;
          if (id) uniqueOrders.set(id, o);
        });
        orders = Array.from(uniqueOrders.values());
      } else {
        // Standard fetch for other providers (e.g. Binance)
        const response = await fetch("/api/tpsl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exchange: provider,
            apiKey: keys.key,
            apiSecret: keys.secret,
            action: view,
          }),
        });
        const data = await response.json();
        if (data.error) error = data.error;
        else {
          const list = Array.isArray(data) ? data : data.rows || [];
          orders = list;
        }
      }

      // Sort by time (newest first)
      orders.sort(
        (a, b) =>
          (b.ctime || b.createTime || 0) - (a.ctime || a.createTime || 0),
      );
    } catch (e) {
      console.error("TP/SL Global Error:", e);
      error = $_("apiErrors.failedToLoadOrders");
    } finally {
      loading = false;
    }
  }

  async function handleCancel(order: any) {
    if (!confirm($_("dashboard.alerts.confirmCancel"))) return;

    const provider = settingsState.apiProvider || "bitunix";
    const keys = settingsState.apiKeys[provider];

    try {
      const response = await fetch("/api/tpsl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: provider,
          apiKey: keys.key,
          apiSecret: keys.secret,
          action: "cancel",
          params: {
            orderId: order.orderId || order.id,
            symbol: order.symbol,
            planType: order.planType,
          },
        }),
      });
      const res = await response.json();
      if (res.error) toastService.error(res.error);
      else {
        toastService.success($_("dashboard.alerts.orderCancelled"));
        fetchOrders(); // Refresh
      }
    } catch (e) {
      toastService.error($_("dashboard.alerts.cancelFailed"));
    }
  }

  function openEdit(order: any) {
    editingOrder = order;
    showEditModal = true;
  }

  function handleEditSuccess() {
    showEditModal = false;
    editingOrder = null;
    fetchOrders();
  }

  $effect(() => {
    if (isActive) fetchOrders();
  });
  $effect(() => {
    if (view) fetchOrders();
  });

  function formatDate(ts: number) {
    if (!ts) return "-";
    const d = new Date(Number(ts));
    return `${d.getDate()}.${
      d.getMonth() + 1
    } ${d.getHours()}:${d.getMinutes()}`;
  }

  // Helper to determine type label
  function getTypeLabel(o: any) {
    if (o.planType === "PROFIT") return "TP";
    if (o.planType === "LOSS") return "SL";
    return "Plan";
  }
</script>

<div class="flex flex-col h-full bg-[var(--bg-secondary)]">
  <!-- Sub-Tabs for Pending/History -->
  <div
    class="flex border-b border-[var(--border-color)] bg-[var(--bg-primary)] text-[10px]"
  >
    <button
      class="flex-1 py-1.5 font-bold transition-colors"
      class:text-[var(--accent-color)]={view === "pending"}
      class:bg-[var(--bg-secondary)]={view === "pending"}
      onclick={() => (view = "pending")}
    >
      Pending
    </button>
    <button
      class="flex-1 py-1.5 font-bold transition-colors"
      class:text-[var(--accent-color)]={view === "history"}
      class:bg-[var(--bg-secondary)]={view === "history"}
      onclick={() => (view = "history")}
    >
      History
    </button>
  </div>

  <!-- List -->
  <div class="flex-1 overflow-y-auto p-2 scrollbar-thin max-h-[500px]">
    {#if loading}
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
        {$_("dashboard.noTpSlOrders", { values: { view: view } })}
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        {#each orders as order}
          <div
            class="bg-[var(--bg-primary)] rounded border border-[var(--border-color)] p-2 relative group"
          >
            <div class="flex justify-between items-start mb-1">
              <span class="font-bold text-xs text-[var(--text-primary)]"
                >{order.symbol}</span
              >
              <span
                class="text-[10px] px-1 rounded font-bold"
                class:text-green-400={getTypeLabel(order) === "TP"}
                class:text-red-400={getTypeLabel(order) === "SL"}
              >
                {getTypeLabel(order)}
              </span>
            </div>

            <div
              class="grid grid-cols-2 gap-x-2 text-[11px] text-[var(--text-secondary)] mb-1"
            >
              <div>
                Trigger: <span class="text-[var(--text-primary)]"
                  >{formatDynamicDecimal(order.triggerPrice)}</span
                >
              </div>
              <div class="text-right">
                Amt: <span class="text-[var(--text-primary)]"
                  >{formatDynamicDecimal(order.qty || order.amount)}</span
                >
              </div>
            </div>

            <div
              class="flex justify-between items-center mt-1 pt-1 border-t border-[var(--border-color)] border-opacity-30"
            >
              <span class="text-[9px] text-[var(--text-tertiary)]"
                >{formatDate(order.ctime || order.createTime)}</span
              >

              {#if view === "pending"}
                <div class="flex gap-2">
                  <button
                    class="text-[var(--text-secondary)] hover:text-[var(--accent-color)]"
                    title="Edit"
                    onclick={() => openEdit(order)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                  <button
                    class="text-[var(--text-secondary)] hover:text-[var(--danger-color)]"
                    title="Cancel"
                    onclick={() => handleCancel(order)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              {:else}
                <span
                  class="text-[9px] uppercase"
                  class:text-green-500={order.status === "FILLED"}
                  class:text-red-500={order.status === "CANCELED"}
                >
                  {order.status}
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if showEditModal}
  <TpSlEditModal
    order={editingOrder}
    onclose={() => (showEditModal = false)}
    onsuccess={handleEditSuccess}
  />
{/if}
