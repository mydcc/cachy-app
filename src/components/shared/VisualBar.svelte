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

  // SVG Dimension Settings
  const WIDTH = 1000;
  const HEIGHT = 40;
  const BAR_Y = 20;
  const BAR_H = 12;
  const PADDING_X = 0; // Use container padding for the bar

  // Determine the full range of the visualization: from SL to the furthest TP
  const furthestTpPrice = $derived.by(() => {
    if (safeTargets.length === 0) return entryPrice;
    const prices = safeTargets
      .map((t) => t.price)
      .filter((p): p is number => p !== null);
    if (prices.length === 0) return entryPrice;
    // For Long: max TP. For Short: min TP.
    return tradeType === "long" ? Math.max(...prices) : Math.min(...prices);
  });

  const isReady = $derived(
    entryPrice !== null &&
      stopLossPrice !== null &&
      furthestTpPrice !== null &&
      Math.abs(furthestTpPrice - stopLossPrice) > 0,
  );

  const totalRange = $derived(
    isReady ? Math.abs(furthestTpPrice! - stopLossPrice!) : 1,
  );

  // Helper to get X position in percentage (0 to 100)
  const getXPercent = (price: number | null | undefined | Decimal) => {
    if (
      !isReady ||
      price === null ||
      price === undefined ||
      stopLossPrice === null
    )
      return 0;
    const p = price instanceof Decimal ? price.toNumber() : price;
    const dist = Math.abs(p - stopLossPrice);
    return (dist / totalRange) * 100;
  };

  const tpData = $derived(
    safeTargets
      .map((t, i) => {
        if (!t.price) return null;
        const detail = safeCalculatedTpDetails.find((d) => d.index === i);
        return {
          idx: i + 1,
          price: t.price,
          x: getXPercent(t.price),
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

  const entryX = $derived(getXPercent(entryPrice));
</script>

<div class="visual-bar-wrapper mt-6">
  <div class="visual-bar-container glass-panel">
    <!-- Header Row -->
    <div class="header-row">
      <div class="left-group">
        <div class="sl-badge">SL</div>
        <h3 class="title">{$_("dashboard.visualBar.header")}</h3>
      </div>

      <!-- TP Labels absolute positioned above the bar -->
      <div class="tp-labels-container">
        {#each tpData as tp}
          <div class="tp-label-item" style="left: {tp.x}%">
            <span class="tp-name">TP{tp.idx}</span>
            <span class="tp-rr">{tp.rr}R</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- The Progress Bar (SVG) -->
    <div class="bar-view relative">
      <svg
        viewBox="0 0 {WIDTH} {HEIGHT}"
        preserveAspectRatio="none"
        class="w-full h-full overflow-visible"
      >
        {#if isReady}
          <!-- Background / Empty Bar -->
          <rect
            x="0"
            y={BAR_Y - BAR_H / 2}
            width={WIDTH}
            height={BAR_H}
            fill="var(--bg-tertiary)"
            rx="4"
          />

          <!-- Risk Segment (Red: SL to Entry) -->
          <rect
            x="0"
            y={BAR_Y - BAR_H / 2}
            width={(entryX / 100) * WIDTH}
            height={BAR_H}
            fill="var(--danger-color)"
            rx="4"
          />

          <!-- Profit Segment (Green: Entry to end) -->
          <rect
            x={(entryX / 100) * WIDTH}
            y={BAR_Y - BAR_H / 2}
            width={WIDTH - (entryX / 100) * WIDTH}
            height={BAR_H}
            fill="var(--success-color)"
            rx="4"
          />

          <!-- Vertical Separators (White Lines) -->
          <!-- SL Marker -->
          <line
            x1="0"
            x2="0"
            y1={BAR_Y - 10}
            y2={BAR_Y + 10}
            stroke="white"
            stroke-width="2"
          />

          <!-- Entry Marker -->
          <line
            x1={(entryX / 100) * WIDTH}
            x2={(entryX / 100) * WIDTH}
            y1={BAR_Y - 10}
            y2={BAR_Y + 10}
            stroke="white"
            stroke-width="2"
          />

          <!-- TP Markers -->
          {#each tpData as tp}
            <line
              x1={(tp.x / 100) * WIDTH}
              x2={(tp.x / 100) * WIDTH}
              y1={BAR_Y - 10}
              y2={BAR_Y + 10}
              stroke="white"
              stroke-width="2"
            />
          {/each}
        {/if}
      </svg>
    </div>
  </div>

  <!-- Bottom Badge (Einstieg) -->
  <div class="footer-row relative h-6 mt-1">
    {#if isReady}
      <div class="entry-badge" style="left: {entryX}%">Einstieg</div>
    {/if}
  </div>
</div>

<style>
  .visual-bar-wrapper {
    width: 100%;
  }

  .visual-bar-container {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    padding: 1.25rem 1.25rem 0.75rem 1.25rem;
    border-radius: 0.75rem;
    box-shadow: var(--shadow-sm);
    position: relative;
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 1.5rem;
    height: 32px;
    position: relative;
  }

  .left-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
    z-index: 10;
  }

  .sl-badge {
    background: #2c3440;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 5px;
    border-radius: 4px;
    letter-spacing: 0.5px;
    border: 1px solid var(--border-color);
  }

  .title {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
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
    min-width: 50px;
    text-align: center;
  }

  .tp-name {
    font-size: 11px;
    font-weight: 800;
    color: var(--text-primary);
    line-height: 1;
  }

  .tp-rr {
    font-size: 9px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-top: 1px;
  }

  .bar-view {
    width: 100%;
    height: 16px;
  }

  .footer-row {
    width: 100%;
    position: relative;
    padding: 0 1.25rem;
    box-sizing: border-box;
  }

  .entry-badge {
    position: absolute;
    top: 4px;
    transform: translateX(-50%);
    background: #2c3440;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
    border: 1px solid var(--border-color);
  }

  svg {
    display: block;
  }
</style>
