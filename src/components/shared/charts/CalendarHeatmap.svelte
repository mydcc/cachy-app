<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { getComputedColor } from "../../../utils/colors";
  import { escapeHtml } from "../../../utils/utils";
  import { _ } from "../../../locales/i18n";
  import { tooltip } from "../../../lib/actions/tooltip";

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

  function getTooltipHtml(entry: any, dateStr: string) {
    if (!entry) return null; // No tooltip for empty days? or just date? user request image shows active day tooltip

    const pnlColor =
      entry.pnl > 0
        ? "var(--success-color, #10b981)"
        : entry.pnl < 0
        ? "var(--danger-color, #ef4444)"
        : "var(--text-secondary, #94a3b8)";

    let html = `
            <div class="text-left">
                <div class="text-[var(--text-secondary)] text-xs mb-1">${dateStr}</div>
                <div class="font-bold mb-1" style="color: ${pnlColor}">
                    PnL: $${(entry.pnl ?? 0).toFixed(2)}
                </div>
                <div class="text-[var(--text-primary)] text-xs">
                    Trades: ${entry.count}
                </div>
        `;

    if (entry.winCount !== undefined && entry.lossCount !== undefined) {
      html += ` <span class="text-[var(--text-tertiary)]">(${entry.winCount}W / ${entry.lossCount}L)</span>`;
    }

    html += `</div>`;

    if (entry.bestSymbol) {
      html += `
                <div class="text-[var(--text-primary)] text-xs mt-1 border-t border-[var(--border-color)] pt-1">
                    Top: <span class="font-semibold">${escapeHtml(entry.bestSymbol)}</span>
            `;
      if (entry.bestSymbolPnl !== undefined && entry.bestSymbolPnl !== null) {
        const symPnlColor =
          entry.bestSymbolPnl > 0
            ? "var(--success-color)"
            : entry.bestSymbolPnl < 0
            ? "var(--danger-color)"
            : "inherit";
        html += ` <span style="color: ${symPnlColor}">($${entry.bestSymbolPnl.toFixed(
          2
        )})</span>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }
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
          {@const tooltipContent = getTooltipHtml(entry, dateStr)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            role="button"
            tabindex="0"
            class="day-cell w-full aspect-square rounded-sm relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
            style="background-color: {getColor(dateStr)}; opacity: {getOpacity(
              dateStr
            )}"
            use:tooltip={tooltipContent
              ? { content: tooltipContent, allowHtml: true, placement: "top" }
              : { content: dateStr, placement: "top" }}
            onclick={() => entry && handleDayClick(dateStr)}
></div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .day-cell {
    transition: transform 0.1s;
  }
  .day-cell:hover {
    transform: scale(1.2);
    z-index: 10;
    border: 1px solid var(--text-primary);
  }
</style>
