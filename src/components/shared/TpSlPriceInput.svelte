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
  TP/SL trigger-price entry — FEAT-0254.

  A `RangeSlider`, a target field in the active mode's units (By PnL / By ROI /
  By Change) and the resulting trigger price, over `src/lib/calculators/tpsl.ts`.

  **One source of truth: `price`.** The slider position and the target field are
  both *derived* from it, and editing either one computes a new price and hands
  it back through `onChange`. There is no second copy of the value to drift, so
  "what the slider shows" and "what gets submitted" cannot disagree — which is
  the FEAT-0011 displayed-state discipline applied inside a single component.

  **The three modes share one bound.** `TP_MAX_ROI_PERCENT` / `SL_MAX_ROI_PERCENT`
  are expressed in ROI, and the PnL and Change modes convert that same bound
  into their own units. Dragging the handle fully right therefore means the same
  trade in every mode, and switching tabs leaves the handle roughly where it
  was instead of jumping.
-->

<script lang="ts">
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";
  import type { TranslationKey } from "../../locales/schema";
  import RangeSlider from "./RangeSlider.svelte";
  import {
    priceFromChangePercent,
    changePercentFromPrice,
    priceFromRoiPercent,
    roiPercentFromPrice,
    priceFromPnl,
    pnlFromPrice,
    netPnlFromPrice,
    netRoiPercentFromPrice,
    roundToTick,
    type TpSlContext,
    type FeeRates,
  } from "../../lib/calculators/tpsl";

  type Mode = "PNL" | "ROI" | "CHANGE";

  /*
   * How far the sliders reach, in ROI percent.
   *
   * The stop-loss bound is the interesting one: a -100% ROI is the entire
   * posted margin, i.e. liquidation, so a stop slider that reaches it offers
   * a "stop" that cannot protect anything. The reference UI stops at 75%
   * (IDEA-0199 — its SL slider is marked 0/15/30/45/60/75 against the TP
   * slider's 0/30/60/90/120/150), and these mirror that.
   *
   * Both are leverage-independent by construction: ROI already has leverage
   * folded in, so 75% means the same fraction-of-margin at 5x and at 125x.
   */
  const TP_MAX_ROI_PERCENT = new Decimal(150);
  const SL_MAX_ROI_PERCENT = new Decimal(75);
  /** Slider granularity in ROI percent — one arrow-key press. */
  const ROI_STEP_PERCENT = new Decimal("0.5");
  /** Where the labelled marks sit, as a fraction of the bound. */
  const MARK_FRACTIONS = [0, 0.2, 0.4, 0.6, 0.8, 1];

  interface Props {
    /** The position this plan protects — entry, leverage, side, size. */
    ctx: TpSlContext;
    /** A take-profit reaches further than a stop and is coloured differently. */
    kind: "TP" | "SL";
    /** Instrument tick size, for rounding the emitted price. */
    tickSize: Decimal;
    /** Current trigger price. The single source of truth. */
    price: Decimal;
    /**
     * Fee rates for the after-fees readout. Omit when no rate is known — the
     * net line is then hidden rather than computed with zeros, which would
     * print net and gross as equal and read as "this trade costs nothing".
     */
    fees?: FeeRates;
    disabled?: boolean;
    /** Always receives a tick-rounded price. */
    onChange: (price: Decimal) => void;
  }

  let { ctx, kind, tickSize, price, fees, disabled = false, onChange }: Props = $props();

  let mode = $state<Mode>("ROI");

  /*
   * A take-profit is a favourable move (positive in the calculator's signed
   * convention), a stop is an adverse one. The slider itself always runs
   * 0..max as a magnitude — a trader setting a stop thinks "5% loss", not
   * "-5% gain" — and this is where that magnitude gets its sign back.
   */
  const sign = $derived(kind === "TP" ? new Decimal(1) : new Decimal(-1));
  const maxRoi = $derived(kind === "TP" ? TP_MAX_ROI_PERCENT : SL_MAX_ROI_PERCENT);

  /** The active mode's value for the current price, as a signed quantity. */
  const signedModeValue = $derived.by(() => {
    if (mode === "ROI") return roiPercentFromPrice(ctx, price);
    if (mode === "CHANGE") return changePercentFromPrice(ctx, price);
    return pnlFromPrice(ctx, price);
  });

  /** Same value as the slider sees it: an unsigned magnitude. */
  const sliderValue = $derived(signedModeValue.times(sign));

  /** The shared ROI bound, converted into the active mode's units. */
  const sliderMax = $derived.by(() => {
    if (mode === "ROI") return maxRoi;
    const priceAtMax = priceFromRoiPercent(ctx, maxRoi.times(sign));
    if (mode === "CHANGE") return changePercentFromPrice(ctx, priceAtMax).times(sign);
    return pnlFromPrice(ctx, priceAtMax).times(sign);
  });

  /** Ditto for the step, so every mode has the same number of positions. */
  const sliderStep = $derived.by(() => {
    if (maxRoi.lte(0)) return ROI_STEP_PERCENT;
    return sliderMax.times(ROI_STEP_PERCENT).div(maxRoi);
  });

  /** Turns a slider magnitude back into a tick-rounded trigger price. */
  function priceForSliderValue(magnitude: Decimal): Decimal {
    const signed = magnitude.times(sign);
    const raw =
      mode === "ROI"
        ? priceFromRoiPercent(ctx, signed)
        : mode === "CHANGE"
          ? priceFromChangePercent(ctx, signed)
          : priceFromPnl(ctx, signed);
    return roundToTick(raw, tickSize);
  }

  const marks = $derived(
    MARK_FRACTIONS.map((fraction) => {
      const at = sliderMax.times(fraction);
      return {
        at,
        label: mode === "PNL" ? at.toDecimalPlaces(2).toString() : `${at.toDecimalPlaces(0)}%`,
      };
    }),
  );

  const modeUnit = $derived(mode === "PNL" ? "USDT" : "%");

  /*
   * Readout figures, prepared here rather than in the template — the same
   * rule that keeps computation out of an `{#each}` body applies to a line
   * that recomputes on every drag frame.
   */
  /*
   * `toFixed` rather than `toDecimalPlaces`: the latter drops trailing zeros,
   * so a gross "-10" would sit directly above a net "-10.11" and the two
   * would not line up as the comparison they are meant to be. Editable fields
   * keep the unpadded form — padding a value someone is about to type over is
   * a different mistake.
   */
  const money = (v: Decimal) => v.toFixed(2);

  const grossRoi = $derived(money(roiPercentFromPrice(ctx, price)));
  const grossChange = $derived(money(changePercentFromPrice(ctx, price)));
  const grossPnl = $derived(money(pnlFromPrice(ctx, price)));
  const netRoi = $derived(fees ? money(netRoiPercentFromPrice(ctx, price, fees)) : null);
  const netPnl = $derived(fees ? money(netPnlFromPrice(ctx, price, fees)) : null);

  /*
   * The label key is spelled out per tab rather than interpolated. A template
   * literal would defeat `TranslationKey`, which is what catches a renamed or
   * missing string at check time instead of rendering the key itself on screen.
   */
  const modeTabs: Array<{ id: Mode; labelKey: TranslationKey }> = [
    { id: "PNL", labelKey: "dashboard.tpslManager.byPnl" },
    { id: "ROI", labelKey: "dashboard.tpslManager.byRoi" },
    { id: "CHANGE", labelKey: "dashboard.tpslManager.byChange" },
  ];

  /*
   * The two text fields are edited as strings, not Decimals: a half-typed
   * "1." or "-" is not a number, and reformatting the field on every
   * keystroke fights the person typing into it. They commit on blur and on
   * Enter, and until then the slider keeps showing the committed value.
   */
  let priceDraft = $state<string | null>(null);
  let targetDraft = $state<string | null>(null);

  const priceDisplay = $derived(priceDraft ?? price.toString());
  const targetDisplay = $derived(
    targetDraft ?? sliderValue.toDecimalPlaces(mode === "PNL" ? 2 : 2).toString(),
  );

  function commitPrice() {
    const draft = priceDraft;
    priceDraft = null;
    if (draft === null || draft.trim() === "") return;
    try {
      const parsed = new Decimal(draft);
      if (!parsed.isFinite() || parsed.lte(0)) return;
      onChange(roundToTick(parsed, tickSize));
    } catch {
      // Not a number — drop it and fall back to the committed value.
    }
  }

  function commitTarget() {
    const draft = targetDraft;
    targetDraft = null;
    if (draft === null || draft.trim() === "") return;
    try {
      const parsed = new Decimal(draft);
      if (!parsed.isFinite()) return;
      onChange(priceForSliderValue(parsed));
    } catch {
      // Not a number — drop it and fall back to the committed value.
    }
  }

  function onFieldKey(event: KeyboardEvent, commit: () => void) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      priceDraft = null;
      targetDraft = null;
    }
  }
</script>

<div class="flex flex-col gap-2 w-full">
  <!-- Mode selector -->
  <div
    class="flex gap-1 text-[10px] font-bold"
    role="tablist"
    aria-label={$_("dashboard.tpslManager.calcMode")}
  >
    {#each modeTabs as tab (tab.id)}
      <button
        type="button"
        role="tab"
        {disabled}
        aria-selected={mode === tab.id}
        onclick={() => {
          mode = tab.id;
          targetDraft = null;
        }}
        class="px-2 py-1 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        class:bg-accent-paired={mode === tab.id}
        class:text-[var(--text-secondary)]={mode !== tab.id}
        class:hover-bg-accent-paired={mode !== tab.id}
      >
        {$_(tab.labelKey)}
      </button>
    {/each}
  </div>

  <!-- Target in the active mode's units -->
  <div class="flex items-center gap-2">
    <label
      for="tpsl-target-{kind}"
      class="text-[10px] font-bold text-[var(--text-secondary)] shrink-0 w-20"
    >
      {kind === "TP"
        ? $_("dashboard.tpslManager.targetProfit")
        : $_("dashboard.tpslManager.targetLoss")}
    </label>
    <div class="relative flex-1">
      <input
        id="tpsl-target-{kind}"
        name="tpslTarget{kind}"
        type="text"
        inputmode="decimal"
        {disabled}
        value={targetDisplay}
        oninput={(e) => (targetDraft = e.currentTarget.value)}
        onblur={commitTarget}
        onkeydown={(e) => onFieldKey(e, commitTarget)}
        class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded
               p-1.5 pr-12 text-xs text-[var(--text-primary)] disabled:opacity-50"
      />
      <span
        class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)]"
      >
        {modeUnit}
      </span>
    </div>
  </div>

  <RangeSlider
    id="tpsl-slider-{kind}"
    label={kind === "TP"
      ? $_("dashboard.tpslManager.tpSliderLabel")
      : $_("dashboard.tpslManager.slSliderLabel")}
    value={sliderValue}
    min={new Decimal(0)}
    max={sliderMax}
    step={sliderStep}
    {marks}
    {disabled}
    tone={kind === "TP" ? "success" : "danger"}
    formatValue={(v) => `${v.toDecimalPlaces(2)} ${modeUnit}`}
    onChange={(v) => onChange(priceForSliderValue(v))}
  />

  <!-- Resulting trigger price — the value actually submitted -->
  <div class="flex items-center gap-2">
    <label
      for="tpsl-trigger-{kind}"
      class="text-[10px] font-bold text-[var(--text-secondary)] shrink-0 w-20"
    >
      {$_("dashboard.tpslManager.triggerPrice")}
    </label>
    <input
      id="tpsl-trigger-{kind}"
      name="tpslTrigger{kind}"
      type="text"
      inputmode="decimal"
      {disabled}
      value={priceDisplay}
      oninput={(e) => (priceDraft = e.currentTarget.value)}
      onblur={commitPrice}
      onkeydown={(e) => onFieldKey(e, commitPrice)}
      class="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded
             p-1.5 text-xs font-mono text-[var(--text-primary)] disabled:opacity-50"
    />
  </div>

  <!--
    Cross-mode readout: the same trigger stated the other two ways, so
    switching tabs is not needed just to see them.

    The net line is the honest half. The slider is gross — it has to be, since
    a trigger is a price and the price must be the one the exchange gets — but
    gross is optimistic on *both* legs at once: it understates what a stop
    really costs and overstates what a target really pays, which makes the
    R:R a trader actually decides on wrong twice over in the same direction.
    Showing net beside it is what stops that being invisible, without letting
    an estimated fee rate move the order itself.
  -->
  <div class="text-[10px] font-mono flex flex-col gap-0.5">
    <p class="text-[var(--text-secondary)]">
      {$_("dashboard.tpslManager.grossBeforeFees")}: {grossRoi}% ROI ·
      {grossChange}% · {grossPnl} USDT
    </p>
    {#if netRoi !== null && netPnl !== null}
      <p class="text-[var(--text-primary)]">
        {$_("dashboard.tpslManager.netAfterFees")}: {netRoi}% ROI · {netPnl} USDT
      </p>
    {/if}
  </div>
</div>
