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
    return new Decimal(be.replace(/[^\d.]/g, ""));
  });

  // SVG Scaling logic (Slimified)
  const PADDING = 60;
  const WIDTH = 1000;
  const HEIGHT = 100; // Reduced height
  const BAR_H = 8; // Exactly 8px
  const BAR_Y = 50; // Centered

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
  const liveX = $derived(getX(livePrice));
  const beX = $derived(getX(breakEvenPrice));

  // Determine profit/loss direction
  const isLong = $derived(tradeType === "long");
  const riskStart = $derived(isLong ? Math.min(slX, entryX) : entryX);
  const riskWidth = $derived(Math.abs(slX - entryX));
  const rewardStart = $derived(
    isLong ? entryX : Math.min(tpData[tpData.length - 1]?.x ?? entryX, entryX),
  );
  const rewardWidth = $derived(
    Math.abs((tpData[tpData.length - 1]?.x ?? entryX) - entryX),
  );
</script>

<section
  class="visual-bar-container md:col-span-2 glass-panel rounded-xl border border-[var(--border-color)] overflow-hidden"
>
  <div
    class="visual-header flex items-center justify-between px-4 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/50"
  >
    <div class="flex items-center gap-2">
      <div class="sl-tag">SL</div>
      <span class="header-title">{$_("dashboard.visualBar.header")}</span>
    </div>
    {#if livePrice}
      <div class="flex items-center gap-2 text-sm font-mono">
        <span class="text-[var(--text-secondary)]">LIVE:</span>
        <span class="text-[var(--accent-color)] font-bold"
          >{formatDynamicDecimal(livePrice, 2)}</span
        >
      </div>
    {/if}
  </div>

  <div class="relative w-full aspect-[1000/100] p-0">
    {#if isReady}
      <svg
        viewBox="0 0 {WIDTH} {HEIGHT}"
        class="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <!-- Main Horizontal Track -->
        <rect
          x="0"
          y={BAR_Y}
          width={WIDTH}
          height={BAR_H}
          fill="var(--bg-tertiary)"
          rx="4"
        />

        <!-- Risk Bar (Red) -->
        <rect
          x={riskStart}
          y={BAR_Y}
          width={riskWidth}
          height={BAR_H}
          fill="var(--danger-color)"
          opacity="0.85"
          class="transition-all duration-300"
        />

        <!-- Reward Bar (Green) -->
        <rect
          x={rewardStart}
          y={BAR_Y}
          width={rewardWidth}
          height={BAR_H}
          fill="var(--success-color)"
          opacity="0.85"
          class="transition-all duration-300"
        />

        <!-- Break-Even Line -->
        {#if beX > 0}
          <line
            x1={beX}
            y1={BAR_Y - 15}
            x2={beX}
            y2={BAR_Y + 25}
            stroke="var(--warning-color)"
            stroke-width="2"
            stroke-dasharray="4,4"
            class="transition-all duration-300"
          />
          <text
            x={beX}
            y={BAR_Y - 22}
            text-anchor="middle"
            fill="var(--warning-color)"
            font-size="14"
            font-weight="900">BE</text
          >
        {/if}

        <!-- Entry Marker -->
        <g
          class="transition-all duration-300"
          transform="translate({entryX}, 0)"
        >
          <line
            x1="0"
            y1={BAR_Y - 10}
            x2="0"
            y2={BAR_Y + 18}
            stroke="var(--text-primary)"
            stroke-width="4"
          />
          <text
            y={BAR_Y + 38}
            text-anchor="middle"
            fill="var(--text-primary)"
            font-size="14"
            font-weight="bold">Einstieg</text
          >
        </g>

        <!-- SL Marker -->
        <g class="transition-all duration-300" transform="translate({slX}, 0)">
          <line
            x1="0"
            y1={BAR_Y - 10}
            x2="0"
            y2={BAR_Y + 18}
            stroke="var(--danger-color)"
            stroke-width="3"
          />
          <text
            y={BAR_Y - 22}
            text-anchor="middle"
            fill="var(--danger-color)"
            font-size="16"
            font-weight="900">SL</text
          >
        </g>

        <!-- TP Markers -->
        {#each tpData as tp}
          <g
            class="transition-all duration-300"
            transform="translate({tp.x}, 0)"
          >
            <line
              x1="0"
              y1={BAR_Y - 10}
              x2="0"
              y2={BAR_Y + 18}
              stroke="var(--success-color)"
              stroke-width="3"
            />
            <text
              y={BAR_Y - 22}
              text-anchor="middle"
              fill="var(--text-primary)"
              font-size="16"
              font-weight="900">TP{tp.idx}</text
            >
            <text
              y={BAR_Y - 42}
              text-anchor="middle"
              fill="var(--text-secondary)"
              font-size="13"
              font-weight="bold">{tp.rr}R</text
            >
          </g>
        {/each}

        <!-- Live Price Marker (Pulse) -->
        {#if liveX > 0}
          <g
            class="transition-all duration-500"
            transform="translate({liveX}, 0)"
          >
            <circle
              cx="0"
              cy={BAR_Y + 4}
              r="7"
              fill="var(--accent-color)"
              stroke="white"
              stroke-width="2"
              filter="url(#glow)"
            />
            <path
              d="M-6 {BAR_Y + 12} L6 {BAR_Y + 12} L0 {BAR_Y + 22} Z"
              fill="var(--accent-color)"
            />
          </g>
        {/if}
      </svg>
    {:else}
      <div
        class="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm italic"
      >
        {$_("dashboard.promptForData")}
      </div>
    {/if}
  </div>
</section>

<style>
  .visual-bar-container {
    margin-top: 1rem;
    margin-bottom: 0.5rem;
    position: relative;
    transition: all var(--transition-smooth);
    background-color: transparent !important;
  }

  .visual-header {
    height: 38px;
  }

  .sl-tag {
    background-color: var(--bg-tertiary);
    color: var(--text-secondary);
    font-size: 0.8rem;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    border: 1px solid var(--border-color);
  }

  .header-title {
    color: var(--text-secondary);
    font-size: 0.9rem;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  svg {
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
  }

  svg g,
  svg rect,
  svg line,
  svg circle {
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  text {
    user-select: none;
    pointer-events: none;
    font-family:
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      "Helvetica Neue",
      Arial,
      sans-serif;
  }
</style>
