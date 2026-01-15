<script lang="ts">
  import { _ } from "../../locales/i18n";
  import type { IndividualTpResult } from "../../stores/types";
  import { formatDynamicDecimal } from "../../utils/utils";
  import { marketStore } from "../../stores/marketStore";
  import { tradeStore } from "../../stores/tradeStore";
  import { normalizeSymbol } from "../../utils/symbolUtils";
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
  const symbol = $derived($tradeStore.symbol);

  // Live price tracking
  const livePrice = $derived.by(() => {
    if (!symbol) return null;
    const norm = normalizeSymbol(symbol, "bitunix");
    return $marketStore[norm]?.lastPrice || null;
  });

  // Break-even price
  const breakEvenPrice = $derived.by(() => {
    const be = $resultsStore.breakEvenPrice;
    if (be === "-" || !be) return null;
    // Handle cases where be might already be formatted or partial
    const cleanBe = String(be).replace(/[^\d.]/g, "");
    return cleanBe ? new Decimal(cleanBe) : null;
  });

  // SVG Scaling logic
  const PADDING = 60;
  const WIDTH = 1000;
  const HEIGHT = 100;
  const BAR_H = 8;
  const BAR_Y = 50;

  let minPrice = $state(0);
  let maxPrice = $state(0);
  let range = $state(0);
  let isReady = $state(false);

  $effect(() => {
    const allPrices = [
      entryPrice,
      stopLossPrice,
      ...safeTargets.map((t) => t.price).filter((p): p is number => p !== null),
    ];

    if (livePrice) allPrices.push(livePrice.toNumber());
    if (breakEvenPrice) allPrices.push(breakEvenPrice.toNumber());

    const filtered = allPrices.filter((p): p is number => p !== null && p > 0);
    if (filtered.length < 2) {
      isReady = false;
      return;
    }

    minPrice = Math.min(...filtered);
    maxPrice = Math.max(...filtered);
    range = maxPrice - minPrice;
    isReady = range > 0;
  });

  const getX = (price: number | null | undefined | Decimal) => {
    if (!isReady || price === null || price === undefined) return 0;
    const p = price instanceof Decimal ? price.toNumber() : price;
    const pos = (p - minPrice) / range;
    return PADDING + pos * (WIDTH - 2 * PADDING);
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
          rr: detail?.riskRewardRatio ? detail.riskRewardRatio.toFixed(2) : "",
        };
      })
      .filter(
        (t): t is { idx: number; price: number; x: number; rr: string } =>
          t !== null,
      ),
  );

  const entryX = $derived(getX(entryPrice));
  const slX = $derived(getX(stopLossPrice));
  const beX = $derived(getX(breakEvenPrice));
  const liveX = $derived(getX(livePrice));

  // Visual Helper: Entry Color logic
  const liveColor = $derived.by(() => {
    if (!livePrice || !entryPrice) return "var(--accent-color)";
    const diff =
      tradeType === "long"
        ? livePrice.toNumber() - entryPrice
        : entryPrice - livePrice.toNumber();
    return diff >= 0 ? "var(--success-color)" : "var(--danger-color)";
  });
</script>

<div class="visual-analysis-container space-y-2 mt-4">
  <div class="flex justify-between items-center mb-1">
    <div class="flex items-center gap-2">
      <span
        class="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[10px] font-bold px-1.5 py-0.5 rounded border border-[var(--border-color)]"
        >SL</span
      >
      <h3
        class="text-[var(--text-secondary)] text-xs font-bold tracking-widest uppercase"
      >
        {$_("dashboard.visualAnalysis.header") || "VISUELLE ANALYSE"}
      </h3>
    </div>
    {#if livePrice}
      <div class="text-[11px] font-bold tracking-wider">
        <span class="text-[var(--text-secondary)] uppercase">LIVE:</span>
        <span style="color: {liveColor};">{livePrice.toFixed(4)}</span>
      </div>
    {/if}
  </div>

  <div class="relative w-full h-16">
    <svg
      viewBox="0 0 {WIDTH} {HEIGHT}"
      preserveAspectRatio="xMidYMid meet"
      class="w-full h-full overflow-visible"
    >
      <!-- Horizontal Bar Background -->
      <rect
        x={PADDING}
        y={BAR_Y - BAR_H / 2}
        width={WIDTH - 2 * PADDING}
        height={BAR_H}
        rx={BAR_H / 2}
        fill="var(--bg-tertiary)"
        opacity="0.5"
      />

      {#if isReady}
        <!-- P/L Progress Line -->
        {#if livePrice && entryPrice}
          {@const x1 = Math.min(entryX, liveX)}
          {@const x2 = Math.max(entryX, liveX)}
          <rect
            x={x1}
            y={BAR_Y - BAR_H / 2}
            width={Math.max(2, x2 - x1)}
            height={BAR_H}
            rx={BAR_H / 2}
            fill={livePrice.toNumber() > entryPrice
              ? tradeType === "long"
                ? "var(--success-color)"
                : "var(--danger-color)"
              : tradeType === "long"
                ? "var(--danger-color)"
                : "var(--success-color)"}
          />
        {/if}

        <!-- Stop Loss Line -->
        {#if slX > 0}
          <line
            x1={slX}
            x2={slX}
            y1={BAR_Y - 10}
            y2={BAR_Y + 10}
            stroke="var(--danger-color)"
            stroke-width="2"
          />
          <text
            x={slX}
            y={BAR_Y - 20}
            text-anchor="middle"
            class="text-[10px] font-bold fill-[var(--danger-color)]">SL</text
          >
        {/if}

        <!-- Break Even Line -->
        {#if beX > 0}
          <line
            x1={beX}
            x2={beX}
            y1={BAR_Y - 15}
            y2={BAR_Y + 15}
            stroke="var(--text-secondary)"
            stroke-width="2"
            stroke-dasharray="2,2"
          />
          <text
            x={beX}
            y={BAR_Y + 30}
            text-anchor="middle"
            class="text-[10px] font-bold fill-[var(--text-secondary)]">BE</text
          >
        {/if}

        <!-- Take Profit Labels & Lines -->
        {#each tpData as tp}
          <line
            x1={tp.x}
            x2={tp.x}
            y1={BAR_Y - 8}
            y2={BAR_Y + 8}
            stroke="var(--success-color)"
            stroke-width="2"
          />
          <text
            x={tp.x}
            y={BAR_Y - 15}
            text-anchor="middle"
            class="text-[10px] font-bold fill-[var(--text-primary)]"
            >TP{tp.idx}</text
          >
        {/each}

        <!-- Entry Pin (Circle + Pointer) -->
        {#if entryX > 0}
          <g transform="translate({entryX}, {BAR_Y})">
            <!-- Pin Pointer -->
            <polygon points="0,0 -4,10 4,10" fill="var(--accent-color)" />
            <!-- Pin Head -->
            <circle
              cx="0"
              cy="0"
              r="4"
              fill="white"
              stroke="var(--accent-color)"
              stroke-width="2"
            />
            <!-- Label -->
            <text
              y="22"
              text-anchor="middle"
              class="text-[10px] font-bold fill-[var(--text-secondary)]"
              >Einstieg</text
            >
          </g>
        {/if}

        <!-- Live Price Indicator (Moving Dot) -->
        {#if liveX > 0}
          <circle
            cx={liveX}
            cy={BAR_Y}
            r="3"
            fill="var(--text-primary)"
            class="animate-pulse"
          />
        {/if}
      {/if}
    </svg>
  </div>
</div>

<style>
  .visual-analysis-container {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    padding: 1rem;
    border-radius: 1rem;
    box-shadow: var(--shadow-sm);
  }
</style>
