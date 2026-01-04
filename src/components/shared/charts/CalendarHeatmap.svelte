<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { getComputedColor } from '../../../utils/colors';
    import { _ } from '../../../locales/i18n';

    export let data: { date: string, pnl: number, count: number }[] = [];
    export let year: number = new Date().getFullYear();

    const dispatch = createEventDispatcher();

    // Helpers
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Generate calendar grid for the year
    // We want a grid like GitHub: Columns are weeks, Rows are days (Sun-Sat or Mon-Sun)
    // For simplicity, we can do a month-based grid or a full year continuous grid.
    // Let's do a month-based grid for better mobile responsiveness. 12 mini grids.

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

        // Simple color scale: Green for profit, Red for loss
        // Intensity based on magnitude could be complex, let's stick to binary + opacity or simple shades
        // Or simpler: Profit = Success Color, Loss = Danger Color.
        if (entry.pnl > 0) return 'var(--success-color)';
        if (entry.pnl < 0) return 'var(--danger-color)';
        return 'var(--text-secondary)'; // Break even but traded
    }

    function getOpacity(dateStr: string) {
        const entry = dataMap[dateStr];
        if (!entry) return 1;
        // Scale opacity? Maybe not needed for clean look.
        return 0.8;
    }

    function formatDate(y: number, m: number, d: number) {
        return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
</script>

<div class="calendar-heatmap-container grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
    {#each months as monthName, mIndex}
        <div class="month-card bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-color)]">
            <h4 class="text-xs font-bold mb-2 text-center text-[var(--text-secondary)]">{monthName}</h4>
            <div class="days-grid grid grid-cols-7 gap-1">
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
                    <div
                        class="day-cell w-full aspect-square rounded-sm relative group cursor-pointer"
                        style="background-color: {getColor(dateStr)}; opacity: {getOpacity(dateStr)}"
                        title="{dateStr}: {entry ? `$${entry.pnl.toFixed(2)} (${entry.count} trades)` : 'No trades'}"
                    >
                        {#if entry}
                            <!-- Tooltip handled by native title for simplicity or custom if needed -->
                        {/if}
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
