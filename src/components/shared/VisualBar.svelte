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

<script lang="ts">
  import { _ } from "../../locales/i18n";
  import type { IndividualTpResult } from "../../stores/types";

  import { tradeState } from "../../stores/trade.svelte";
  import { parseDecimal } from "../../utils/utils";

  interface Props {
    entryPrice: string | null;
    stopLossPrice: string | null;
    targets: Array<{
      price: string | null;
      percent: string | null;
      isLocked: boolean;
    }>;
    calculatedTpDetails: IndividualTpResult[];
  }

  let { entryPrice, stopLossPrice, targets, calculatedTpDetails }: Props =
    $props();

  const safeTargets = $derived(targets ?? []);
  const safeCalculatedTpDetails = $derived(calculatedTpDetails ?? []);
  const tradeType = $derived(tradeState.tradeType);

  // Derived numerical values for visualization
  const entryNum = $derived(
    entryPrice ? parseDecimal(entryPrice).toNumber() : null,
  );
  const slNum = $derived(
    stopLossPrice ? parseDecimal(stopLossPrice).toNumber() : null,
  );
</script>

<div class="visual-bar-card">
  {#if entryNum !== null && slNum !== null}
    {@const isValid = (p: number) =>
      tradeType === "long" ? p > entryNum : p < entryNum}

    {@const validPrices = safeTargets
      .map((t) => (t.price ? parseDecimal(t.price).toNumber() : null))
      .filter((p): p is number => p !== null && isValid(p))}

    {@const furthestPrice =
      validPrices.length > 0
        ? tradeType === "long"
          ? Math.max(entryNum, ...validPrices)
          : Math.min(entryNum, ...validPrices)
        : entryNum}

    {@const totalDiff = Math.abs(furthestPrice - slNum)}
    {@const isReady = totalDiff > 0}

    {#if isReady}
      {@const getX = (p: number) => (Math.abs(p - slNum) / totalDiff) * 100}
      {@const entryX = getX(entryNum)}
      {@const tpData = safeTargets
        .map((t, i) => {
          if (!t.price) return null;
          const priceNum = parseDecimal(t.price).toNumber();
          if (!isValid(priceNum)) return null;

          const detail = safeCalculatedTpDetails.find((d) => d.index === i);
          return {
            idx: i + 1,
            x: getX(priceNum),
            rr: detail?.riskRewardRatio
              ? detail.riskRewardRatio.toFixed(1)
              : "0.0",
          };
        })
        .filter((t) => t !== null)}

      <!-- Header: 24px -->
      <div class="header-section">
        <div class="header-left">
          <span class="sl-badge">{$_("dashboard.visualBar.sl")}</span>
          <span class="title">{$_("dashboard.visualBar.header")}</span>
        </div>
        <div class="tp-container">
          {#each tpData as tp}
            <div class="tp-label" style="left: {tp.x}%">
              <div class="tp-name">{$_("dashboard.visualBar.tp")}{tp.idx}</div>
              <div class="tp-rr">{tp.rr}{$_("dashboard.visualBar.riskUnit")}</div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Spacer: 8px -->
      <div class="spacer-top"></div>

      <!-- Bar: 16px -->
      <div class="bar-section">
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

      <!-- Spacer: 8px -->
      <div class="spacer-bottom"></div>

      <!-- Footer: 16px -->
      <div class="footer-section">
        <div class="entry-label" style="left: {entryX}%">
          {$_("dashboard.visualBar.entry")}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .visual-bar-card {
    background: color-mix(in srgb, var(--bg-tertiary), transparent 20%);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0.75rem 1rem; /* Standard card padding */
    margin: 1.5rem 0; /* Standard vertical margin */
    height: 80px; /* Increased from 40px */
  }

  /* Header Section: 24px */
  .header-section {
    height: 24px;
    position: relative;
    display: flex;
    align-items: flex-start;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 10;
    position: relative;
  }

  .sl-badge {
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 900;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    line-height: 1;
  }

  .title {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1;
  }

  .tp-container {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 100%;
    pointer-events: none;
  }

  .tp-label {
    position: absolute;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .tp-name {
    font-size: 12px;
    font-weight: 800;
    color: var(--text-primary);
    line-height: 1;
  }

  .tp-rr {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-secondary);
    line-height: 1;
  }

  /* Spacers for breathing room */
  .spacer-top,
  .spacer-bottom {
    height: 8px;
  }

  /* Bar Section: 16px */
  .bar-section {
    height: 16px;
    position: relative;
    display: flex;
    align-items: center;
  }

  .bar-track {
    width: 100%;
    height: 10px; /* Actual bar height */
    background: color-mix(in srgb, var(--text-primary), transparent 95%);
    border-radius: 4px;
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
    top: 50%;
    transform: translate(-50%, -50%);
    width: 4px;
    height: 20px; /* Taller for visibility */
    background: white;
    border-radius: 2px;
    box-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
    z-index: 5;
  }

  /* Footer Section: 16px */
  .footer-section {
    height: 16px;
    position: relative;
    display: flex;
    align-items: center;
  }

  .entry-label {
    position: absolute;
    transform: translateX(-50%);
    font-size: 10px;
    font-weight: 700;
    color: var(--text-secondary);
    background: var(--bg-primary);
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid var(--border-color);
    white-space: nowrap;
    line-height: 1;
  }
</style>
