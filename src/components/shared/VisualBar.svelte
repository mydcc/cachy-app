<script lang="ts">
  import { _ } from "../../locales/i18n";
  import type { IndividualTpResult } from "../../stores/types";
  import { tradeStore } from "../../stores/tradeStore";

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
</script>

<div class="visual-bar-card">
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

      <!-- Header Row -->
      <div class="header-row">
        <div class="left-section">
          <span class="sl-badge">SL</span>
          <span class="title">{$_("dashboard.visualBar.header")}</span>
        </div>
        <div class="tp-labels">
          {#each tpData as tp}
            <div class="tp-item" style="left: {tp.x}%">
              <div class="tp-name">TP{tp.idx}</div>
              <div class="tp-rr">{tp.rr}R</div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Bar -->
      <div class="bar-container">
        <div class="bar-track">
          <div class="bar-fill risk" style="width: {entryX}%"></div>
          <div
            class="bar-fill profit"
            style="left: {entryX}%; width: {100 - entryX}%"
          ></div>
        </div>
        <!-- Markers -->
        <div class="marker" style="left: 0"></div>
        <div class="marker" style="left: {entryX}%"></div>
        {#each tpData as tp}
          <div class="marker" style="left: {tp.x}%"></div>
        {/each}
      </div>

      <!-- Entry Label Below -->
      <div class="footer-row">
        <div class="entry-label" style="left: {entryX}%">
          {$_("dashboard.visualBar.entry")}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .visual-bar-card {
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 12px;
    margin: 1rem 0;
    height: 40px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    height: 16px;
    position: relative;
  }

  .left-section {
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 10;
  }

  .sl-badge {
    background: rgba(30, 41, 59, 0.8);
    color: #94a3b8;
    font-size: 11px;
    font-weight: 900;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .title {
    color: #94a3b8;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tp-labels {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 100%;
    pointer-events: none;
  }

  .tp-item {
    position: absolute;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .tp-name {
    font-size: 11px;
    font-weight: 800;
    color: var(--text-primary);
    line-height: 1;
  }

  .tp-rr {
    font-size: 9px;
    font-weight: 700;
    color: var(--text-secondary);
    line-height: 1;
  }

  .bar-container {
    height: 6px;
    position: relative;
    margin: 2px 0;
  }

  .bar-track {
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
    position: relative;
    overflow: hidden;
  }

  .bar-fill {
    position: absolute;
    top: 0;
    height: 100%;
  }

  .bar-fill.risk {
    left: 0;
    background: var(--danger-color);
  }

  .bar-fill.profit {
    background: var(--success-color);
  }

  .marker {
    position: absolute;
    top: -3px;
    width: 3px;
    height: 12px;
    background: white;
    transform: translateX(-50%);
    border-radius: 1px;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  }

  .footer-row {
    height: 12px;
    position: relative;
  }

  .entry-label {
    position: absolute;
    transform: translateX(-50%);
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    background: rgba(30, 41, 59, 0.8);
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    white-space: nowrap;
  }
</style>
