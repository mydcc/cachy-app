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
  Close a position, in whole or in part — FEAT-0256.

  Replaces the bare `confirm()` the positions list used to call, which could
  only ever ask yes-or-no about the whole position. The quantity defaults to
  the full size, so the fastest path through this dialog is the same action
  that dialog performed.

  The quantity shown is the quantity submitted: `PartialCloseInput` owns the
  arithmetic and hands back a `Decimal`, and `handleClose` passes that same
  value to `closePosition` without re-deriving it.
-->

<script lang="ts">
  import { Decimal } from "decimal.js";
  import { activeExchange } from "../../services/exchange";
  import type { OMSPosition } from "../../services/omsTypes";
  import { getDisplayMessage } from "../../utils/errorUtils";
  import { _ } from "../../locales/i18n";
  import { marketState } from "../../stores/market.svelte";
  import ModalFrame from "./ModalFrame.svelte";
  import PartialCloseInput from "./PartialCloseInput.svelte";
  import { isFullClose, type PartialCloseContext } from "../../lib/calculators/partialClose";

  interface Props {
    position: OMSPosition | null;
    onclose?: () => void;
    onsuccess?: () => void;
  }

  let { position, onclose, onsuccess }: Props = $props();

  let quantity = $state<Decimal | null>(null);
  let loading = $state(false);
  let error = $state("");

  /*
   * Defaults to the whole position, so the shortest path through this dialog
   * is the full close the old `confirm()` offered. Keyed on the position, so
   * opening it for a different one starts from that one's size rather than
   * inheriting the previous quantity.
   */
  $effect(() => {
    const amount = position?.amount;
    quantity = amount ? new Decimal(amount) : null;
  });

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
   * Recovered rather than defaulted to the entry price, which would print a
   * realised PnL of exactly zero and read as "this close books nothing" instead
   * of "the mark is unknown".
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

  const ctx = $derived.by<PartialCloseContext | null>(() => {
    if (!position || position.amount.lte(0)) return null;
    return {
      positionAmount: position.amount,
      entryPrice: position.entryPrice,
      markPrice,
      side: position.side === "long" ? "LONG" : "SHORT",
      stepSize,
    };
  });

  const closesEverything = $derived(
    ctx && quantity ? isFullClose(ctx, quantity) : true,
  );

  async function handleClose() {
    if (!position || !quantity || quantity.lte(0)) return;

    loading = true;
    error = "";

    try {
      // The same Decimal the input produced — not a re-derivation of it, and
      // not a percentage the service would have to interpret again.
      await activeExchange().trading.closePosition({
        symbol: position.symbol,
        positionSide: position.side,
        amount: quantity,
      });
      onsuccess?.();
    } catch (e: unknown) {
      error = getDisplayMessage(e, $_) || $_("dashboard.alerts.failedClose");
    } finally {
      loading = false;
    }
  }
</script>

<ModalFrame title={$_("modals.closePosition.title")} {onclose} isOpen={true}>
  <div class="flex flex-col gap-4 p-4 min-w-[300px]">
    <div class="text-sm text-[var(--text-secondary)]">
      {$_("journal.symbol")}:
      <span class="text-[var(--text-primary)] font-bold">{position?.symbol}</span>
    </div>

    {#if ctx && quantity}
      <PartialCloseInput
        {ctx}
        {quantity}
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
        onclick={handleClose}
        disabled={loading || !ctx || !quantity || quantity.lte(0)}
        class="px-3 py-1.5 text-xs rounded font-bold bg-danger-paired
               disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {closesEverything
          ? $_("modals.closePosition.submitFull")
          : $_("modals.closePosition.submit")}
      </button>
    </div>
  </div>
</ModalFrame>
