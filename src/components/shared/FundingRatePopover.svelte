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
  import {
    computePosition,
    flip,
    shift,
    offset,
    arrow,
  } from "@floating-ui/dom";
  import { _ } from "../../locales/i18n";
  import { formatDynamicDecimal } from "../../utils/utils";
  import { fundingRateService } from "../../services/fundingRateService.svelte";
  import type { FundingRateHistoryItem } from "../../services/exchange";
  import { Decimal } from "decimal.js";

  interface Props {
    symbol: string;
    currentFundingRate?: Decimal | null;
    countdownText?: string;
    fundingInterval?: number | null;
    children?: import("svelte").Snippet;
  }

  let {
    symbol,
    currentFundingRate = null,
    countdownText = "",
    fundingInterval = 8,
    children,
  }: Props = $props();

  let visible = $state(false);
  let popoverEl: HTMLElement | undefined = $state();
  let arrowEl: HTMLElement | undefined = $state();
  let triggerEl: HTMLElement | undefined = $state();

  let normSymbol = $derived(fundingRateService.historyKey(symbol));
  let historyData = $derived(
    normSymbol ? fundingRateService.historyState[normSymbol] : undefined,
  );

  function openPopover() {
    visible = true;
    if (normSymbol) {
      fundingRateService.fetchHistory(normSymbol);
    }
  }

  function closePopover() {
    visible = false;
  }

  function togglePopover() {
    if (visible) {
      closePopover();
    } else {
      openPopover();
    }
  }

  async function updatePosition() {
    if (!triggerEl || !popoverEl || !arrowEl) return;

    try {
      const result = await computePosition(triggerEl, popoverEl, {
        placement: "top",
        middleware: [
          offset(10),
          flip(),
          shift({ padding: 8 }),
          arrow({ element: arrowEl }),
        ],
      });

      if (!result) return;
      const { x, y, placement, middlewareData } = result;

      Object.assign(popoverEl.style, {
        left: `${x}px`,
        top: `${y}px`,
      });

      const { x: arrowX, y: arrowY } = middlewareData.arrow || {};
      const side = placement.split("-")[0];

      const staticSideMap: Record<string, string> = {
        top: "bottom",
        right: "left",
        bottom: "top",
        left: "right",
      };

      const staticSide = staticSideMap[side];
      if (staticSide) {
        Object.assign(arrowEl.style, {
          left: arrowX != null ? `${arrowX}px` : "",
          top: arrowY != null ? `${arrowY}px` : "",
          [staticSide]: "-4px",
        });
      }
    } catch {
      // ignore
    }
  }

  $effect(() => {
    if (visible && triggerEl && popoverEl) {
      updatePosition();
    }
  });

  // Sparkline coordinates calculation
  interface Point {
    x: number;
    y: number;
    rate: Decimal;
    time: number;
  }

  let sparkline = $derived.by(() => {
    const items: FundingRateHistoryItem[] = historyData?.items ?? [];
    if (items.length < 2) return null;

    const width = 200;
    const height = 50;
    const padding = 6;

    let min = items[0].fundingRate;
    let max = items[0].fundingRate;

    for (const item of items) {
      if (item.fundingRate.lt(min)) min = item.fundingRate;
      if (item.fundingRate.gt(max)) max = item.fundingRate;
    }

    // Ensure zero line is in range if rates cross 0, or add small margin
    const zero = new Decimal(0);
    if (min.gt(zero)) min = zero;
    if (max.lt(zero)) max = zero;

    const range = max.minus(min);
    const rangeNum = range.isZero() ? 0.0001 : range.toNumber();

    const points: Point[] = items.map((item: FundingRateHistoryItem, index: number) => {
      const x = padding + (index / (items.length - 1)) * (width - 2 * padding);
      const frac = item.fundingRate.minus(min).toNumber() / rangeNum;
      // SVG Y is inverted (0 is top)
      const y = height - padding - frac * (height - 2 * padding);
      return { x, y, rate: item.fundingRate, time: item.fundingTime };
    });

    const pathD = points.reduce((acc: string, p: Point, i: number) => {
      return i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }, "");

    // Zero baseline Y
    const zeroFrac = zero.minus(min).toNumber() / rangeNum;
    const zeroY = height - padding - zeroFrac * (height - 2 * padding);

    return {
      width,
      height,
      points,
      pathD,
      zeroY,
      minRate: min,
      maxRate: max,
    };
  });
</script>

<div
  bind:this={triggerEl}
  class="funding-popover-container inline-flex items-center"
  role="button"
  tabindex="0"
  onmouseenter={openPopover}
  onmouseleave={closePopover}
  onfocusin={openPopover}
  onfocusout={closePopover}
  onclick={togglePopover}
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      togglePopover();
    }
  }}
>
  {#if children}
    {@render children()}
  {/if}

  {#if visible}
    <div
      bind:this={popoverEl}
      role="tooltip"
      class="funding-popover-content bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] shadow-xl rounded-lg p-3 text-xs"
    >
      <div class="flex items-center justify-between border-b border-[var(--border-color)] pb-1.5 mb-2">
        <span class="font-bold text-xs">{$_("marketOverview.fundingRateHistory")}</span>
        <span class="font-mono text-[10px] text-[var(--text-secondary)]">{symbol}</span>
      </div>

      {#if historyData?.isLoading && (!historyData.items || historyData.items.length === 0)}
        <div class="py-4 text-center text-[var(--text-secondary)]">
          {$_("marketOverview.fundingRateLoading")}
        </div>
      {:else if historyData?.error && (!historyData.items || historyData.items.length === 0)}
        <div class="py-2 text-center text-[var(--danger-color)]">
          {$_("marketOverview.fundingRateError")}
        </div>
      {:else}
        <!-- Current Rate & 7D Avg -->
        <div class="grid grid-cols-2 gap-2 mb-2">
          <div class="flex flex-col">
            <span class="text-[10px] text-[var(--text-secondary)]">{$_("marketOverview.fundingRate")}</span>
            <span
              class="font-medium text-xs"
              class:text-[var(--success-color)]={currentFundingRate && currentFundingRate.gt(0)}
              class:text-[var(--danger-color)]={currentFundingRate && currentFundingRate.lt(0)}
            >
              {currentFundingRate ? `${formatDynamicDecimal(currentFundingRate.times(100), 4)}%` : "-"}
            </span>
          </div>

          <div class="flex flex-col text-right">
            <span class="text-[10px] text-[var(--text-secondary)]">{$_("marketOverview.fundingRate7dAvg")}</span>
            <span
              class="font-medium text-xs"
              class:text-[var(--success-color)]={historyData?.avg7d && historyData.avg7d.gt(0)}
              class:text-[var(--danger-color)]={historyData?.avg7d && historyData.avg7d.lt(0)}
            >
              {historyData?.avg7d ? `${formatDynamicDecimal(historyData.avg7d.times(100), 4)}%` : "-"}
            </span>
          </div>
        </div>

        <!-- Sparkline Chart -->
        {#if sparkline}
          <div class="bg-[var(--bg-primary)] p-1 rounded border border-[var(--border-color)] mb-2 relative">
            <svg
              viewBox="0 0 {sparkline.width} {sparkline.height}"
              class="w-full h-12 overflow-visible"
            >
              <!-- Zero line -->
              <line
                x1="0"
                y1={sparkline.zeroY}
                x2={sparkline.width}
                y2={sparkline.zeroY}
                stroke="var(--border-color)"
                stroke-dasharray="2 2"
                stroke-width="1"
              />

              <!-- Sparkline Path -->
              <path
                d={sparkline.pathD}
                fill="none"
                stroke={historyData?.avg7d.gte(0) ? "var(--success-color)" : "var(--danger-color)"}
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- Last point dot -->
              {#if sparkline.points.length > 0}
                {@const lastPt = sparkline.points[sparkline.points.length - 1]}
                <circle
                  cx={lastPt.x}
                  cy={lastPt.y}
                  r="3"
                  fill={lastPt.rate.gte(0) ? "var(--success-color)" : "var(--danger-color)"}
                />
              {/if}
            </svg>
            <div class="flex justify-between text-[9px] text-[var(--text-secondary)] px-1 mt-0.5">
              <span>{$_("marketOverview.fundingRateSparklineStart")}</span>
              <span>{$_("marketOverview.fundingRateSparklineEnd")}</span>
            </div>
          </div>
        {/if}

        <!-- Next Settlement & Interval -->
        <div class="pt-1.5 border-t border-[var(--border-color)] grid grid-cols-2 gap-1 text-[10px]">
          <div>
            <span class="text-[var(--text-secondary)]">{$_("marketOverview.fundingRateNextSettlement")}: </span>
            <span class="font-mono">{countdownText || "-"}</span>
          </div>
          <div class="text-right">
            <span class="text-[var(--text-secondary)]">{$_("marketOverview.fundingRateInterval")}: </span>
            <span>{fundingInterval ?? 8}h</span>
          </div>
        </div>

        <div class="mt-1.5 text-[9px] text-[var(--text-secondary)] italic">
          {$_("marketOverview.fundingRatePredictedHint")}
        </div>
      {/if}

      <div bind:this={arrowEl} class="funding-popover-arrow"></div>
    </div>
  {/if}
</div>

<style>
  .funding-popover-container {
    position: relative;
    cursor: pointer;
  }

  .funding-popover-content {
    width: 240px;
    position: absolute;
    z-index: 100;
    left: 0;
    top: 0;
    pointer-events: auto;
  }

  .funding-popover-arrow {
    position: absolute;
    width: 8px;
    height: 8px;
    background-color: var(--bg-tertiary);
    transform: rotate(45deg);
    border: 1px solid var(--border-color);
    border-top: none;
    border-left: none;
  }
</style>
