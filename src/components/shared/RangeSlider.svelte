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
  A percentage slider over `Decimal` — FEAT-0254.

  Built on a native `<input type="range">` rather than a custom SVG or pointer
  handler, which is what buys keyboard operation (arrows, Home/End, Page
  Up/Down), touch dragging, screen-reader semantics and every OS-level
  accessibility setting for free. A hand-rolled control has to reimplement all
  of that and typically reimplements some of it.

  The native element is float-only, and this is a control for money. Rather
  than converting its float back to a `Decimal` and rounding — which loses a
  little precision on every drag and accumulates — the element is driven in
  **step indices**: it counts 0..n over whole steps, and the `Decimal` value is
  reconstructed as `min + index × step`. That is exact arithmetic, so the value
  emitted is one the caller could have written down, not a float artefact.

  The component is controlled: it derives its handle position from the `value`
  prop and never holds its own copy. A parent that ignores `onChange` gets a
  slider that does not move, which is the correct behaviour for an input whose
  value the parent may legitimately reject or clamp.
-->

<script lang="ts">
  import { Decimal } from "decimal.js";

  interface Mark {
    /** Where the mark sits, in the same units as `value`. */
    at: Decimal;
    /** What to print under it. */
    label: string;
  }

  interface Props {
    /** Current value. The component is controlled — this is the truth. */
    value: Decimal;
    min: Decimal;
    max: Decimal;
    /** Granularity of one arrow-key press or drag increment. */
    step: Decimal;
    /**
     * Labelled positions under the track. Purely a convenience: clicking one
     * jumps to it. They are deliberately *not* magnetic — a slider that
     * silently pulls a deliberately-chosen stop level onto a round number is
     * changing a financial value the trader did not change.
     */
    marks?: Mark[];
    /** Accessible name for the slider. */
    label: string;
    /** DOM id, so a caller can point a `<label for>` at it. */
    id: string;
    /** Reads the value out for screen readers, e.g. "+50%". */
    formatValue?: (v: Decimal) => string;
    /** Which semantic colour the filled part of the track takes. */
    tone?: "accent" | "success" | "danger";
    disabled?: boolean;
    onChange: (value: Decimal) => void;
  }

  let {
    value,
    min,
    max,
    step,
    marks = [],
    label,
    id,
    formatValue = (v: Decimal) => v.toString(),
    tone = "accent",
    disabled = false,
    onChange,
  }: Props = $props();

  /** Total number of discrete positions the native element counts over. */
  const stepCount = $derived(
    step.lte(0) ? 0 : max.minus(min).div(step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
  );

  /** `value` expressed as a whole step index, clamped into range. */
  const index = $derived.by(() => {
    if (step.lte(0)) return 0;
    const raw = value.minus(min).div(step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    return Math.min(Math.max(raw, 0), stepCount);
  });

  /** Exact inverse of `index` — no float ever reaches the caller. */
  function valueAt(i: number): Decimal {
    return min.plus(step.times(i));
  }

  /** Percent of the track that is filled, for the gradient. */
  const fillPercent = $derived(stepCount > 0 ? (index / stepCount) * 100 : 0);

  const toneVar = $derived(
    tone === "success"
      ? "var(--success-color)"
      : tone === "danger"
        ? "var(--danger-color)"
        : "var(--accent-color)",
  );

  function handleInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    onChange(valueAt(Number(target.value)));
  }

  function markPercent(mark: Mark): number {
    if (max.minus(min).lte(0)) return 0;
    return mark.at.minus(min).div(max.minus(min)).times(100).toNumber();
  }
</script>

<div class="flex flex-col gap-1 w-full">
  <input
    {id}
    {disabled}
    type="range"
    min="0"
    max={stepCount}
    step="1"
    value={index}
    aria-label={label}
    aria-valuetext={formatValue(value)}
    oninput={handleInput}
    class="cachy-range w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
    style="--range-tone: {toneVar}; --range-fill: {fillPercent}%;"
  />

  {#if marks.length > 0}
    <div class="relative h-4 select-none" aria-hidden="true">
      {#each marks as mark (mark.label)}
        <button
          type="button"
          {disabled}
          tabindex="-1"
          onclick={() => onChange(mark.at)}
          class="absolute top-0 -translate-x-1/2 text-[9px] leading-none px-1 py-0.5 rounded
                 text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                 disabled:cursor-not-allowed disabled:hover:text-[var(--text-secondary)]"
          style="left: {markPercent(mark)}%;"
        >
          {mark.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /*
    The track is painted with a gradient split at --range-fill so the filled
    part carries the semantic tone. Every colour is a theme variable — this
    control has to survive all 20+ themes, including the light ones.
  */
  .cachy-range {
    -webkit-appearance: none;
    appearance: none;
    height: 1.25rem;
    background: transparent;
  }

  .cachy-range::-webkit-slider-runnable-track {
    height: 0.25rem;
    border-radius: 9999px;
    background: linear-gradient(
      to right,
      var(--range-tone) 0%,
      var(--range-tone) var(--range-fill),
      var(--bg-tertiary) var(--range-fill),
      var(--bg-tertiary) 100%
    );
  }

  .cachy-range::-moz-range-track {
    height: 0.25rem;
    border-radius: 9999px;
    background: linear-gradient(
      to right,
      var(--range-tone) 0%,
      var(--range-tone) var(--range-fill),
      var(--bg-tertiary) var(--range-fill),
      var(--bg-tertiary) 100%
    );
  }

  .cachy-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 0.75rem;
    height: 0.75rem;
    margin-top: -0.25rem;
    border-radius: 9999px;
    background: var(--range-tone);
    border: 2px solid var(--bg-primary);
  }

  .cachy-range::-moz-range-thumb {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 9999px;
    background: var(--range-tone);
    border: 2px solid var(--bg-primary);
  }

  /*
    Keyboard focus has to stay visible — this is the only affordance a
    keyboard user has for where the handle is.
  */
  .cachy-range:focus-visible {
    outline: 2px solid var(--range-tone);
    outline-offset: 4px;
    border-radius: 9999px;
  }
</style>
