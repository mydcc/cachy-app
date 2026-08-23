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
  FEAT-0070 — creating TP/SL where none exists.

  `TpSlEditModal` edits one leg of a plan that already exists; this creates
  one for a position that has none, or is only partly covered. Kept separate
  rather than folded into the edit modal because the two are driven by
  different things — an existing `TpSlOrder` there, an `OMSPosition` here —
  and a single component juggling both would need to branch on which one it
  was given for nearly every field.

  Two sections, matching the two endpoints Bitunix exposes (`06_tp_sl.md`):
  position-wide (max one per position, tracks its size, closes at market)
  and partial (several may coexist, each covering an explicit quantity). A
  leg already covered by a position-wide plan shows its price with an Edit
  link into the existing modal instead of a second create input — the "one
  per position" limit reflected as a UI choice rather than a refusal from the
  venue (AC#3).
-->

<script lang="ts">
  import { untrack } from "svelte";
import { Decimal } from "decimal.js";
  import { activeExchange, type TpSlOrder } from "../../services/exchange";
  import type { OMSPosition } from "../../services/omsTypes";
  import { getDisplayMessage } from "../../utils/errorUtils";
  import { _ } from "../../locales/i18n";
  import ModalFrame from "./ModalFrame.svelte";
  import TpSlPriceInput from "./TpSlPriceInput.svelte";
  import TpSlEditModal from "./TpSlEditModal.svelte";
  import { tpSlState } from "../../stores/tpsl.svelte";
  import { marketState } from "../../stores/market.svelte";
  import type { TpSlContext, FeeRates } from "../../lib/calculators/tpsl";

  interface Props {
    position: OMSPosition;
    onclose?: () => void;
    onsuccess?: () => void;
  }

  let { position, onclose, onsuccess }: Props = $props();

  /*
   * Read once, at open — not reactively. What this modal offers (create vs.
   * edit-existing, per leg) is a decision made when the trader opens it; a
   * plan created moments later by this same modal should not cause its own
   * sections to swap out from under an in-progress edit.
   *
   * `scopeGuess` is BUG-0266's named inference, not a documented field — see
   * that item. Gating "position-wide create" on it is the one place this
   * modal relies on the guess; getting it wrong here means either a refused
   * create (visible) or a second plan where the trader expected an edit
   * (quiet) — worth confirming against a live account before this ships.
   */
  const existingPlans = untrack(() => tpSlState.plansFor(position.symbol));
  const tpCoveredByPositionPlan = existingPlans.profit?.scopeGuess === "position";
  const slCoveredByPositionPlan = existingPlans.loss?.scopeGuess === "position";

  let tpPrice = $state("");
  let slPrice = $state("");
  let stopType = $state<"LAST_PRICE" | "MARK_PRICE">("MARK_PRICE");
  let positionWideLoading = $state(false);
  let positionWideError = $state("");

  let partialOpen = $state(false);
  let partialTpPrice = $state("");
  let partialSlPrice = $state("");
  let partialQty = $state("");
  let partialLoading = $state(false);
  let partialError = $state("");

  /** Editing an already-covered leg opens the existing single-leg modal on top. */
  let editingLeg = $state<TpSlOrder | null>(null);

  const positionSize = $derived(position.size ?? position.amount);

  const tpSlContext = $derived.by<TpSlContext | null>(() => {
    if (position.entryPrice.lte(0) || !positionSize || positionSize.lte(0)) return null;
    return {
      entryPrice: position.entryPrice,
      leverage: position.leverage.gt(0) ? position.leverage : new Decimal(1),
      side: position.side === "long" ? "LONG" : "SHORT",
      positionSize,
    };
  });

  const tickSize = $derived.by(() => {
    const precision = marketState.symbolMeta[position.symbol]?.quotePrecision;
    if (precision === undefined || precision === null) return new Decimal(0);
    return new Decimal(10).pow(-precision);
  });

  const feeRates: FeeRates | undefined = undefined;

  function toDecimalOrZero(value: string): Decimal {
    try {
      const parsed = new Decimal(value || 0);
      return parsed.isFinite() ? parsed : new Decimal(0);
    } catch {
      return new Decimal(0);
    }
  }

  const tpDecimal = $derived(toDecimalOrZero(tpPrice));
  const slDecimal = $derived(toDecimalOrZero(slPrice));

  function openEdit(order: TpSlOrder | undefined) {
    if (order) editingLeg = order;
  }

  function handleEditSuccess() {
    editingLeg = null;
    tpSlState.invalidate();
    onsuccess?.();
  }

  async function handleCreatePositionWide() {
    if (!position.positionId) {
      positionWideError = $_("modals.createTpSl.missingPositionId");
      return;
    }
    if (!tpPrice && !slPrice) {
      positionWideError = $_("apiErrors.tpslNoLeg");
      return;
    }

    positionWideLoading = true;
    positionWideError = "";
    try {
      await activeExchange().trading.placePositionTpSl({
        symbol: position.symbol,
        positionId: position.positionId,
        takeProfit: tpPrice ? { price: new Decimal(tpPrice), stopType } : undefined,
        stopLoss: slPrice ? { price: new Decimal(slPrice), stopType } : undefined,
      });
      tpSlState.invalidate();
      onsuccess?.();
    } catch (e: unknown) {
      positionWideError = getDisplayMessage(e, $_) || $_("errors.createFailed");
    } finally {
      positionWideLoading = false;
    }
  }

  async function handleCreatePartial() {
    if (!position.positionId) {
      partialError = $_("modals.createTpSl.missingPositionId");
      return;
    }
    if (!partialTpPrice && !partialSlPrice) {
      partialError = $_("apiErrors.tpslNoLeg");
      return;
    }
    if (!partialQty) {
      partialError = $_("modals.createTpSl.quantityRequired");
      return;
    }

    let qty: Decimal;
    try {
      qty = new Decimal(partialQty);
    } catch {
      partialError = $_("modals.createTpSl.invalidQuantity");
      return;
    }
    if (!qty.isFinite() || qty.lte(0)) {
      partialError = $_("modals.createTpSl.invalidQuantity");
      return;
    }
    // AC#2 — validated against the position size. Other partial plans that
    // may already reserve part of it are not accounted for here: the store
    // does not reliably enumerate every partial plan on a symbol (BUG-0266),
    // only the first of each type, so a check against those would be a
    // guess dressed up as a bound. The venue enforces the real limit.
    if (positionSize && qty.gt(positionSize)) {
      partialError = $_("modals.createTpSl.qtyExceedsPosition");
      return;
    }

    partialLoading = true;
    partialError = "";
    try {
      await activeExchange().trading.placeTpSlOrder({
        symbol: position.symbol,
        positionId: position.positionId,
        takeProfit: partialTpPrice ? { price: new Decimal(partialTpPrice), qty, stopType } : undefined,
        stopLoss: partialSlPrice ? { price: new Decimal(partialSlPrice), qty, stopType } : undefined,
      });
      tpSlState.invalidate();
      onsuccess?.();
    } catch (e: unknown) {
      partialError = getDisplayMessage(e, $_) || $_("errors.createFailed");
    } finally {
      partialLoading = false;
    }
  }
</script>

<ModalFrame title={$_("modals.createTpSl.title")} {onclose} isOpen={true}>
  <div class="flex flex-col gap-4 p-4 min-w-[320px] max-w-[380px]">
    <div class="text-sm text-[var(--text-secondary)]">
      {$_("journal.symbol")}: <span class="text-[var(--text-primary)] font-bold">{position.symbol}</span>
    </div>

    <div class="flex flex-col gap-1">
      <label for="tpsl-create-trigger-type" class="text-xs font-bold text-[var(--text-secondary)]"
        >{$_("modals.createTpSl.triggerType")}</label
      >
      <select
        id="tpsl-create-trigger-type"
        bind:value={stopType}
        class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)] text-xs"
      >
        <option value="MARK_PRICE">{$_("modals.createTpSl.markPrice")}</option>
        <option value="LAST_PRICE">{$_("modals.createTpSl.lastPrice")}</option>
      </select>
    </div>

    <!-- Position-wide section (AC#1, AC#3) -->
    <div class="flex flex-col gap-2 border-t border-[var(--border-color)] pt-3">
      <div class="text-xs font-bold text-[var(--text-primary)]">
        {$_("modals.createTpSl.positionWide")}
      </div>
      <div class="text-[10px] text-[var(--text-tertiary)]">
        {$_("modals.createTpSl.positionWideHint")}
      </div>

      {#if tpCoveredByPositionPlan}
        <div class="flex justify-between items-center text-xs">
          <span class="text-[var(--success-color)]"
            >TP {existingPlans.profit?.triggerPrice} — {$_("modals.createTpSl.alreadySet")}</span
          >
          <button
            class="text-[var(--accent-color)] hover:underline text-xs"
            onclick={() => openEdit(existingPlans.profit)}
          >
            {$_("modals.createTpSl.editExisting")}
          </button>
        </div>
      {:else if tpSlContext}
        <TpSlPriceInput
          ctx={tpSlContext}
          kind="TP"
          {tickSize}
          price={tpDecimal}
          fees={feeRates}
          disabled={positionWideLoading}
          onChange={(next) => (tpPrice = next.toString())}
        />
      {:else}
        <div class="flex flex-col gap-1">
          <label for="tpsl-create-tp-price" class="text-xs font-bold text-[var(--text-secondary)]"
            >{$_("modals.createTpSl.takeProfitPrice")}</label
          >
          <input
            id="tpsl-create-tp-price"
            type="number"
            step="any"
            bind:value={tpPrice}
            disabled={positionWideLoading}
            class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)]"
          />
        </div>
      {/if}

      {#if slCoveredByPositionPlan}
        <div class="flex justify-between items-center text-xs">
          <span class="text-[var(--danger-color)]"
            >SL {existingPlans.loss?.triggerPrice} — {$_("modals.createTpSl.alreadySet")}</span
          >
          <button
            class="text-[var(--accent-color)] hover:underline text-xs"
            onclick={() => openEdit(existingPlans.loss)}
          >
            {$_("modals.createTpSl.editExisting")}
          </button>
        </div>
      {:else if tpSlContext}
        <TpSlPriceInput
          ctx={tpSlContext}
          kind="SL"
          {tickSize}
          price={slDecimal}
          fees={feeRates}
          disabled={positionWideLoading}
          onChange={(next) => (slPrice = next.toString())}
        />
      {:else}
        <div class="flex flex-col gap-1">
          <label for="tpsl-create-sl-price" class="text-xs font-bold text-[var(--text-secondary)]"
            >{$_("modals.createTpSl.stopLossPrice")}</label
          >
          <input
            id="tpsl-create-sl-price"
            type="number"
            step="any"
            bind:value={slPrice}
            disabled={positionWideLoading}
            class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)]"
          />
        </div>
      {/if}

      {#if positionWideError}
        <div class="text-xs text-[var(--danger-color)]">{positionWideError}</div>
      {/if}

      {#if !tpCoveredByPositionPlan || !slCoveredByPositionPlan}
        <button
          class="w-full py-1.5 rounded text-xs font-bold text-white bg-[var(--accent-color)] hover:bg-opacity-90 disabled:opacity-50"
          onclick={handleCreatePositionWide}
          disabled={positionWideLoading || (!tpPrice && !slPrice)}
        >
          {positionWideLoading
            ? $_("modals.createTpSl.submit") + "..."
            : $_("modals.createTpSl.submit")}
        </button>
      {/if}
    </div>

    <!-- Partial section (AC#2) — always offered; several partial plans may
         coexist regardless of whether a position-wide one already exists. -->
    <div class="flex flex-col gap-2 border-t border-[var(--border-color)] pt-3">
      <button
        class="text-xs font-bold text-[var(--text-primary)] text-left flex items-center gap-1"
        onclick={() => (partialOpen = !partialOpen)}
      >
        <span>{partialOpen ? "▾" : "▸"}</span>
        {$_("modals.createTpSl.partial")}
      </button>

      {#if partialOpen}
        <div class="text-[10px] text-[var(--text-tertiary)]">
          {$_("modals.createTpSl.partialHint")}
        </div>

        <div class="flex flex-col gap-1">
          <label for="tpsl-create-partial-tp" class="text-xs font-bold text-[var(--text-secondary)]"
            >{$_("modals.createTpSl.takeProfitPrice")}</label
          >
          <input
            id="tpsl-create-partial-tp"
            type="number"
            step="any"
            bind:value={partialTpPrice}
            disabled={partialLoading}
            class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)]"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label for="tpsl-create-partial-sl" class="text-xs font-bold text-[var(--text-secondary)]"
            >{$_("modals.createTpSl.stopLossPrice")}</label
          >
          <input
            id="tpsl-create-partial-sl"
            type="number"
            step="any"
            bind:value={partialSlPrice}
            disabled={partialLoading}
            class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)]"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label for="tpsl-create-partial-qty" class="text-xs font-bold text-[var(--text-secondary)]"
            >{$_("dashboard.amount")}</label
          >
          <input
            id="tpsl-create-partial-qty"
            type="number"
            step="any"
            bind:value={partialQty}
            disabled={partialLoading}
            class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)]"
          />
        </div>

        {#if partialError}
          <div class="text-xs text-[var(--danger-color)]">{partialError}</div>
        {/if}

        <button
          class="w-full py-1.5 rounded text-xs font-bold text-white bg-[var(--accent-color)] hover:bg-opacity-90 disabled:opacity-50"
          onclick={handleCreatePartial}
          disabled={partialLoading || (!partialTpPrice && !partialSlPrice) || !partialQty}
        >
          {partialLoading ? $_("modals.createTpSl.submit") + "..." : $_("modals.createTpSl.submit")}
        </button>
      {/if}
    </div>

    <div class="flex justify-end pt-1">
      <button
        class="px-3 py-1.5 rounded text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
        onclick={() => onclose?.()}
      >
        {$_("common.close")}
      </button>
    </div>
  </div>
</ModalFrame>

{#if editingLeg}
  <TpSlEditModal
    order={editingLeg}
    onclose={() => (editingLeg = null)}
    onsuccess={handleEditSuccess}
  />
{/if}
