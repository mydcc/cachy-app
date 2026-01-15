<script lang="ts">
  import { _ } from "../../locales/i18n";
  import type { IndividualTpResult } from "../../stores/types";
  import { formatDynamicDecimal } from "../../utils/utils";

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

  let isValidData = $state(false);

  // Computed style variables
  let riskWidth = $state(0);
  let rewardWidth = $state(0);
  let riskLeft = $state(0);
  let rewardLeft = $state(0);
  let entryPos = $state(0);
  let slPos = $state(0);
  let tpPositions: Array<{ pos: number; label: string; subLabel: string }> =
    $state([]);

  $effect(() => {
    isValidData = !!(
      entryPrice &&
      stopLossPrice &&
      targets.length > 0 &&
      targets[targets.length - 1].price
    );

    if (isValidData && entryPrice && stopLossPrice) {
      // Calculate Min/Max range (Price Axis)
      const allPrices = [
        entryPrice,
        stopLossPrice,
        ...targets.map((t) => t.price).filter((p): p is number => p !== null),
      ];
      const minPrice = Math.min(...allPrices);
      const maxPrice = Math.max(...allPrices);
      const range = maxPrice - minPrice;

      // Helper to get % position (0 to 100)
      const getPos = (price: number) => {
        if (range === 0) return 50;
        // Add 2% padding on each side to prevent markers being cut off
        const rawPos = ((price - minPrice) / range) * 96 + 2;
        return Math.max(0, Math.min(100, rawPos));
      };

      entryPos = getPos(entryPrice);
      slPos = getPos(stopLossPrice);

      // Risk Bar (Red): Always connects SL and Entry
      // Left is the minimum of SL/Entry pos, Width is the distance
      riskLeft = Math.min(slPos, entryPos);
      riskWidth = Math.abs(slPos - entryPos);

      // Reward Bar (Green): Connects Entry and Last TP
      // We find the furthest TP from Entry in the profit direction?
      // Actually, usually it just spans from Entry to the Max TP (for Long) or Min TP (for Short).
      // Let's assume the bar goes from Entry to the Last Target (furthest).
      const lastTpPrice = targets[targets.length - 1].price as number;
      const lastTpPos = getPos(lastTpPrice);

      rewardLeft = Math.min(entryPos, lastTpPos);
      rewardWidth = Math.abs(lastTpPos - entryPos);

      // TP Markers
      tpPositions = targets
        .map((t, i) => {
          if (t.price) {
            const detail = calculatedTpDetails.find((d) => d.index === i);
            const rrText = detail
              ? `${detail.riskRewardRatio.toFixed(2)}R`
              : "";
            return {
              pos: getPos(t.price),
              label: `TP${i + 1}`,
              subLabel: rrText,
            };
          }
          return null;
        })
        .filter(
          (p): p is { pos: number; label: string; subLabel: string } =>
            p !== null,
        );
    }
  });
</script>

<section class="visual-bar-container md:col-span-2">
  <!-- Header -->
  <div class="visual-header">
    <div class="flex items-center">
      <!-- SL Tag (Visual Anchor) -->
      <div class="sl-tag">SL</div>
      <span class="header-title ml-3">{$_("dashboard.visualBar.header")}</span>
    </div>

    <!-- TP Labels in Header -->
    <div class="tp-labels-container">
      {#each tpPositions as tp}
        <div class="tp-label-group" style="left: {tp.pos}%;">
          <div class="tp-name">{tp.label}</div>
          <div class="tp-rr">{tp.subLabel}</div>
        </div>
      {/each}
    </div>
  </div>

  <!-- The Bar Track -->
  <div class="bar-track">
    {#if isValidData}
      <!-- Risk Segment (Red) -->
      <div
        class="bar-segment risk-bar"
        style="left: {riskLeft}%; width: {riskWidth}%;"
      ></div>

      <!-- Reward Segment (Green) -->
      <div
        class="bar-segment reward-bar"
        style="left: {rewardLeft}%; width: {rewardWidth}%;"
      ></div>

      <!-- Markers -->
      <!-- SL Marker -->
      <div class="marker" style="left: {slPos}%;"></div>

      <!-- Entry Marker -->
      <div class="marker" style="left: {entryPos}%;"></div>

      <!-- TP Markers -->
      {#each tpPositions as tp}
        <div class="marker" style="left: {tp.pos}%;"></div>
      {/each}
    {:else}
      <div class="text-center text-xs text-[var(--text-secondary)] py-1">
        {$_("dashboard.promptForData")}
      </div>
    {/if}
  </div>

  <!-- Footer Labels -->
  <div class="visual-footer">
    {#if isValidData}
      <!-- Entry Label -->
      <div class="footer-tag entry-tag" style="left: {entryPos}%;">
        Einstieg
      </div>
    {/if}
  </div>
</section>

<style>
  .visual-bar-container {
    /* No background here, just layout */
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
    position: relative;
  }

  .visual-header {
    background-color: var(--bg-tertiary); /* Dark container background */
    border-top-left-radius: 0.5rem;
    border-top-right-radius: 0.5rem;
    padding: 0.5rem 1rem; /* Adjust padding */
    transition: background var(--transition-smooth);
    position: relative;
    height: 48px; /* Fixed height for consistent layout */
    display: flex;
    align-items: center;
    /* Ensure TP labels don't overflow horizontally if at edges */
    overflow: hidden;
  }

  .sl-tag {
    background-color: var(--bg-secondary); /* Or a specific grey */
    color: var(--text-secondary);
    font-size: 0.7rem;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    border: 1px solid var(--border-color);
  }

  .header-title {
    color: var(--text-secondary);
    font-size: 0.8rem;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tp-labels-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none; /* Let clicks pass through */
  }

  .tp-label-group {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    transition: left var(--transition-smooth);
    /* Ensure distinct text color */
  }

  .tp-name {
    color: var(--text-primary);
    font-size: 0.75rem;
    font-weight: bold;
    line-height: 1;
  }

  .tp-rr {
    color: var(--text-secondary);
    font-size: 0.65rem;
    line-height: 1;
    margin-top: 2px;
  }

  .bar-track {
    background-color: var(
      --bg-tertiary
    ); /* Continue the dark bg? Or distinct? Image looks like one block */
    /* If image is one block, header and bar track share background. */
    /* Let's extend the bg-tertiary to cover everything */
    position: relative;
    height: 24px; /* Container for the 10px bar + spacing */
    width: 100%;
    /* No border radius top (connected to header) */
    border-bottom-left-radius: 0.5rem;
    border-bottom-right-radius: 0.5rem;
    padding: 0 1rem; /* Same padding as header */
  }

  /* Override container to be a single card look */
  .visual-bar-container {
    background-color: transparent;
  }
  .visual-header {
    border-bottom: none; /* Seamless connection */
  }
  .bar-track {
    /* This contains the actual bar */
    display: flex;
    align-items: center; /* Center bar vertically */
  }

  .bar-segment {
    position: absolute;
    height: 10px; /* Explicit constraint */
    top: 50%;
    transform: translateY(-50%);
    transition:
      left var(--transition-smooth),
      width var(--transition-smooth);
    /* border-radius: 2px; Optional */
  }

  .risk-bar {
    background-color: var(--danger-color, #ef4444);
    /* Rounded left edge if it's the start? Logic-dependent. simple borders for now */
  }

  .reward-bar {
    background-color: var(--success-color, #22c55e);
  }

  .marker {
    position: absolute;
    height: 14px; /* Slightly taller than bar */
    width: 2px;
    background-color: white;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 10;
    transition: left var(--transition-smooth);
  }

  .visual-footer {
    position: relative;
    height: 20px;
    margin-top: -8px; /* Pull up to overlap/connect */
    /* Or just put it below */
    margin-top: 4px;
  }

  .footer-tag {
    position: absolute;
    transform: translateX(-50%);
    background-color: var(--bg-tertiary); /* Tag background */
    transition: left var(--transition-smooth);
    color: var(--text-primary);
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    white-space: nowrap;
  }
</style>
