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
  import { createEventDispatcher, onDestroy } from "svelte";
  import { computePosition, flip, shift, offset, arrow, autoUpdate } from "@floating-ui/dom";

  interface Props {
    data?: {
    date: string;
    pnl: number;
    count: number;
    winCount?: number;
    lossCount?: number;
    bestSymbol?: string;
    bestSymbolPnl?: number;
  }[];
    year?: number;
  }

  let { data = [], year = new Date().getFullYear() }: Props = $props();

  const dispatch = createEventDispatcher();

  // Helpers
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  function getDaysInMonth(m: number, y: number) {
    return new Date(y, m + 1, 0).getDate();
  }

  function getFirstDayOfMonth(m: number, y: number) {
    // 0 = Sun, 1 = Mon ...
    return new Date(y, m, 1).getDay();
  }

  // Map data to easy lookup
  let dataMap = $derived(data.reduce((acc, d) => {
    acc[d.date] = d;
    return acc;
  }, {} as Record<string, { date: string; pnl: number; count: number; winCount?: number; lossCount?: number; bestSymbol?: string; bestSymbolPnl?: number }>));

  function getColor(dateStr: string) {
    const entry = dataMap[dateStr];
    if (!entry) return "var(--bg-tertiary)";

    if (entry.pnl > 0) return "var(--success-color)";
    if (entry.pnl < 0) return "var(--danger-color)";
    return "var(--text-secondary)";
  }

  function getOpacity(dateStr: string) {
    const entry = dataMap[dateStr];
    if (!entry) return 1;
    return 0.8;
  }

  function formatDate(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(
      2,
      "0"
    )}`;
  }

  function calculateMonthStats(mIndex: number, y: number) {
    let totalPnl = 0;
    let totalTrades = 0;
    const days = getDaysInMonth(mIndex, y);
    for (let d = 1; d <= days; d++) {
      const dateStr = formatDate(y, mIndex, d);
      const entry = dataMap[dateStr];
      if (entry) {
        totalPnl += entry.pnl;
        totalTrades += entry.count;
      }
    }
    return { totalPnl, totalTrades };
  }

  function handleDayClick(dateStr: string) {
    dispatch("click", { date: dateStr });
  }

  type DataEntry = NonNullable<Props["data"]>[number];

  let hoveredEntry = $state<DataEntry | null>(null);
  let hoveredDateStr = $state<string>("");
  let tooltipVisible = $state(false);
  let tooltipEl = $state<HTMLElement>();
  let arrowEl = $state<HTMLElement>();
  let cleanupAutoUpdate: (() => void) | null = null;
  let rAFId: number | null = null;

  async function updateTooltipPosition(triggerEl: HTMLElement) {
    if (!triggerEl || !tooltipEl || !arrowEl) return;
    try {
      const result = await computePosition(
        triggerEl,
        tooltipEl,
        {
          placement: "top",
          strategy: "fixed",
          middleware: [
            offset(10),
            flip(),
            shift({ padding: 5 }),
            arrow({ element: arrowEl }),
          ],
        },
      );
      if (!result || !tooltipEl || !arrowEl) return;
      const { x, y, placement, middlewareData } = result;
      Object.assign(tooltipEl.style, {
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
          right: "",
          bottom: "",
          [staticSide]: "-5px",
        });

        arrowEl.style.transform = `rotate(45deg)`;
        const border = "1px solid var(--border-color, #334155)";
        const arrowBorders: Record<string, Record<string, string>> = {
          top: { borderRight: border, borderBottom: border, borderLeft: "none", borderTop: "none" },
          bottom: { borderTop: border, borderLeft: border, borderRight: "none", borderBottom: "none" },
          left: { borderTop: border, borderRight: border, borderLeft: "none", borderBottom: "none" },
          right: { borderBottom: border, borderLeft: border, borderRight: "none", borderTop: "none" },
        };
        const borders = arrowBorders[side];
        if (borders) {
          Object.assign(arrowEl.style, borders);
        }
      }
      tooltipEl.style.opacity = "1";
    } catch (e) {
      console.error("Failed to update tooltip position:", e);
    }
  }

  function handleMouseEnter(event: MouseEvent, entry: DataEntry | undefined, dateStr: string) {
    hoveredEntry = entry ?? null;
    hoveredDateStr = dateStr;
    tooltipVisible = true;
    if (rAFId !== null) cancelAnimationFrame(rAFId);
    rAFId = requestAnimationFrame(() => {
      rAFId = null;
      const triggerEl = event.target as HTMLElement;
      updateTooltipPosition(triggerEl);
      if (cleanupAutoUpdate) cleanupAutoUpdate();
      if (tooltipEl) {
        cleanupAutoUpdate = autoUpdate(triggerEl, tooltipEl, () => {
          updateTooltipPosition(triggerEl);
        });
      }
    });
  }

  function handleMouseLeave() {
    if (rAFId !== null) {
      cancelAnimationFrame(rAFId);
      rAFId = null;
    }
    if (cleanupAutoUpdate) {
      cleanupAutoUpdate();
      cleanupAutoUpdate = null;
    }
    tooltipVisible = false;
  }

  onDestroy(() => {
    if (rAFId !== null) cancelAnimationFrame(rAFId);
    if (cleanupAutoUpdate) cleanupAutoUpdate();
  });
</script>

<div
  class="calendar-heatmap-container grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
>
  {#each months as monthName, mIndex}
    {@const stats = calculateMonthStats(mIndex, year)}
    <div
      class="month-card bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-color)] flex flex-col"
    >
      <div class="flex justify-between items-end mb-2 px-1">
        <h4 class="text-xs font-bold text-[var(--text-secondary)]">
          {monthName}
        </h4>
        <div class="text-[0.6rem] text-right leading-tight">
          <div
            class={stats.totalPnl > 0
              ? "text-[var(--success-color)]"
              : stats.totalPnl < 0
              ? "text-[var(--danger-color)]"
              : "text-[var(--text-secondary)]"}
          >
            ${(stats.totalPnl ?? 0).toFixed(0)}
          </div>
          <div class="text-[var(--text-tertiary)]">
            {stats.totalTrades} Trades
          </div>
        </div>
      </div>

      <div class="days-grid grid grid-cols-7 gap-1 flex-1 content-start">
        <!-- Day headers -->
        {#each ["S", "M", "T", "W", "T", "F", "S"] as dayHead}
          <div class="text-[0.6rem] text-center text-[var(--text-tertiary)]">
            {dayHead}
          </div>
        {/each}

        <!-- Spacers for start of month -->
        {#each Array(getFirstDayOfMonth(mIndex, year)) as _}
          <div></div>
        {/each}

        <!-- Days -->
        {#each Array(getDaysInMonth(mIndex, year)) as _, dIndex}
          {@const dateStr = formatDate(year, mIndex, dIndex + 1)}
          {@const entry = dataMap[dateStr]}

          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            role="button"
            tabindex="0"
            class="day-cell w-full aspect-square rounded-sm relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
            style="background-color: {getColor(dateStr)}; opacity: {getOpacity(
              dateStr
            )}"
            onmouseenter={(e) => handleMouseEnter(e, entry, dateStr)}
            onmouseleave={handleMouseLeave}
            onclick={() => entry && handleDayClick(dateStr)}
></div>
        {/each}
      </div>
    </div>
  {/each}
</div>


{#if tooltipVisible}
  <div
    bind:this={tooltipEl}
    class="floating-tooltip"
  >
    {#if hoveredEntry}
      <div class="text-left">
        <div class="text-[var(--text-secondary)] text-xs mb-1">{hoveredDateStr}</div>
        <div class="font-bold mb-1" style="color: {hoveredEntry.pnl > 0 ? 'var(--success-color, #10b981)' : hoveredEntry.pnl < 0 ? 'var(--danger-color, #ef4444)' : 'var(--text-secondary, #94a3b8)'}">
          PnL: ${(hoveredEntry.pnl ?? 0).toFixed(2)}
        </div>
        <div class="text-[var(--text-primary)] text-xs">
          Trades: {hoveredEntry.count}
          {#if hoveredEntry.winCount !== undefined && hoveredEntry.lossCount !== undefined}
            <span class="text-[var(--text-tertiary)]">({hoveredEntry.winCount}W / {hoveredEntry.lossCount}L)</span>
          {/if}
        </div>
      </div>
      {#if hoveredEntry.bestSymbol}
        <div class="text-[var(--text-primary)] text-xs mt-1 border-t border-[var(--border-color)] pt-1">
          Top: <span class="font-semibold">{hoveredEntry.bestSymbol}</span>
          {#if hoveredEntry.bestSymbolPnl !== undefined && hoveredEntry.bestSymbolPnl !== null}
            <span style="color: {hoveredEntry.bestSymbolPnl > 0 ? 'var(--success-color)' : hoveredEntry.bestSymbolPnl < 0 ? 'var(--danger-color)' : 'inherit'}">
              (${hoveredEntry.bestSymbolPnl.toFixed(2)})
            </span>
          {/if}
        </div>
      {/if}
    {:else}
      {hoveredDateStr}
    {/if}
    <div
      bind:this={arrowEl}
      class="floating-arrow"
    ></div>
  </div>
{/if}


<style>
  .day-cell {
    transition: transform 0.1s;
  }
  .day-cell:hover {
    transform: scale(1.2);
    z-index: 10;
    border: 1px solid var(--text-primary);
  }
  .floating-tooltip {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 9999;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
    background-color: var(--bg-tertiary, #1e293b);
    color: var(--text-primary, #f1f5f9);
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border: 1px solid var(--border-color, #334155);
    line-height: 1.4;
    max-width: 300px;
    width: max-content;
  }
  .floating-arrow {
    position: absolute;
    width: 8px;
    height: 8px;
    background-color: inherit;
    border-right: 1px solid var(--border-color, #334155);
    border-bottom: 1px solid var(--border-color, #334155);
    z-index: -1;
  }
</style>
