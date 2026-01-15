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

  // Pixel-perfekte Vorgaben
  const WIDTH = 1000;
  const BAR_H = 8; // Exakt 8px laut Vorgabe
  const HEIGHT = 40;
  const BAR_Y = 20;

  const furthestPrice = $derived.by(() => {
    if (entryPrice === null || stopLossPrice === null) return null;
    const prices = [entryPrice];
    safeTargets.forEach((t) => {
      if (t.price) prices.push(t.price);
    });
    return tradeType === "long" ? Math.max(...prices) : Math.min(...prices);
  });

  const isReady = $derived(
    entryPrice !== null &&
      stopLossPrice !== null &&
      furthestPrice !== null &&
      entryPrice !== stopLossPrice,
  );

  const totalDiff = $derived(
    isReady ? Math.abs(furthestPrice! - stopLossPrice!) : 1,
  );

  const getX = (price: number | null | undefined | Decimal) => {
    if (
      !isReady ||
      price === null ||
      price === undefined ||
      stopLossPrice === null
    )
      return 0;
    const p = price instanceof Decimal ? price.toNumber() : price;
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
</script>

<div class="visual-bar-wrapper">
  <div class="visual-bar-card">
    <div class="header-content">
      <div class="title-section">
        <span class="sl-tag">SL</span>
        <span class="main-title">{$_("dashboard.visualBar.header")}</span>
      </div>

      <!-- TP Labels: Spread relative to their position -->
      <div class="tp-markers-row">
        {#each tpData as tp}
          <div class="tp-marker" style="left: {(tp.x / WIDTH) * 100}%">
            <span class="tp-id">TP{tp.idx}</span>
            <span class="tp-rr-value">{tp.rr}R</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- The 8px Bar -->
    <div class="svg-container">
      <svg
        viewBox="0 0 {WIDTH} {HEIGHT}"
        preserveAspectRatio="none"
        class="svg-bar"
      >
        {#if isReady}
          <!-- Track -->
          <rect
            x="0"
            y={BAR_Y - BAR_H / 2}
            width={WIDTH}
            height={BAR_H}
            rx="2"
            fill="rgba(255,255,255,0.05)"
          />

          <!-- Risk Zone (Red) -->
          <rect
            x="0"
            y={BAR_Y - BAR_H / 2}
            width={entryX}
            height={BAR_H}
            rx="2"
            fill="var(--danger-color)"
          />

          <!-- Profit Zone (Green) -->
          <rect
            x={entryX}
            y={BAR_Y - BAR_H / 2}
            width={WIDTH - entryX}
            height={BAR_H}
            rx="2"
            fill="var(--success-color)"
          />

          <!-- Vertical Lines (White) -->
          <line
            x1="0"
            x2="0"
            y1={BAR_Y - 8}
            y2={BAR_Y + 8}
            stroke="white"
            stroke-width="2"
          />
          <line
            x1={entryX}
            x2={entryX}
            y1={BAR_Y - 8}
            y2={BAR_Y + 8}
            stroke="white"
            stroke-width="2"
          />
          {#each tpData as tp}
            <line
              x1={tp.x}
              x2={tp.x}
              y1={BAR_Y - 8}
              y2={BAR_Y + 8}
              stroke="white"
              stroke-width="2"
            />
          {/each}
        {/if}
      </svg>
    </div>

    <!-- Entry Footer -->
    <div class="badge-footer">
      {#if isReady}
        <div class="entry-pointer" style="left: {(entryX / WIDTH) * 100}%">
          Einstieg
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .visual-bar-wrapper {
    width: 100%;
    margin-top: 1.5rem;
    margin-bottom: 2rem;
  }

  .visual-bar-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    padding: 0.75rem 1rem; /* Schlanker Rahmen */
    border-radius: 0.5rem;
    box-shadow: var(--shadow-sm);
    position: relative;
    overflow: hidden;
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 1.25rem;
    position: relative;
    height: 28px;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    margin-bottom: 1px;
    background: var(--bg-secondary);
    padding-right: 1rem;
    z-index: 5;
  }

  .sl-tag {
    background: #1e293b;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .main-title {
    color: var(--text-secondary);
    font-size: 12px;
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
    min-width: 40px;
  }

  .tp-id {
    font-size: 11px;
    font-weight: 800;
    color: var(--text-primary);
    line-height: 1;
  }

  .tp-rr-value {
    font-size: 9px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-top: 1px;
  }

  .svg-container {
    width: 100%;
    height: 16px;
    display: flex;
    align-items: center;
  }

  .svg-bar {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }

  .badge-footer {
    position: relative;
    width: 100%;
    height: 14px;
    margin-top: 6px;
  }

  .entry-pointer {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    background: #1e293b;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    white-space: nowrap;
  }
</style>
