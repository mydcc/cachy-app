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
  behind it — `tradeService.adjustPositionMargin` calls
  `accountState.requestSync()`), so what the trader reads afterwards is the
  exchange's number, not this dialog's arithmetic. The parent's `onsuccess`
  (PositionsSidebar `handleAdjustMarginSuccess`: close + toast) is that
  reconciliation trigger — the same established pattern ClosePositionModal
  and AddToPositionModal use — so no extra refresh is added here.
  Failure never calls `onsuccess` and the dialog stays open.

  BUG-0554 — the dialog also projects the liquidation consequence via
  `projectLiquidation` and gates a tightening reduce behind an explicit
  acknowledgement of current margin, new margin, and liquidation move.
-->

<script lang="ts">
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";
  import { activeExchange } from "../../services/exchange";
  import { projectLiquidation } from "../../lib/calculators/liquidation";
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
  let acknowledged = $state(false);

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

  /*
   * BUG-0554 — project the liquidation consequence of the drafted change.
   *
   * The margin change is a leverage change at constant notional
   * (notional = amount × entry), so the new leverage is notional / newMargin
   * and `projectLiquidation` (BUG-0504) solves the venue MMR from the
   * entry/liquidation/current-leverage triple and re-applies it there.
   *
   * `null` from the helper — or any missing/non-positive input here — is an
   * explicit unmeasurable state, never the old liquidation value presented
   * as the consequence. A full withdrawal (newMargin <= 0) leaves no
   * isolated position to project.
   */
  type Projection =
    | { state: "idle" }
    | { state: "unmeasurable" }
    | {
        state: "ok";
        to: Decimal;
        tighter: boolean;
        newMargin: Decimal;
      };

  const projection = $derived.by<Projection>(() => {
    if (!position || amount === null) return { state: "idle" };
    try {
      const entry = position.entryPrice;
      const liq = position.liquidationPrice;
      const margin = position.margin;
      const size = position.amount;
      if (!entry?.isFinite() || entry.lte(0)) return { state: "unmeasurable" };
      if (!liq?.isFinite() || liq.lte(0)) return { state: "unmeasurable" };
      if (!margin?.isFinite() || margin.lte(0)) return { state: "unmeasurable" };
      if (!size?.isFinite() || size.lte(0)) return { state: "unmeasurable" };
      if (position.side !== "long" && position.side !== "short")
        return { state: "unmeasurable" };

      const notional = size.times(entry);
      const newMargin =
        direction === "add" ? margin.plus(amount) : margin.minus(amount);
      if (!newMargin.isFinite() || newMargin.lte(0))
        return { state: "unmeasurable" };

      const stated = position.leverage;
      const currentLeverage =
        stated?.isFinite() && stated.gt(0)
          ? stated
          : notional.div(margin);
      if (!currentLeverage?.isFinite() || currentLeverage.lte(0))
        return { state: "unmeasurable" };
      const newLeverage = notional.div(newMargin);
      if (!newLeverage.isFinite() || newLeverage.lte(0))
        return { state: "unmeasurable" };

      const result = projectLiquidation(
        entry,
        liq,
        currentLeverage,
        newLeverage,
        position.side,
        position.marginMode,
      );
      if (!result) return { state: "unmeasurable" };
      return {
        state: "ok",
        to: result.to,
        tighter: result.tighter,
        newMargin,
      };
    } catch {
      return { state: "unmeasurable" };
    }
  });

  /*
   * A reduce that moves liquidation closer (tighter) cannot submit until the
   * trader acknowledges the explicit consequence. An add moves liquidation
   * away, so it needs no gate — but the projection is still shown.
   */
  const requiresConfirmation = $derived(
    direction === "reduce" &&
      projection.state === "ok" &&
      projection.tighter,
  );
  const needsAck = $derived(requiresConfirmation && !acknowledged);

  const canSubmit = $derived(
    !loading && isIsolated && amount !== null && !exceedsMargin && !needsAck,
  );

  function selectDirection(next: "add" | "reduce") {
    direction = next;
    acknowledged = false;
  }

  function handleAmountInput() {
    acknowledged = false;
  }

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

<ModalFrame
  title={$_("modals.adjustMargin.title")}
  {onclose}
  isOpen={true}
  width={440}
  height={375}
  compact
>
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
          onclick={() => selectDirection("add")}
        >
          {$_("modals.adjustMargin.add")}
        </button>
        <button
          type="button"
          class="flex-1 py-1 text-xs rounded border transition-colors"
          class:border-[var(--accent-color)]={direction === "reduce"}
          class:text-[var(--accent-color)]={direction === "reduce"}
          class:border-[var(--border-color)]={direction !== "reduce"}
          onclick={() => selectDirection("reduce")}
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
          oninput={handleAmountInput}
          disabled={loading}
          class="input-field w-full px-3 py-1.5 rounded-md text-sm"
          placeholder="0"
        />
      </label>

      {#if projection.state === "ok"}
        <div class="flex justify-between text-xs">
          <span class="text-[var(--text-secondary)]"
            >{$_("modals.adjustMargin.projectedLiquidation")}</span
          >
          <span class="font-mono text-[var(--text-primary)]"
            >{formatDynamicDecimal(projection.to)}</span
          >
        </div>
        <p
          class="text-[11px]"
          class:text-[var(--danger-color)]={projection.tighter}
          class:text-[var(--success-color)]={!projection.tighter}
        >
          {projection.tighter
            ? $_("modals.adjustMargin.movesCloser")
            : $_("modals.adjustMargin.movesAway")}
        </p>
        {#if requiresConfirmation}
          <label
            class="flex items-start gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer"
          >
            <input
              type="checkbox"
              bind:checked={acknowledged}
              disabled={loading}
              class="mt-0.5"
            />
            <span
              >{$_("modals.adjustMargin.confirmReduce", {
                values: {
                  currentMargin: formatDynamicDecimal(position?.margin),
                  newMargin: formatDynamicDecimal(projection.newMargin),
                  from: formatDynamicDecimal(position?.liquidationPrice),
                  to: formatDynamicDecimal(projection.to),
                },
              })}</span
            >
          </label>
        {/if}
      {:else if projection.state === "unmeasurable"}
        <p class="text-[11px] text-[var(--warning-color)]">
          {$_("modals.adjustMargin.unmeasurable")}
        </p>
      {/if}

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
