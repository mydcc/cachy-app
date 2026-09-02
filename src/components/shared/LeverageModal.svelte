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
  FEAT-0328 — set the leverage for one symbol.

  Collect, then confirm. Nothing in here sends: the slider, the steppers and
  the field all move a local draft, and only `onconfirm` hands a value to the
  caller. A stray drag can therefore never reach the exchange, which is the
  whole reason the control is shaped this way.

  The banner states a verified fact, not a reassurance: Bitunix documents no
  precondition on `change_leverage` (docs/bitunix-api/02_account.md), so
  leverage really is adjustable with an open position and resting orders —
  unlike margin mode and position mode next door.

  What this deliberately does NOT show is a maximum position size field.
  Deriving one would mean multiplying available balance by leverage, which
  ignores the venue's tiered position limits — at high leverage the real cap
  is far below that product. A maximum the exchange would refuse is misleading
  on a money screen. The liquidation projection below is shown instead:
  it is the consequence that actually decides whether a leverage is sane, and
  it is calibrated against the venue's own reported numbers rather than a
  guessed maintenance-margin rate.
-->

<script lang="ts">
  import { untrack } from "svelte";
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";
  import { formatDynamicDecimal } from "../../utils/utils";
  import { projectLiquidation } from "../../lib/calculators/liquidation";
  import ModalFrame from "./ModalFrame.svelte";

  interface Props {
    /** The value to seed the draft with — the exchange's, or the local one. */
    current: string;
    minLeverage: number;
    maxLeverage: number;
    /** True while there is no broker value to change; nothing travels then. */
    localOnly: boolean;
    /** Disables confirm while a request is in flight. */
    busy: boolean;
    /**
     * The open position on this symbol, when there is one. These are the
     * store's own `Decimal`s (`stores/account.svelte.ts`), not strings — the
     * prices never travel through a string here, so nothing can round on the
     * way in.
     */
    position?: {
      entryPrice: Decimal;
      liquidationPrice: Decimal;
      leverage: Decimal;
    };
    /** Margin mode: ISOLATION (show projection) or CROSS (show warning). */
    marginMode?: string;
    onclose: () => void;
    onconfirm: (leverage: Decimal) => void;
  }

  let {
    current,
    minLeverage,
    maxLeverage,
    localOnly,
    busy,
    position,
    marginMode,
    onclose,
    onconfirm,
  }: Props = $props();

  /*
   * Seeded once, from the prop. Nothing writes it afterwards but the user —
   * a WebSocket push that moves the exchange's leverage mid-edit must not
   * overwrite what is being typed.
   */
  let draft = $state(untrack(() => current));

  const parsed = $derived.by(() => {
    const raw = draft.trim();
    if (raw === "") return null;
    try {
      const d = new Decimal(raw);
      return d.isFinite() && d.isInteger() && d.gt(0) ? d : null;
    } catch {
      return null;
    }
  });

  const inRange = $derived(
    parsed !== null && parsed.gte(minLeverage) && parsed.lte(maxLeverage),
  );

  const reason = $derived.by(() => {
    if (parsed === null) return $_("exchange.accountSettings.leverageNeedsValue");
    if (!inRange)
      return $_("exchange.accountSettings.leverageRange", {
        values: { min: minLeverage, max: maxLeverage },
      });
    return "";
  });

  /** Slider position, clamped so an unparseable draft does not throw it. */
  const sliderValue = $derived(
    parsed !== null && inRange ? parsed.toNumber() : minLeverage,
  );

  /** Five evenly spaced marks, ends included — the scale, not a decoration. */
  const ticks = $derived.by(() => {
    const span = maxLeverage - minLeverage;
    if (span <= 0) return [minLeverage];
    return [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(minLeverage + span * f));
  });

  const projection = $derived.by(() => {
    const p = position;
    const next = parsed;
    if (!p) return null;
    if (next === null || !inRange) return null;

    return projectLiquidation(p.entryPrice, p.liquidationPrice, p.leverage, next);
  });

  function nudge(by: number) {
    const base = parsed ?? new Decimal(minLeverage);
    const next = base.plus(by);
    if (next.lt(minLeverage) || next.gt(maxLeverage)) return;
    draft = next.toString();
  }

  function onSlide(e: Event) {
    draft = (e.currentTarget as HTMLInputElement).value;
  }

  function confirm() {
    if (parsed === null || !inRange || busy) return;
    onconfirm(parsed);
  }
</script>

<ModalFrame title={$_("exchange.accountSettings.leverageEdit")} {onclose} isOpen={true}>
  <div class="flex flex-col gap-3 p-4 min-w-[300px]">
    <!-- A verified fact, not reassurance — see the header comment. -->
    <p class="note-info" data-track-id="note-leverage-anytime">
      {$_("exchange.accountSettings.leverageAnytime")}
    </p>

    <div class="stepper">
      <button
        type="button"
        class="stepper-btn"
        data-track-id="btn-leverage-minus"
        aria-label={$_("exchange.accountSettings.leverageDecrease")}
        onclick={() => nudge(-1)}>−</button
      >
      <input
        id="leverage-popover-input"
        type="text"
        inputmode="numeric"
        class="stepper-value"
        aria-label={$_("exchange.accountSettings.leverageEdit")}
        data-track-id="input-leverage-popover"
        bind:value={draft}
      />
      <button
        type="button"
        class="stepper-btn"
        data-track-id="btn-leverage-plus"
        aria-label={$_("exchange.accountSettings.leverageIncrease")}
        onclick={() => nudge(1)}>+</button
      >
    </div>

    <div class="flex flex-col gap-1">
      <input
        type="range"
        min={minLeverage}
        max={maxLeverage}
        step="1"
        value={sliderValue}
        oninput={onSlide}
        data-track-id="slider-leverage"
        aria-label={$_("exchange.accountSettings.leverageEdit")}
        class="w-full accent-[var(--accent-color)] cursor-pointer"
      />
      <div class="flex justify-between text-[10px] text-[var(--text-tertiary)]">
        {#each ticks as tick}
          <span>{tick}x</span>
        {/each}
      </div>
    </div>

    {#if projection && (marginMode === undefined || marginMode.toLowerCase().startsWith("isolat"))}
      <!--
        The consequence, live, while the slider moves. Labelled an estimate
        because that is what it is. Only shown for Isolated-Margin, where the
        model (single position's entry/liq/leverage triple) is exact.
      -->
      <div class="flex flex-col gap-0.5" data-track-id="leverage-liquidation">
        <div class="flex justify-between text-xs">
          <span class="text-[var(--text-secondary)]"
            >{$_("exchange.accountSettings.liquidationEstimate")}</span
          >
          <span class="font-mono">
            <span class="text-[var(--text-tertiary)]"
              >{formatDynamicDecimal(projection.from)}</span
            >
            <span class="text-[var(--text-tertiary)]">→</span>
            <span
              class={projection.tighter
                ? "text-[var(--warning-color)]"
                : "text-[var(--text-primary)]"}
              >{formatDynamicDecimal(projection.to)}</span
            >
          </span>
        </div>
        <p class="text-[10px] text-[var(--text-tertiary)]">
          {$_("exchange.accountSettings.liquidationEstimateNote")}
        </p>
      </div>
    {/if}

    {#if localOnly}
      <p class="text-xs text-[var(--warning-color)]">
        {$_("exchange.accountSettings.leverageLocalOnly")}
      </p>
    {/if}

    <div class="flex gap-2 justify-end">
      <button
        type="button"
        onclick={onclose}
        disabled={busy}
        data-track-id="btn-leverage-cancel"
        class="px-3 py-1.5 text-xs rounded border border-[var(--border-color)]
               text-[var(--text-secondary)] disabled:opacity-50"
      >
        {$_("common.cancel")}
      </button>
      <button
        type="button"
        onclick={confirm}
        disabled={busy || reason !== ""}
        title={reason || undefined}
        data-track-id="btn-leverage-apply"
        class="px-3 py-1.5 text-xs rounded font-bold bg-accent-paired
               disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? $_("exchange.accountSettings.pending") : $_("common.confirm")}
      </button>
    </div>
  </div>
</ModalFrame>

<style>
  .note-info {
    padding: 0.5rem 0.625rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background-color: var(--bg-tertiary);
    font-size: 0.6875rem;
    line-height: 1.4;
    color: var(--text-secondary);
  }

  .stepper {
    display: flex;
    align-items: center;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
    background-color: var(--bg-primary);
  }
  .stepper-btn {
    width: 2.5rem;
    padding: 0.5rem 0;
    font-size: var(--text-lg);
    color: var(--text-secondary);
    transition: color 0.15s ease;
  }
  .stepper-btn:hover {
    color: var(--accent-color);
  }
  .stepper-value {
    flex: 1;
    min-width: 0;
    padding: 0.5rem 0;
    text-align: center;
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);
  }
</style>
