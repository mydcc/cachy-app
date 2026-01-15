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

  // Constants for sizing
  const WIDTH = 1000;
  const HEIGHT = 40;
  const BAR_Y = 20;
  const BAR_H = 10;

  // Determine the relevant price range for the visualization
  // We want the bar to start at SL and end at the furthest target.
  const furthestPrice = $derived.by(() => {
    if (entryPrice === null || stopLossPrice === null) return null;
    const prices = [entryPrice];
    safeTargets.forEach((t) => {
      if (t.price) prices.push(t.price);
    });

    // For Long: max price. For Short: min price.
    return tradeType === "long" ? Math.max(...prices) : Math.min(...prices);
  });

  const isReady = $derived(
    entryPrice !== null &&
      stopLossPrice !== null &&
      furthestPrice !== null &&
      entryPrice !== stopLossPrice,
  );

  // Calculate the total price difference covered by the bar (SL to Furthest TP)
  const totalDiff = $derived(
    isReady ? Math.abs(furthestPrice! - stopLossPrice!) : 1,
  );

  /**
   * Translates a price to an X coordinate (0 to WIDTH)
   * where SL is always at 0 (on the left) and the furthest point is at WIDTH (on the right).
   */
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
    const x = (dist / totalDiff) * WIDTH;

    return Math.max(0, Math.min(WIDTH, x));
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
            ? detail.riskRewardRatio.toFixed(1)
            : "0.0",
        };
      })
      .filter(
        (t): t is { idx: number; price: number; x: number; rr: string } =>
          t !== null,
      ),
  );

  const entryX = $derived(getX(entryPrice));
  const slX = 0; // By definition in our scaling logic
</script>

<div class="visual-bar-outer mt-6">
  <div class="visual-bar-card glass-panel">
    <!-- Header: Label and TP Markers -->
    <div class="view-header">
      <div class="title-section">
        <span class="sl-badge">SL</span>
        <span class="view-title">{$_("dashboard.visualBar.header")}</span>
      </div>

      <!-- TP Labels absolute over the whole width of the bar part -->
      <div class="tp-markers-row">
        {#each tpData as tp}
          <div class="tp-marker" style="left: {(tp.x / WIDTH) * 100}%">
            <span class="tp-id">TP{tp.idx}</span>
            <span class="tp-rr-value">{tp.rr}R</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- The Bar itself -->
    <div class="bar-container relative">
      <svg
        viewBox="0 0 {WIDTH} {HEIGHT}"
        preserveAspectRatio="none"
        class="bar-svg"
      >
        {#if isReady}
          <!-- Base Track -->
          <rect
            x="0"
            y={BAR_Y - BAR_H / 2}
            width={WIDTH}
            height={BAR_H}
            rx={BAR_H / 2}
            fill="var(--bg-tertiary)"
          />

          <!-- Red Segment (Risk: SL to Entry) -->
          <rect
            x="0"
            y={BAR_Y - BAR_H / 2}
            width={entryX}
            height={BAR_H}
            rx={BAR_H / 2}
            fill="var(--danger-color)"
          />

          <!-- Green Segment (Profit: Entry to end) -->
          <rect
            x={entryX}
            y={BAR_Y - BAR_H / 2}
            width={Math.max(0, WIDTH - entryX)}
            height={BAR_H}
            rx={BAR_H / 2}
            fill="var(--success-color)"
          />

          <!-- White Vertical Markers -->
          <line
            x1="0"
            x2="0"
            y1={BAR_Y - 12}
            y2={BAR_Y + 12}
            stroke="white"
            stroke-width="2"
          />
          <line
            x1={entryX}
            x2={entryX}
            y1={BAR_Y - 12}
            y2={BAR_Y + 12}
            stroke="white"
            stroke-width="2"
          />
          {#each tpData as tp}
            <line
              x1={tp.x}
              x2={tp.x}
              y1={BAR_Y - 12}
              y2={BAR_Y + 12}
              stroke="white"
              stroke-width="2"
            />
          {/each}
        {/if}
      </svg>
    </div>

    <!-- Entry Label below the bar -->
    <div class="footer-labels">
      {#if isReady}
        <div class="entry-pointer" style="left: {(entryX / WIDTH) * 100}%">
          Einstieg
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .visual-bar-outer {
    width: 100%;
    margin-bottom: 3rem;
  }

  .visual-bar-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    padding: 1.25rem 1.5rem;
    border-radius: 0.75rem;
    box-shadow: var(--shadow-sm);
    position: relative;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 2rem;
    position: relative;
    height: 32px;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
    margin-bottom: 2px;
  }

  .sl-badge {
    background: #1e293b;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    letter-spacing: 0.5px;
  }

  .view-title {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .tp-markers-row {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    pointer-events: none;
  }

  .tp-marker {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 50px;
  }

  .tp-id {
    font-size: 12px;
    font-weight: 800;
    color: var(--text-primary);
    line-height: 1;
  }

  .tp-rr-value {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-top: 1px;
  }

  .bar-container {
    width: 100%;
    height: 20px;
    margin-bottom: 4px;
  }

  .bar-svg {
    width: 100%;
    height: 100%;
    overflow: visible;
    display: block;
  }

  .footer-labels {
    position: relative;
    width: 100%;
    height: 20px;
    margin-top: 8px;
  }

  .entry-pointer {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    background: #1e293b;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    white-space: nowrap;
  }
</style>
