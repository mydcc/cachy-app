<script lang="ts">
  import { _ } from "../../locales/i18n";
  import type { IndividualTpResult } from "../../stores/types";
  import { tradeStore } from "../../stores/tradeStore";
  import { resultsStore } from "../../stores/resultsStore";
  import { Decimal } from "decimal.js";

  interface Props {
    entryPrice: number | null;
    stopLossPrice: number | null;
    targets: Array<{
      price: number | null;
      percent: number | null;
      isLocked: boolean;
    }>;
    calculatedTpDetails: IndividualTpResult[];
  }

  let { entryPrice, stopLossPrice, targets, calculatedTpDetails }: Props =
    $props();

  const safeTargets = $derived(targets ?? []);
  const safeCalculatedTpDetails = $derived(calculatedTpDetails ?? []);
  const tradeType = $derived($tradeStore.tradeType);

  // SVG Scaling settings
  const WIDTH = 1000;
  const HEIGHT = 80; // Total height including labels
  const BAR_Y = 45; // Y position of the horizontal bar
  const BAR_H = 12; // Height of the bar
  const PADDING_X = 40;

  let minPriceVal = $state(0);
  let maxPriceVal = $state(0);
  let totalRange = $state(1);
  let isReady = $state(false);

  // For a consistent "Risk to Reward" view:
  // We want SL at the left, and the furthest TP at the right.
  const furthestTpPrice = $derived.by(() => {
    if (safeTargets.length === 0) return entryPrice;
    const prices = safeTargets
      .map((t) => t.price)
      .filter((p): p is number => p !== null);
    if (prices.length === 0) return entryPrice;
    return tradeType === "long" ? Math.max(...prices) : Math.min(...prices);
  });

  $effect(() => {
    if (entryPrice === null || stopLossPrice === null) {
      isReady = false;
      return;
    }
    // We strictly map from SL to furthest TP
    const start = stopLossPrice;
    const end = furthestTpPrice ?? entryPrice;

    if (start === end) {
      isReady = false;
      return;
    }

    totalRange = Math.abs(end - start);
    isReady = true;
  });

  const getX = (price: number | null | undefined | Decimal) => {
    if (
      !isReady ||
      price === null ||
      price === undefined ||
      stopLossPrice === null
    )
      return 0;
    const p = price instanceof Decimal ? price.toNumber() : price;

    // Distance from SL
    const dist = Math.abs(p - stopLossPrice);
    const pos = dist / totalRange;

    return PADDING_X + pos * (WIDTH - 2 * PADDING_X);
  };

  const tpData = $derived(
    safeTargets
      .map((t, i) => {
        if (!t.price) return null;
        const detail = safeCalculatedTpDetails.find((d) => d.index === i);
        return {
          idx: i + 1,
          price: t.price,
          x: getX(t.price),
          rr: detail?.riskRewardRatio
            ? detail.riskRewardRatio.toFixed(2)
            : "0.00",
        };
      })
      .filter(
        (t): t is { idx: number; price: number; x: number; rr: string } =>
          t !== null,
      ),
  );

  const entryX = $derived(getX(entryPrice));
  const slX = $derived(getX(stopLossPrice));

  // Determine which side is red/green based on long/short
  const slLeft = $derived(tradeType === "long" ? slX : slX); // Just for clarity
  // In a long: SL < Entry < TP. In a short: SL > Entry > TP.
  // The scaling (min/max) handles the direction, but the "red zone" is always between SL and Entry.
</script>

<div class="visual-bar-container glass-panel">
  <!-- Header with SL Badge and TPs -->
  <div class="header-row">
    <div class="left-group">
      <div class="sl-badge">SL</div>
      <h3 class="title">{$_("dashboard.visualBar.header")}</h3>
    </div>

    <div class="tp-labels">
      {#each tpData as tp}
        <div class="tp-label-item" style="left: {tp.x / 10}%">
          <span class="tp-name">TP{tp.idx}</span>
          <span class="tp-rr">{tp.rr}R</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- SVG Bar -->
  <div class="svg-wrapper">
    <svg
      viewBox="0 0 {WIDTH} {HEIGHT}"
      preserveAspectRatio="none"
      class="w-full h-full"
    >
      {#if isReady}
        <!-- Base Bar Background -->
        <rect
          x={PADDING_X}
          y={BAR_Y - BAR_H / 2}
          width={WIDTH - 2 * PADDING_X}
          height={BAR_H}
          fill="var(--bg-tertiary)"
          rx="2"
        />

        <!-- Red Segment (Risk: SL to Entry) -->
        <rect
          x={PADDING_X}
          y={BAR_Y - BAR_H / 2}
          width={entryX - PADDING_X}
          height={BAR_H}
          fill="var(--danger-color)"
          opacity="1"
          rx="2"
        />

        <!-- Green Segment (Profit: Entry to Furthest TP) -->
        <rect
          x={entryX}
          y={BAR_Y - BAR_H / 2}
          width={Math.max(0, WIDTH - PADDING_X - entryX)}
          height={BAR_H}
          fill="var(--success-color)"
          opacity="1"
          rx="2"
        />

        <!-- Vertical Markers (White Lines) -->
        <!-- Stop Loss (at start) -->
        <line
          x1={PADDING_X}
          x2={PADDING_X}
          y1={BAR_Y - 14}
          y2={BAR_Y + 14}
          stroke="white"
          stroke-width="2"
        />

        <!-- Entry -->
        <line
          x1={entryX}
          x2={entryX}
          y1={BAR_Y - 14}
          y2={BAR_Y + 14}
          stroke="white"
          stroke-width="2"
        />

        <!-- Take Profits -->
        {#each tpData as tp}
          <line
            x1={tp.x}
            x2={tp.x}
            y1={BAR_Y - 14}
            y2={BAR_Y + 14}
            stroke="white"
            stroke-width="2"
          />
        {/each}
      {/if}
    </svg>

    <!-- "Einstieg" Badge positioned absolutely below entryX -->
    {#if isReady && entryX > 0}
      <div class="entry-badge" style="left: {entryX / 10}%">Einstieg</div>
    {/if}
  </div>
</div>

<style>
  .visual-bar-container {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    padding: 1rem 1.25rem;
    border-radius: 0.75rem;
    box-shadow: var(--shadow-sm);
    margin-top: 1.5rem;
    position: relative;
    overflow: hidden;
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    position: relative;
    height: 30px;
  }

  .left-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .sl-badge {
    background: #334155;
    color: var(--blue-100);
    font-size: 11px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.5px;
  }

  .title {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .tp-labels {
    position: absolute;
    left: 0;
    right: 0;
    top: -5px;
    height: 100%;
    pointer-events: none;
  }

  .tp-label-item {
    position: absolute;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 60px;
  }

  .tp-name {
    font-size: 12px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .tp-rr {
    font-size: 10px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-top: -2px;
  }

  .svg-wrapper {
    position: relative;
    width: 100%;
    height: 40px;
  }

  .entry-badge {
    position: absolute;
    bottom: -15px;
    transform: translateX(-50%);
    background: #334155;
    color: var(--blue-100);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  /* Ensure the SVG scales correctly */
  svg {
    display: block;
    overflow: visible;
  }
</style>
