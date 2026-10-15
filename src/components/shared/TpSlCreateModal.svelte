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
  FEAT-0070 — creating TP/SL where none exists; BUG-0688 gave it one form for
  the whole plan.

  Two sections, matching the two endpoints Bitunix exposes (`06_tp_sl.md`):
  position-wide (max one per position, tracks its size, closes at market)
  and partial (several may coexist, each covering an explicit quantity).

  The position-wide section is a single editor for both legs: they are one
  plan at the venue (one row, one endpoint), so they are one form here. A leg
  that is already set opens prefilled and a single save sends both — the
  "one per position" limit is still reflected, but as one edit rather than
  two dialogs. `TpSlEditModal` remains the per-leg editor for the TP/SL list,
  where each row genuinely is one leg.
-->

<script lang="ts">
  import { untrack } from "svelte";
  import { get } from "svelte/store";
import { Decimal } from "decimal.js";
  import { activeExchange, type TpSlOrder } from "../../services/exchange";
  import type { OMSPosition } from "../../services/omsTypes";
  import { getDisplayMessage } from "../../utils/errorUtils";
  import { _ } from "../../locales/i18n";
  import ModalFrame from "./ModalFrame.svelte";
  import TpSlPriceInput from "./TpSlPriceInput.svelte";
  import { tpSlState } from "../../stores/tpsl.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { validateTpSlPrice, normalizePositionSide, type TpSlContext, type FeeRates } from "../../lib/calculators/tpsl";

  interface Props {
    position: OMSPosition;
    onclose?: () => void;
    onsuccess?: () => void;
  }

  let { position, onclose, onsuccess }: Props = $props();

  /*
   * Read once, at open — not reactively. What this modal offers is a decision
   * made when the trader opens it; a plan created moments later by this same
   * modal should not cause its own sections to swap out from under an
   * in-progress edit.
   *
   * `scopeGuess` is BUG-0292's named inference, not a documented field — see
   * that item. Gating "position-wide create" on it is the one place this
   * modal relies on the guess; getting it wrong here means either a refused
   * create (visible) or a second plan where the trader expected an edit
   * (quiet) — worth confirming against a live account before this ships.
   */
  const existingPlans = untrack(() => tpSlState.plansFor(position.symbol));
  const tpCoveredByPositionPlan = existingPlans.profit?.scopeGuess === "position";
  const slCoveredByPositionPlan = existingPlans.loss?.scopeGuess === "position";
  /** Whether the position already carries a plan — decides place vs. modify. */
  const positionWidePlanExists = tpCoveredByPositionPlan || slCoveredByPositionPlan;

  /**
   * BUG-0688 — one form for the whole plan.
   *
   * A position-wide plan is *one* thing at the venue (one row, one endpoint,
   * "max. one per position"), so it is one form here too: both legs are
   * editable side by side and a single save sends both. The previous split —
   * a read-only price with an "Edit" link that opened a second modal per leg —
   * meant changing a bracket took two dialogs, and saving the first closed
   * both, so the second leg had to be found again from the start.
   *
   * A leg that is set opens prefilled with its live value, so "move the stop"
   * is one edit and one save.
   */
  function stopTypeOf(order: TpSlOrder | undefined): "LAST_PRICE" | "MARK_PRICE" | null {
    const kind = order?.workingType;
    return kind === "LAST_PRICE" || kind === "MARK_PRICE" ? kind : null;
  }
  const tpLegStopType = stopTypeOf(existingPlans.profit);
  const slLegStopType = stopTypeOf(existingPlans.loss);
  /*
   * One trigger type now governs both legs, because one form produces one
   * request. Prefilled from the plan — the type both legs agree on, the only
   * leg's type when there is one, the venue's own default when they disagree —
   * so the select shows exactly what a save would send.
   */
  const initialStopType: "LAST_PRICE" | "MARK_PRICE" =
    tpLegStopType !== null && slLegStopType !== null
      ? tpLegStopType === slLegStopType
        ? tpLegStopType
        : "MARK_PRICE"
      : (tpLegStopType ?? slLegStopType ?? "MARK_PRICE");

  let tpPrice = $state(
    tpCoveredByPositionPlan ? String(existingPlans.profit?.triggerPrice ?? "") : "",
  );
  let slPrice = $state(
    slCoveredByPositionPlan ? String(existingPlans.loss?.triggerPrice ?? "") : "",
  );
  let stopType = $state<"LAST_PRICE" | "MARK_PRICE">(initialStopType);
  let positionWideLoading = $state(false);
  let positionWideError = $state("");

  let partialOpen = $state(false);
  let partialTpPrice = $state("");
  let partialSlPrice = $state("");
  let partialQty = $state("");
  let partialLoading = $state(false);
  let partialError = $state("");

  const positionSize = $derived(position.size ?? position.amount);

  const tpSlContext = $derived.by<TpSlContext | null>(() => {
    if (position.entryPrice.lte(0) || !positionSize || positionSize.lte(0)) return null;
    /*
     * Fail closed on an unreadable side: an unknown spelling is not a short
     * (the old `=== "long" ? LONG : SHORT` ternary), it is no context at
     * all. The form then skips its pre-check and the gate refuses the
     * submission as missing-side — the same path a corrupt entry price
     * already takes.
     */
    const side = normalizePositionSide(position.side);
    if (side === null) return null;
    return {
      entryPrice: position.entryPrice,
      leverage: position.leverage.gt(0) ? position.leverage : new Decimal(1),
      side,
      positionSize,
    };
  });

  const tickSize = $derived.by(() => {
    // Venue-normalized key (BUG-0501).
    const venue = settingsState.apiProvider || "bitunix";
    const precision = marketState.symbolMeta[normalizeSymbol(position.symbol, venue)]?.quotePrecision;
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

  function invalidTpSlMessage(field: "TP" | "SL", actual: string, ctx: TpSlContext) {
    return get(_)("orderGate.invalidTpSl", {
      values: {
        field,
        actual,
        entryPrice: ctx.entryPrice.toString(),
        side: ctx.side,
      },
    });
  }

  function hasInvalidTpSl(
    takeProfit: string,
    stopLoss: string,
    setError: (message: string) => void,
  ): boolean {
    if (!tpSlContext) return false;
    const ctx = tpSlContext;
    const tick = tickSize.gt(0) ? tickSize : undefined;
    if (takeProfit && !validateTpSlPrice("TP", toDecimalOrZero(takeProfit), ctx, tick).valid) {
      setError(invalidTpSlMessage("TP", takeProfit, ctx));
      return true;
    }
    if (stopLoss && !validateTpSlPrice("SL", toDecimalOrZero(stopLoss), ctx, tick).valid) {
      setError(invalidTpSlMessage("SL", stopLoss, ctx));
      return true;
    }
    return false;
  }

  async function handleSavePositionWide() {
    if (!position.positionId) {
      positionWideError = $_(`modals.createTpSl.missingPositionId`);
      return;
    }
    /*
     * BUG-0688 — a leg that is set cannot be emptied here.
     * `position/modify_order` documents "at least one of tpPrice/slPrice" and
     * says nothing about the leg a request omits; guessing would risk clearing
     * the leg the trader only meant to leave alone. Removing a leg stays where
     * it is unambiguous: the cancel action in the TP/SL list.
     */
    if ((tpCoveredByPositionPlan && !tpPrice) || (slCoveredByPositionPlan && !slPrice)) {
      positionWideError = $_(`modals.createTpSl.legCannotBeCleared`);
      return;
    }
    if (!tpPrice && !slPrice) {
      positionWideError = $_(`apiErrors.tpslNoLeg`);
      return;
    }
    if (hasInvalidTpSl(tpPrice, slPrice, (message) => (positionWideError = message))) return;

    positionWideLoading = true;
    positionWideError = "";
    try {
      /*
       * One request for the whole plan, carrying both legs exactly as the form
       * shows them. `modify-position` when the position already carries a plan
       * (BUG-0687: a second place-order would *replace* it and drop the leg
       * that is already set), `place-position` when it carries none.
       */
      const payload = {
        symbol: position.symbol,
        positionId: position.positionId,
        context: { side: position.side, entryPrice: position.entryPrice },
        tickSize,
        takeProfit: tpPrice ? { price: new Decimal(tpPrice), stopType } : undefined,
        stopLoss: slPrice ? { price: new Decimal(slPrice), stopType } : undefined,
      };
      if (positionWidePlanExists) {
        await activeExchange().trading.modifyPositionTpSl(payload);
      } else {
        await activeExchange().trading.placePositionTpSl(payload);
      }
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
    if (hasInvalidTpSl(partialTpPrice, partialSlPrice, (message) => (partialError = message))) return;
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
    // does not reliably enumerate every partial plan on a symbol (BUG-0292),
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
        context: { side: position.side, entryPrice: position.entryPrice },
        tickSize,
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

<ModalFrame
  title={$_("modals.createTpSl.title")}
  {onclose}
  isOpen={true}
  width={440}
  height={760}
  compact
>
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
        class="w-full bg-[var(--bg-primary)] border border-[var(--input-border-color)] rounded p-2 text-[var(--text-primary)] text-xs"
      >
        <option value="MARK_PRICE">{$_("modals.createTpSl.markPrice")}</option>
        <option value="LAST_PRICE">{$_("modals.createTpSl.lastPrice")}</option>
      </select>
    </div>

    <!-- Position-wide section (AC#1, BUG-0688) — one form for the plan's
         two legs; a covered leg opens prefilled instead of behind a link. -->
    <div class="flex flex-col gap-2 border-t border-[var(--border-color)] pt-3">
      <div class="text-xs font-bold text-[var(--text-primary)]">
        {$_("modals.createTpSl.positionWide")}
      </div>
      <div class="text-[10px] text-[var(--text-tertiary)]">
        {$_("modals.createTpSl.positionWideHint")}
      </div>

      {#if tpSlContext}
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
            class="w-full bg-[var(--bg-primary)] border border-[var(--input-border-color)] rounded p-2 text-[var(--text-primary)]"
          />
        </div>
      {/if}

      {#if tpSlContext}
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
            class="w-full bg-[var(--bg-primary)] border border-[var(--input-border-color)] rounded p-2 text-[var(--text-primary)]"
          />
        </div>
      {/if}

      {#if positionWideError}
        <div class="text-xs text-[var(--danger-color)]">{positionWideError}</div>
      {/if}

      <button
        class="w-full py-1.5 rounded text-xs font-bold text-white bg-[var(--accent-color)] hover:bg-opacity-90 disabled:opacity-50"
        onclick={handleSavePositionWide}
        disabled={positionWideLoading || (!tpPrice && !slPrice)}
      >
        {positionWideLoading
          ? $_(positionWidePlanExists ? "common.save" : "modals.createTpSl.submit") + "..."
          : $_(positionWidePlanExists ? "common.save" : "modals.createTpSl.submit")}
      </button>
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
            class="w-full bg-[var(--bg-primary)] border border-[var(--input-border-color)] rounded p-2 text-[var(--text-primary)]"
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
            class="w-full bg-[var(--bg-primary)] border border-[var(--input-border-color)] rounded p-2 text-[var(--text-primary)]"
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
            class="w-full bg-[var(--bg-primary)] border border-[var(--input-border-color)] rounded p-2 text-[var(--text-primary)]"
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
