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
  How much of a position to close — FEAT-0256.

  A `RangeSlider` over the share of the position, an absolute-quantity field
  beside it, and a readout of what stays open and what the close would realise.

  **One source of truth: `quantity`.** The slider position and the field are
  both derived from it, and editing either computes a new quantity handed back
  through `onChange`. The quantity displayed is therefore the quantity
  submitted, with nothing in between to drift — the same discipline
  `TpSlPriceInput` follows, and the reason `FEAT-0011`'s gate has nothing to
  catch here.

  **100 % is not a slider position like the others.** It submits the exact
  amount the venue reports rather than a rounded share of it, because a
  position whose size is not a whole multiple of the current step would
  otherwise leave a remainder open that the trader never asked to keep.
  `quantityFromPercent` holds that rule; this component does not restate it.
-->

<script lang="ts">
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";
  import RangeSlider from "./RangeSlider.svelte";
  import {
    quantityFromPercent,
    percentFromQuantity,
    remainingAfterClose,
    realizedPnlOnClose,
    roundDownToStep,
    isFullClose,
    type PartialCloseContext,
  } from "../../lib/calculators/partialClose";

  /** Slider granularity in percent — one arrow-key press. */
  const PERCENT_STEP = new Decimal(1);
  const MARK_PERCENTS = [0, 25, 50, 75, 100];

  interface Props {
    /** The position being reduced — size, entry, mark, side, step. */
    ctx: PartialCloseContext;
    /** Quantity to close. The single source of truth. */
    quantity: Decimal;
    disabled?: boolean;
    /** Always receives a quantity the venue can fill. */
    onChange: (quantity: Decimal) => void;
  }

  let { ctx, quantity, disabled = false, onChange }: Props = $props();

  const percent = $derived(percentFromQuantity(ctx, quantity));
  const remaining = $derived(remainingAfterClose(ctx, quantity));
  const pnl = $derived(realizedPnlOnClose(ctx, quantity));
  const closesEverything = $derived(isFullClose(ctx, quantity));

  const marks = MARK_PERCENTS.map((at) => ({
    at: new Decimal(at),
    label: `${at}%`,
  }));

  /*
   * Readout figures prepared here rather than in the template — the same rule
   * that keeps computation out of an `{#each}` body applies to a line that
   * recomputes on every drag frame.
   */
  const remainingText = $derived(remaining.toString());
  const pnlText = $derived(`${pnl.gt(0) ? "+" : ""}${pnl.toFixed(2)}`);
  const pnlTone = $derived(
    pnl.gt(0)
      ? "text-[var(--success-color)]"
      : pnl.lt(0)
        ? "text-[var(--danger-color)]"
        : "text-[var(--text-secondary)]",
  );

  /*
   * The quantity field is edited as a string: a half-typed "0." is not a
   * number, and reformatting on every keystroke fights the person typing. It
   * commits on blur and on Enter; until then the slider keeps showing the
   * committed value.
   */
  let draft = $state<string | null>(null);
  const quantityDisplay = $derived(draft ?? quantity.toString());

  function commitQuantity() {
    const text = draft;
    draft = null;
    if (text === null || text.trim() === "") return;
    try {
      const parsed = new Decimal(text);
      if (!parsed.isFinite() || parsed.lte(0)) return;
      // Clamped to the position before rounding: a typed quantity above the
      // position is a full close, not a refusal — the trader plainly wants out.
      if (parsed.gte(ctx.positionAmount)) {
        onChange(ctx.positionAmount);
        return;
      }
      const stepped = roundDownToStep(parsed, ctx.stepSize);
      onChange(stepped.lte(0) ? Decimal.min(ctx.stepSize, ctx.positionAmount) : stepped);
    } catch {
      // Not a number — drop it and fall back to the committed value.
    }
  }

  function onFieldKey(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitQuantity();
    } else if (event.key === "Escape") {
      draft = null;
    }
  }
</script>

<div class="flex flex-col gap-2 w-full">
  <!-- Absolute quantity -->
  <div class="flex items-center gap-2">
    <label
      for="partial-close-qty"
      class="text-[10px] font-bold text-[var(--text-secondary)] shrink-0 w-20"
    >
      {$_("positionsList.closeQuantity")}
    </label>
    <input
      id="partial-close-qty"
      name="partialCloseQty"
      type="text"
      inputmode="decimal"
      {disabled}
      value={quantityDisplay}
      oninput={(e) => (draft = e.currentTarget.value)}
      onblur={commitQuantity}
      onkeydown={onFieldKey}
      class="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded
             p-1.5 text-xs font-mono text-[var(--text-primary)] disabled:opacity-50"
    />
  </div>

  <RangeSlider
    id="partial-close-slider"
    label={$_("positionsList.closeSliderLabel")}
    value={percent}
    min={new Decimal(0)}
    max={new Decimal(100)}
    step={PERCENT_STEP}
    {marks}
    {disabled}
    tone="danger"
    formatValue={(v) => `${v.toDecimalPlaces(0)}%`}
    onChange={(v) => onChange(quantityFromPercent(ctx, v))}
  />

  <!-- What the close leaves behind, and what it books -->
  <div class="text-[10px] font-mono flex flex-col gap-0.5">
    <p class="text-[var(--text-secondary)]">
      {$_("positionsList.remainingAfter")}: {remainingText}
    </p>
    <p class={pnlTone}>
      {$_("positionsList.realizesPnl")}: {pnlText}
    </p>
    {#if closesEverything}
      <p class="text-[var(--warning-color)]">
        {$_("positionsList.fullCloseBadge")}
      </p>
    {/if}
  </div>
</div>
