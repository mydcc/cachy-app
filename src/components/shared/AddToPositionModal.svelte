<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  Add to an open position — FEAT-0334.

  The mirror of `ClosePositionModal`: `AddToPositionInput` owns the arithmetic
  and hands back a `Decimal`, and `handleAdd` passes that same value to
  `addToPosition` without re-deriving it. The quantity shown is the quantity
  submitted, which is what leaves the gate's size check nothing to catch.

  **The preview never outlives the order.** The average entry this dialog
  shows is Cachy's own arithmetic on an estimated fill. It is not written
  anywhere, and the dialog closes on success rather than staying open with a
  computed figure beside a position the venue is about to restate. A locally
  computed average that quietly disagrees with the exchange is worse than no
  preview at all, because it is believed.

  Market-only, deliberately. A limit add is a resting order with its own
  lifecycle — it can sit unfilled while the position and its average entry
  move underneath it, which makes the preview a claim about a state that may
  never arrive. The order panel already places limit orders; this dialog is
  for the add a trader makes *now*, at the price the market is offering.
-->

<script lang="ts">
  import { Decimal } from "decimal.js";
  import { activeExchange } from "../../services/exchange";
  import type { OMSPosition } from "../../services/omsTypes";
  import { getDisplayMessage } from "../../utils/errorUtils";
  import { _ } from "../../locales/i18n";
  import { marketState } from "../../stores/market.svelte";
  import ModalFrame from "./ModalFrame.svelte";
  import AddToPositionInput from "./AddToPositionInput.svelte";
  import {
    addQuantityFromPercent,
    type AddToPositionContext,
  } from "../../lib/calculators/addToPosition";

  interface Props {
    position: OMSPosition | null;
    onclose?: () => void;
    onsuccess?: () => void;
  }

  let { position, onclose, onsuccess }: Props = $props();

  let quantity = $state<Decimal | null>(null);
  let loading = $state(false);
  let error = $state("");

  /** Quantity step from the instrument's base precision; 0 disables rounding. */
  const stepSize = $derived.by(() => {
    const precision = position ? marketState.symbolMeta[position.symbol]?.basePrecision : undefined;
    if (precision === undefined || precision === null) return new Decimal(0);
    return new Decimal(10).pow(-precision);
  });

  /*
   * `markPrice` is optional on `OMSPosition` — Bitget does not always send it.
   * Where it is missing it is recovered from the unrealised PnL the venue does
   * report, which is the same number seen from the other side: PnL is the mark
   * distance times the size, so the mark is entry plus PnL per unit.
   *
   * The same recovery `ClosePositionModal` performs, and for a sharper reason
   * here: defaulting to the entry would preview an average entry that never
   * moves, which reads as "adding changes nothing" — the one conclusion this
   * dialog exists to prevent a trader from reaching by accident.
   */
  const markPrice = $derived.by(() => {
    if (!position) return new Decimal(0);
    if (position.markPrice && position.markPrice.gt(0)) return position.markPrice;
    if (position.amount.lte(0)) return position.entryPrice;
    const perUnit = position.unrealizedPnl.div(position.amount);
    return position.side === "long"
      ? position.entryPrice.plus(perUnit)
      : position.entryPrice.minus(perUnit);
  });

  const ctx = $derived.by<AddToPositionContext | null>(() => {
    if (!position || position.amount.lte(0)) return null;
    return {
      positionAmount: position.amount,
      entryPrice: position.entryPrice,
      markPrice,
      side: position.side === "long" ? "LONG" : "SHORT",
      stepSize,
    };
  });

  /** The share of the position the dialog opens on. Also a slider mark. */
  const DEFAULT_ADD_PERCENT = new Decimal(25);

  /*
   * Defaults to a quarter of the position rather than to the whole of it. The
   * close dialog defaults to everything because the fastest path through it is
   * the full close it replaced; an add has no such prior, and a dialog that
   * opens pre-loaded with "double the position" is one stray Enter away from a
   * trade nobody chose.
   *
   * Seeded through `addQuantityFromPercent` — the same function the slider's
   * 25 % mark calls — rather than by dividing by four here. That is not
   * tidiness: the seed is the quantity an untouched dialog submits, and the
   * gate refuses an add that is not a whole multiple of the instrument's step.
   * A position is `N × step`, so a raw quarter is fillable only when `N` is
   * divisible by four, and open-and-press-Add failed for roughly three
   * positions in four. Reusing the function that already rounds and already
   * floors at one step means the default cannot drift away from the slider it
   * sits under.
   *
   * Keyed on `ctx`, so it re-seeds when the dialog opens for a different
   * position or when a late `basePrecision` finally makes rounding possible.
   * `position` is a stable snapshot rather than the live object, so this does
   * not fire on price ticks and cannot wipe a quantity mid-edit.
   */
  $effect(() => {
    quantity = ctx ? addQuantityFromPercent(ctx, DEFAULT_ADD_PERCENT) : null;
  });

  async function handleAdd() {
    if (!position || !quantity || quantity.lte(0)) return;

    loading = true;
    error = "";

    try {
      // The same Decimal the input produced — not a re-derivation of it. The
      // gate compares the payload against this very number, so re-deriving it
      // here would be the one place a defect could put a different quantity on
      // the wire than the screen showed.
      await activeExchange().trading.addToPosition({
        symbol: position.symbol,
        positionSide: position.side,
        amount: quantity,
        orderType: "MARKET",
      });
      onsuccess?.();
    } catch (e: unknown) {
      error = getDisplayMessage(e, $_) || $_("dashboard.alerts.failedAdd");
    } finally {
      loading = false;
    }
  }
</script>

<ModalFrame title={$_("modals.addToPosition.title")} {onclose} isOpen={true}>
  <div class="flex flex-col gap-4 p-4 min-w-[300px]">
    <div class="text-sm text-[var(--text-secondary)]">
      {$_("journal.symbol")}:
      <span class="text-[var(--text-primary)] font-bold">{position?.symbol}</span>
    </div>

    {#if ctx && quantity}
      <AddToPositionInput
        {ctx}
        {quantity}
        fillPrice={markPrice}
        disabled={loading}
        onChange={(next) => (quantity = next)}
      />
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
        onclick={handleAdd}
        disabled={loading || !ctx || !quantity || quantity.lte(0)}
        class="px-3 py-1.5 text-xs rounded font-bold bg-accent-paired
               disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {$_("modals.addToPosition.submit")}
      </button>
    </div>
  </div>
</ModalFrame>
