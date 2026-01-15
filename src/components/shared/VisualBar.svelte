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

  const WIDTH = 1000;
  const BAR_H = 6;
</script>

<div class="visual-bar-container">
  {#if entryPrice !== null && stopLossPrice !== null}
    {@const furthestPrice =
      tradeType === "long"
        ? Math.max(entryPrice, ...safeTargets.map((t) => t.price || 0))
        : Math.min(entryPrice, ...safeTargets.map((t) => t.price || 1e12))}
    {@const totalDiff = Math.abs(furthestPrice - stopLossPrice)}
    {@const isReady = totalDiff > 0}

    {#if isReady}
      {@const getX = (p: number) =>
        (Math.abs(p - stopLossPrice) / totalDiff) * 100}
      {@const entryX = getX(entryPrice)}
      {@const tpData = safeTargets
        .map((t, i) => {
          if (!t.price) return null;
          const detail = safeCalculatedTpDetails.find((d) => d.index === i);
          return {
            idx: i + 1,
            x: getX(t.price),
            rr: detail?.riskRewardRatio
              ? detail.riskRewardRatio.toFixed(1)
              : "0.0",
          };
        })
        .filter((t) => t !== null)}

      <div class="visual-bar-content">
        <!-- Labels Above Bar -->
        <div class="labels-top">
          {#each tpData as tp}
            <div class="tp-label" style="left: {tp.x}%">
              <span class="tp-name">TP{tp.idx}</span>
              <span class="tp-rr">{tp.rr}R</span>
            </div>
          {/each}
          <div class="entry-label-top" style="left: {entryX}%">
            {$_("dashboard.visualBar.entry")}
          </div>
        </div>

        <!-- The Bar -->
        <div class="bar-row">
          <div class="bar-track">
            <!-- Risk Area -->
            <div
              class="bar-segment risk"
              style="left: 0; width: {entryX}%"
            ></div>
            <!-- Profit Area -->
            <div
              class="bar-segment profit"
              style="left: {entryX}%; width: {100 - entryX}%"
            ></div>

            <!-- Markers -->
            <div class="marker sl" style="left: 0"></div>
            <div class="marker entry" style="left: {entryX}%"></div>
            {#each tpData as tp}
              <div class="marker tp" style="left: {tp.x}%"></div>
            {/each}
          </div>
        </div>

        <!-- Labels Below Bar -->
        <div class="labels-bottom">
          <div class="sl-label">SL</div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .visual-bar-container {
    width: 100%;
    height: 40px;
    margin: 1rem 0;
    position: relative;
    user-select: none;
  }

  .visual-bar-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
  }

  .labels-top {
    height: 14px;
    position: relative;
    width: 100%;
  }

  .tp-label {
    position: absolute;
    transform: translateX(-50%) translateY(-2px);
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.1;
  }

  .tp-name {
    font-size: 12px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .tp-rr {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .entry-label-top {
    position: absolute;
    transform: translateX(-50%) translateY(-2px);
    font-size: 12px;
    font-weight: 800;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .bar-row {
    height: 14px;
    display: flex;
    align-items: center;
    position: relative;
    margin: 1px 0;
  }

  .bar-track {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
    position: relative;
  }

  .bar-segment {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 3px;
  }

  .bar-segment.risk {
    background: var(--danger-color);
  }

  .bar-segment.profit {
    background: var(--success-color);
  }

  .marker {
    position: absolute;
    top: -4px;
    height: 14px;
    width: 3.5px;
    background: white;
    transform: translateX(-50%);
    border-radius: 1.5px;
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.6);
    z-index: 2;
  }

  .marker.sl {
    background: #cbd5e1;
    left: 0 !important;
  }

  .labels-bottom {
    height: 12px;
    position: relative;
    width: 100%;
  }

  .sl-label {
    position: absolute;
    left: 0;
    font-size: 13px;
    font-weight: 900;
    color: var(--text-secondary);
    transform: translateY(2px);
  }
</style>
