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

<!--
  FEAT-0068 — add or withdraw margin on one isolated position.

  Add and reduce are one request with a signed amount, which is the
  exchange's own shape; the two buttons choose the sign so the trader never
  has to type a minus and never has to wonder which direction an unsigned
  number went.

  The dialog closes on success and shows nothing new about the position: the
  updated margin arrives on the private position channel (with a REST resync
  behind it), so what the trader reads afterwards is the exchange's number,
  not this dialog's arithmetic.
-->

<script lang="ts">
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";
  import { activeExchange } from "../../services/exchange";
  import { getDisplayMessage } from "../../utils/errorUtils";
  import { formatDynamicDecimal } from "../../utils/utils";
  import type { OMSPosition } from "../../services/omsTypes";
  import type { TranslationKey } from "../../locales/schema";
  import ModalFrame from "./ModalFrame.svelte";

  interface Props {
    position: OMSPosition | null;
    onclose?: () => void;
    onsuccess?: () => void;
  }

  let { position, onclose, onsuccess }: Props = $props();

  let direction = $state<"add" | "reduce">("add");
  let amountText = $state("");
  let loading = $state(false);
  let error = $state("");

  /*
   * Bitunix reports ISOLATION, the mapper lowercases whatever arrives, and
   * another venue would say "isolated" — so the common prefix is the honest
   * test. Cross positions draw their margin from the account balance and
   * have none of their own to move.
   */
  const isIsolated = $derived(
    (position?.marginMode ?? "").toLowerCase().startsWith("isolat"),
  );

  const amount = $derived.by(() => {
    const raw = amountText.trim();
    if (!raw) return null;
    try {
      const d = new Decimal(raw);
      return d.isFinite() && d.gt(0) ? d : null;
    } catch {
      return null;
    }
  });

  /**
   * A withdrawal cannot exceed the margin that is there. The exchange has
   * the last word (it also holds back what the position needs to stay above
   * maintenance), but sending an amount larger than the whole margin is a
   * request that can only ever be refused.
   */
  const exceedsMargin = $derived(
    direction === "reduce" &&
      amount !== null &&
      position?.margin !== undefined &&
      amount.gt(position.margin),
  );

  const canSubmit = $derived(
    !loading && isIsolated && amount !== null && !exceedsMargin,
  );

  async function submit() {
    if (!position || !amount || !canSubmit) return;

    loading = true;
    error = "";
    try {
      await activeExchange().account.adjustPositionMargin({
        symbol: position.symbol,
        // The sign is the whole instruction: positive adds, negative
        // withdraws (docs/bitunix-api/02_account.md).
        amount: direction === "add" ? amount : amount.neg(),
        side: position.side === "long" ? "LONG" : "SHORT",
        positionId: position.positionId,
      });
      onsuccess?.();
    } catch (e: unknown) {
      const raw = getDisplayMessage(e, $_);
      // A bare i18n key still needs translating; it is the only message here
      // without a space in it.
      error = raw.includes(" ") ? raw : $_(raw as TranslationKey);
    } finally {
      loading = false;
    }
  }
</script>

<ModalFrame title={$_("modals.adjustMargin.title")} {onclose} isOpen={true}>
  <div class="flex flex-col gap-3 p-4 min-w-[300px]">
    <div class="text-sm text-[var(--text-secondary)]">
      {$_("journal.symbol")}:
      <span class="text-[var(--text-primary)] font-bold">{position?.symbol}</span>
    </div>

    {#if !isIsolated}
      <p class="text-xs text-[var(--warning-color)]">
        {$_("modals.adjustMargin.crossOnly")}
      </p>
    {:else}
      <div class="flex justify-between text-xs">
        <span class="text-[var(--text-secondary)]"
          >{$_("modals.adjustMargin.currentMargin")}</span
        >
        <span class="font-mono text-[var(--text-primary)]"
          >{formatDynamicDecimal(position?.margin)}</span
        >
      </div>

      {#if position?.liquidationPrice && position.liquidationPrice.gt(0)}
        <div class="flex justify-between text-xs">
          <span class="text-[var(--text-secondary)]"
            >{$_("modals.adjustMargin.liquidation")}</span
          >
          <span class="font-mono text-[var(--warning-color)]"
            >{formatDynamicDecimal(position.liquidationPrice)}</span
          >
        </div>
      {/if}

      <div class="flex gap-1">
        <button
          type="button"
          class="flex-1 py-1 text-xs rounded border transition-colors"
          class:border-[var(--accent-color)]={direction === "add"}
          class:text-[var(--accent-color)]={direction === "add"}
          class:border-[var(--border-color)]={direction !== "add"}
          onclick={() => (direction = "add")}
        >
          {$_("modals.adjustMargin.add")}
        </button>
        <button
          type="button"
          class="flex-1 py-1 text-xs rounded border transition-colors"
          class:border-[var(--accent-color)]={direction === "reduce"}
          class:text-[var(--accent-color)]={direction === "reduce"}
          class:border-[var(--border-color)]={direction !== "reduce"}
          onclick={() => (direction = "reduce")}
        >
          {$_("modals.adjustMargin.reduce")}
        </button>
      </div>

      <label class="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
        {$_("modals.adjustMargin.amount")}
        <input
          type="text"
          inputmode="decimal"
          bind:value={amountText}
          disabled={loading}
          class="input-field w-full px-3 py-1.5 rounded-md text-sm"
          placeholder="0"
        />
      </label>

      <p class="text-[10px] text-[var(--text-tertiary)]">
        {$_("modals.adjustMargin.hint")}
      </p>
    {/if}

    {#if error}
      <p class="text-xs text-[var(--danger-color)]">{error}</p>
    {/if}

    <div class="flex gap-2 justify-end">
      <button
        type="button"
        onclick={onclose}
        disabled={loading}
        class="px-3 py-1.5 text-xs rounded border border-[var(--border-color)]
               text-[var(--text-secondary)] disabled:opacity-50"
      >
        {$_("common.cancel")}
      </button>
      <button
        type="button"
        onclick={submit}
        disabled={!canSubmit}
        class="px-3 py-1.5 text-xs rounded font-bold bg-accent-paired
               disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {direction === "add"
          ? $_("modals.adjustMargin.submitAdd")
          : $_("modals.adjustMargin.submitReduce")}
      </button>
    </div>
  </div>
</ModalFrame>
