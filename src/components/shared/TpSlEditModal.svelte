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
  import { tradeService } from "../../services/tradeService";
  import { _ } from "../../locales/i18n";
  import ModalFrame from "./ModalFrame.svelte";

  interface Props {
    order: any;
    onclose?: () => void;
    onsuccess?: () => void;
  }

  let { order, onclose, onsuccess }: Props = $props();

  let triggerPrice = $state("");
  let amount = $state("");

  // Initialize from props
  $effect(() => {
    if (order) {
      triggerPrice = order.triggerPrice || "";
      amount = order.qty || order.amount || "";
    }
  });
  let loading = $state(false);
  let error = $state("");

  async function handleSave() {
    if (!triggerPrice) {
      error = $_("bitunixErrors.INVALID_TRIGGER") || "Trigger price is required";
      return;
    }

    loading = true;
    error = "";

    try {
      await tradeService.modifyTpSlOrder({
        orderId: order.orderId || order.id || order.planId,
        symbol: order.symbol,
        planType: order.planType,
        triggerPrice: String(triggerPrice),
        qty: amount ? String(amount) : undefined,
      });
      onsuccess?.();
    } catch (e: any) {
      error = e.message || $_("errors.modifyFailed");
    } finally {
      loading = false;
    }
  }
</script>

<ModalFrame
  title={order?.planType === "PROFIT"
    ? $_("modals.editTP.title")
    : $_("modals.editSL.title")}
  {onclose}
  isOpen={true}
>
  <div class="flex flex-col gap-4 p-4 min-w-[300px]">
    <div class="text-sm text-[var(--text-secondary)] mb-2">
      {$_("journal.symbol")}: <span class="text-[var(--text-primary)] font-bold"
        >{order?.symbol}</span
      >
    </div>

    <div class="flex flex-col gap-1">
      <label
        for="tpsl-trigger-price"
        class="text-xs font-bold text-[var(--text-secondary)]"
        >{$_("dashboard.tpslManager.trigger")}</label
      >
      <input
        id="tpsl-trigger-price"
        name="tpslTriggerPrice"
        type="number"
        step="any"
        bind:value={triggerPrice}
        class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)]"
      />
    </div>

    <div class="flex flex-col gap-1">
      <label
        for="tpsl-amount"
        class="text-xs font-bold text-[var(--text-secondary)]"
        >{$_("dashboard.amount")}</label
      >
      <input
        id="tpsl-amount"
        name="tpslAmount"
        type="number"
        step="any"
        bind:value={amount}
        class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)]"
      />
    </div>

    {#if error}
      <div class="text-xs text-[var(--danger-color)]">{error}</div>
    {/if}

    <div class="flex justify-end gap-2 mt-2">
      <button
        class="px-3 py-1.5 rounded text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
        onclick={() => onclose?.()}
        disabled={loading}
      >
        {$_("common.cancel")}
      </button>
      <button
        class="px-3 py-1.5 rounded text-xs font-bold text-white bg-[var(--accent-color)] hover:bg-opacity-90 disabled:opacity-50"
        onclick={handleSave}
        disabled={loading}
      >
        {loading ? $_("common.save") + "..." : $_("common.save")}
      </button>
    </div>
  </div>
</ModalFrame>
