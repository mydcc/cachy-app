<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { getComputedColor } from '../../../utils/colors';
    import { _ } from '../../../locales/i18n';

    export let data: { date: string, pnl: number, count: number, winCount?: number, lossCount?: number, bestSymbol?: string, bestSymbolPnl?: number }[] = [];
    export let year: number = new Date().getFullYear();

    const dispatch = createEventDispatcher();

    // Helpers
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function getDaysInMonth(m: number, y: number) {
        return new Date(y, m + 1, 0).getDate();
    }

    function getFirstDayOfMonth(m: number, y: number) {
        // 0 = Sun, 1 = Mon ...
        return new Date(y, m, 1).getDay();
    }

    // Map data to easy lookup
    $: dataMap = data.reduce((acc, d) => {
        acc[d.date] = d;
        return acc;
    }, {} as Record<string, { date: string, pnl: number, count: number }>);

    function getColor(dateStr: string) {
        const entry = dataMap[dateStr];
        if (!entry) return 'var(--bg-tertiary)';

        if (entry.pnl > 0) return 'var(--success-color)';
        if (entry.pnl < 0) return 'var(--danger-color)';
        return 'var(--text-secondary)';
    }

    function getOpacity(dateStr: string) {
        const entry = dataMap[dateStr];
        if (!entry) return 1;
        return 0.8;
    }

    function formatDate(y: number, m: number, d: number) {
        return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
        dispatch('click', { date: dateStr });
    }

    function getTooltipText(entry: any, dateStr: string) {
        if (!entry) return `${dateStr}: No trades`;

        let text = `${dateStr}\n`;
        text += `PnL: $${entry.pnl.toFixed(2)}\n`;
        text += `Trades: ${entry.count}`;

        if (entry.winCount !== undefined && entry.lossCount !== undefined) {
             text += ` (${entry.winCount}W / ${entry.lossCount}L)`;
        }

        if (entry.bestSymbol) {
             text += `\nTop: ${entry.bestSymbol}`;
             if (entry.bestSymbolPnl) {
                 text += ` ($${entry.bestSymbolPnl.toFixed(2)})`;
             }
        }
        return text;
    }
</script>

<div class="calendar-heatmap-container grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
    {#each months as monthName, mIndex}
        {@const stats = calculateMonthStats(mIndex, year)}
        <div class="month-card bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-color)] flex flex-col">
            <div class="flex justify-between items-end mb-2 px-1">
                <h4 class="text-xs font-bold text-[var(--text-secondary)]">{monthName}</h4>
                <div class="text-[0.6rem] text-right leading-tight">
                    <div class="{stats.totalPnl > 0 ? 'text-[var(--success-color)]' : stats.totalPnl < 0 ? 'text-[var(--danger-color)]' : 'text-[var(--text-secondary)]'}">
                        ${stats.totalPnl.toFixed(0)}
                    </div>
                    <div class="text-[var(--text-tertiary)]">{stats.totalTrades} Trades</div>
                </div>
            </div>

            <div class="days-grid grid grid-cols-7 gap-1 flex-1 content-start">
                <!-- Day headers -->
                {#each ['S','M','T','W','T','F','S'] as dayHead}
                    <div class="text-[0.6rem] text-center text-[var(--text-tertiary)]">{dayHead}</div>
                {/each}

                <!-- Spacers for start of month -->
                {#each Array(getFirstDayOfMonth(mIndex, year)) as _}
                    <div></div>
                {/each}

                <!-- Days -->
                {#each Array(getDaysInMonth(mIndex, year)) as _, dIndex}
                    {@const dateStr = formatDate(year, mIndex, dIndex + 1)}
                    {@const entry = dataMap[dateStr]}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <div
                        role="button"
                        tabindex="0"
                        class="day-cell w-full aspect-square rounded-sm relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                        style="background-color: {getColor(dateStr)}; opacity: {getOpacity(dateStr)}"
                        title="{getTooltipText(entry, dateStr)}"
                        on:click={() => entry && handleDayClick(dateStr)}
                    >
                    </div>
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
