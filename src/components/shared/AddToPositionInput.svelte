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
  How much to add to a position, and what it does to the entry — FEAT-0334.

  The same shape `PartialCloseInput` established for the reduce side: a
  `RangeSlider` over the share, an absolute-quantity field beside it, and one
  committed `quantity` that both are derived from. Deliberately the same
  shape — a second implementation of the same input is how the two drift
  apart, and a trader who has learned one should not have to learn the other.

  **Where it differs from the reduce input, and why.**

  - **The percentage has no ceiling in it.** On the reduce side 100 % means
    "all of it" and is the end of the scale. Here 100 % means "double the
    position", which is a natural stopping point for a slider but not a limit;
    the absolute field accepts more. What actually limits an add is available
    margin, and that is the gate's answer to give, not this control's.
  - **The readout is a preview, never a stored truth.** The average entry
    shown here is Cachy's arithmetic on an estimated fill. The moment the
    venue reports the position back, its figure wins — which is why nothing
    here is persisted and why the modal stops showing it after a fill.
-->

<script lang="ts">
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";
  import RangeSlider from "./RangeSlider.svelte";
  import {
    addQuantityFromPercent,
    percentFromAddQuantity,
    previewAdd,
    roundAddQuantityToStep,
    type AddToPositionContext,
  } from "../../lib/calculators/addToPosition";

  /** Slider granularity in percent — one arrow-key press. */
  const PERCENT_STEP = new Decimal(1);
  /** 100 % doubles the position; it is a stopping point, not a ceiling. */
  const MARK_PERCENTS = [0, 25, 50, 75, 100];

  interface Props {
    /** The position being increased — size, entry, mark, side, step. */
    ctx: AddToPositionContext;
    /** Quantity to add. The single source of truth. */
    quantity: Decimal;
    /**
     * Where the add is expected to fill: the limit price for a limit add, the
     * mark for a market one. The caller decides, because only the caller knows
     * the order type.
     */
    fillPrice: Decimal;
    disabled?: boolean;
    /** Always receives a quantity the venue can fill. */
    onChange: (quantity: Decimal) => void;
  }

  let { ctx, quantity, fillPrice, disabled = false, onChange }: Props = $props();

  const percent = $derived(percentFromAddQuantity(ctx, quantity));
  const preview = $derived(previewAdd(ctx, quantity, fillPrice));

  const marks = MARK_PERCENTS.map((at) => ({
    at: new Decimal(at),
    label: `${at}%`,
  }));

  /*
   * The entry is shown to the precision the current entry already carries, so
   * a 30000 entry does not sprout eight decimals the venue never quotes.
   * Floored at two, because an average entry that rounds to the same figure as
   * the old one reads as "nothing changed" when something did.
   */
  const entryDecimals = $derived(Math.max(ctx.entryPrice.decimalPlaces(), 2));

  /*
   * Readout figures prepared here rather than in the template — the same rule
   * that keeps computation out of an `{#each}` body applies to a line that
   * recomputes on every drag frame.
   */
  const resultingSizeText = $derived(preview ? preview.resultingAmount.toString() : "—");
  const newEntryText = $derived(
    preview ? preview.resultingEntryPrice.toDecimalPlaces(entryDecimals).toString() : "—",
  );
  const shiftText = $derived(
    preview
      ? `${preview.entryShift.gt(0) ? "+" : ""}${preview.entryShift.toDecimalPlaces(entryDecimals)}`
      : "",
  );

  /*
   * Worse for a long means the entry rose; worse for a short means it fell.
   * Stated rather than left to the trader to work out from two numbers under
   * time pressure — but coloured as information, not as a refusal: adding
   * above your long's entry is ordinary trading, not a mistake.
   */
  const shiftTone = $derived(
    preview === null || preview.entryShift.isZero()
      ? "text-[var(--text-secondary)]"
      : preview.worsensEntry
        ? "text-[var(--warning-color)]"
        : "text-[var(--success-color)]",
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
      // No clamp to the position: unlike a reduce, an add above the current
      // size is a legitimate intent. Margin is what limits it, and the gate
      // owns that answer.
      const stepped = roundAddQuantityToStep(parsed, ctx.stepSize);
      onChange(stepped.lte(0) ? ctx.stepSize : stepped);
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
      for="add-position-qty"
      class="text-[10px] font-bold text-[var(--text-secondary)] shrink-0 w-20"
    >
      {$_("positionsList.addQuantity")}
    </label>
    <input
      id="add-position-qty"
      name="addPositionQty"
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
    id="add-position-slider"
    label={$_("positionsList.addSliderLabel")}
    value={percent}
    min={new Decimal(0)}
    max={new Decimal(100)}
    step={PERCENT_STEP}
    {marks}
    {disabled}
    tone="accent"
    formatValue={(v) => `${v.toDecimalPlaces(0)}%`}
    onChange={(v) => onChange(addQuantityFromPercent(ctx, v))}
  />

  <!-- What the position becomes. An estimate, and labelled as one. -->
  <div class="text-[10px] font-mono flex flex-col gap-0.5">
    <p class="text-[var(--text-secondary)]">
      {$_("positionsList.resultingSize")}: {resultingSizeText}
    </p>
    <p class={shiftTone}>
      {$_("positionsList.newAverageEntry")}: {newEntryText}
      {#if shiftText}<span class="opacity-80">({shiftText})</span>{/if}
    </p>
    <p class="text-[var(--text-secondary)] opacity-70">
      {$_("positionsList.previewOnlyHint")}
    </p>
  </div>
</div>
