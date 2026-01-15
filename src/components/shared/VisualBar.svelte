<script lang="ts">
  import { _ } from "../../locales/i18n";
  import type { IndividualTpResult } from "../../stores/types";
  import { tradeStore } from "../../stores/tradeStore";
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

  // SVG Dimension Settings
  const WIDTH = 1000;
  const HEIGHT = 50;
  const BAR_Y = 25;
  const BAR_H = 12;

  // Compute the full visible range of the bar
  const priceRange = $derived.by(() => {
    if (entryPrice === null || stopLossPrice === null) return null;
    const prices = [entryPrice, stopLossPrice];
    safeTargets.forEach((t) => {
      if (t.price) prices.push(t.price);
    });
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return max > min ? { min, max } : null;
  });

  const isReady = $derived(priceRange !== null);

  // Unified Scaling: SL is ALWAYS 0, furthest TP/Price is ALWAYS WIDTH
  const getX = (price: number | null | undefined | Decimal) => {
    if (!isReady || price === null || price === undefined || !priceRange)
      return 0;
    const p = price instanceof Decimal ? price.toNumber() : price;

    const totalDist = priceRange.max - priceRange.min;
    const pos = (p - priceRange.min) / totalDist;

    // Flip the scale for Short so SL (which is max price) is at X=0
    const x = tradeType === "long" ? pos * WIDTH : (1 - pos) * WIDTH;
    return Math.max(0, Math.min(WIDTH, x)); // Clamp to bounds
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
  const slX = $derived(getX(stopLossPrice)); // Will reliably be 0 or 1000 depending on flip

  // Since we flip the scale, Red is always between SL (which becomes 0) and Entry
  const riskX = $derived(Math.min(slX, entryX));
  const riskW = $derived(Math.max(2, Math.abs(entryX - slX)));

  // Profit Segment is everything else
  const profitX = $derived(entryX);
  const profitW = $derived(Math.max(2, WIDTH - entryX));
</script>

<div class="visual-bar-wrapper mt-8">
  <div class="visual-bar-container glass-panel">
    <!-- Header Row -->
    <div class="header-row">
      <div class="left-group">
        <div class="sl-badge">SL</div>
        <h3 class="title">
          {$_("dashboard.visualBar.header") || "VISUELLE ANALYSE"}
        </h3>
      </div>

      <div class="tp-labels-container">
        {#each tpData as tp}
          <div class="tp-label-item" style="left: {(tp.x / WIDTH) * 100}%">
            <span class="tp-name">TP{tp.idx}</span>
            <span class="tp-rr">{tp.rr}R</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- The Progress Bar -->
    <div class="bar-view relative">
      <svg
        viewBox="0 0 {WIDTH} {HEIGHT}"
        preserveAspectRatio="none"
        class="w-full h-full overflow-visible"
      >
        {#if isReady}
          <!-- Background -->
          <rect
            x="0"
            y={BAR_Y - BAR_H / 2}
            width={WIDTH}
            height={BAR_H}
            fill="var(--bg-tertiary)"
            rx="4"
          />

          <!-- Risk Segment (Red) -->
          <rect
            x={riskX}
            y={BAR_Y - BAR_H / 2}
            width={riskW}
            height={BAR_H}
            fill="var(--danger-color)"
            rx="2"
          />

          <!-- Profit Segment (Green) -->
          <rect
            x={profitX}
            y={BAR_Y - BAR_H / 2}
            width={profitW}
            height={BAR_H}
            fill="var(--success-color)"
            rx="2"
          />

          <!-- Markers -->
          <line
            x1={slX}
            x2={slX}
            y1={BAR_Y - 14}
            y2={BAR_Y + 14}
            stroke="white"
            stroke-width="2"
          />
          <line
            x1={entryX}
            x2={entryX}
            y1={BAR_Y - 14}
            y2={BAR_Y + 14}
            stroke="white"
            stroke-width="2"
          />
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
    </div>
  </div>

  <!-- Footer Row -->
  <div class="footer-row">
    {#if isReady}
      <div class="entry-badge" style="left: {(entryX / WIDTH) * 100}%">
        Einstieg
      </div>
    {/if}
  </div>
</div>

<style>
  .visual-bar-wrapper {
    width: 100%;
    margin-bottom: 2rem;
  }

  .visual-bar-container {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    padding: 1.5rem 1.25rem 1rem 1.25rem;
    border-radius: 0.75rem;
    box-shadow: var(--shadow-sm);
    position: relative;
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 1.75rem;
    height: 36px;
    position: relative;
  }

  .left-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    z-index: 10;
  }

  .sl-badge {
    background: #2c3440;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.5px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .title {
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .tp-labels-container {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 100%;
    pointer-events: none;
  }

  .tp-label-item {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 60px;
    text-align: center;
  }

  .tp-name {
    font-size: 13px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .tp-rr {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-top: 1px;
  }

  .bar-view {
    width: 100%;
    height: 20px;
  }

  .footer-row {
    width: 100%;
    position: relative;
    padding: 0 1.25rem;
    height: 24px;
    margin-top: 0.5rem;
  }

  .entry-badge {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    background: #2c3440;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 4px;
    white-space: nowrap;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  svg {
    display: block;
  }
</style>
