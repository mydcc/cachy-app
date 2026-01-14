<!-- Add Imports for Perf and Quality at top if missed -->
<script context="module">
    // ...
</script>

<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { _ } from "../../../locales/i18n";
    import { formatDynamicDecimal } from "../../../utils/utils";
    import { hexToRgba } from "../../../utils/colors";
    import {
        journalStore,
        psychologyMetrics,
        marketMetrics,
        timingMetrics,
        confluenceMetrics,
        durationStatsMetrics,
        durationDataMetrics,
        tagEvolutionMetrics,
        assetMetrics,
        riskMetrics,
        calendarMetrics,
        tagMetrics,
        qualityMetrics,
        performanceMetrics,
    } from "../../../stores/journalStore";
    import { calculator } from "../../../lib/calculator";
    import DashboardNav from "../DashboardNav.svelte";
    import LineChart from "../charts/LineChart.svelte";
    import BarChart from "../charts/BarChart.svelte";
    import DoughnutChart from "../charts/DoughnutChart.svelte";
    import BubbleChart from "../charts/BubbleChart.svelte";
    import CalendarHeatmap from "../charts/CalendarHeatmap.svelte";

    export let themeColors: any;

    const dispatch = createEventDispatcher();

    // Local State
    let activeDeepDivePreset = "forecast";
    let selectedYear = new Date().getFullYear();

    // --- Data Logic derived from stores ---

    $: journal = $journalStore;

    // Forecast (Monte Carlo)
    $: monteCarloData = calculator.getMonteCarloData(journal);
    $: monteCarloChartData = monteCarloData
        ? {
              labels: monteCarloData.labels,
              datasets: [
                  {
                      label: $_("journal.deepDive.charts.labels.simBest"),
                      data: monteCarloData.upperPath,
                      borderColor: themeColors.success,
                      backgroundColor: "transparent",
                      borderDash: [5, 5],
                      borderWidth: 1,
                      pointRadius: 0,
                  },
                  {
                      label: $_("journal.deepDive.charts.labels.simMedian"),
                      data: monteCarloData.medianPath,
                      borderColor: themeColors.accent,
                      backgroundColor: "transparent",
                      borderWidth: 2,
                      pointRadius: 0,
                  },
                  {
                      label: $_("journal.deepDive.charts.labels.simWorst"),
                      data: monteCarloData.lowerPath,
                      borderColor: themeColors.danger,
                      backgroundColor: "transparent",
                      borderDash: [5, 5],
                      borderWidth: 1,
                      pointRadius: 0,
                  },
                  // Add a few random paths for "flavor"
                  ...monteCarloData.randomPaths.map((path, i) => ({
                      label: `Sim #${i + 1}`,
                      data: path,
                      borderColor: hexToRgba(themeColors.textSecondary, 0.2),
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      pointRadius: 0,
                  })),
              ],
          }
        : null;

    // Trends (Rolling Stats)
    $: rollingData = calculator.getRollingData(journal);
    $: rollingWinRateData = rollingData
        ? {
              labels: rollingData.labels,
              datasets: [
                  {
                      label: $_(
                          "journal.deepDive.charts.labels.rollingWinRate"
                      ),
                      data: rollingData.winRates,
                      borderColor: themeColors.success,
                      backgroundColor: hexToRgba(themeColors.success, 0.1),
                      fill: true,
                      tension: 0.3,
                  },
              ],
          }
        : null;

    $: rollingPFData = rollingData
        ? {
              labels: rollingData.labels,
              datasets: [
                  {
                      label: $_("journal.deepDive.charts.labels.rollingPF"),
                      data: rollingData.profitFactors,
                      borderColor: themeColors.warning,
                      backgroundColor: hexToRgba(themeColors.warning, 0.1),
                      fill: true,
                      tension: 0.3,
                  },
              ],
          }
        : null;

    $: rollingSQNData = rollingData
        ? {
              labels: rollingData.labels,
              datasets: [
                  {
                      label: $_("journal.deepDive.charts.labels.rollingSQN"),
                      data: rollingData.sqnValues,
                      borderColor: themeColors.accent,
                      backgroundColor: hexToRgba(themeColors.accent, 0.1),
                      fill: true,
                      tension: 0.3,
                  },
              ],
          }
        : null;

    // Leakage (Attribution)
    $: leakageData = calculator.getLeakageData(journal);

    // Waterfall Chart Data
    $: leakageWaterfallChartData = {
        labels: [
            $_("journal.deepDive.charts.labels.grossProfit"),
            $_("journal.deepDive.charts.labels.fees"),
            $_("journal.deepDive.charts.labels.grossLoss"),
            $_("journal.deepDive.charts.labels.netResult"),
        ],
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.pnlBreakdown"),
                data: [
                    leakageData.waterfallData.grossProfit,
                    leakageData.waterfallData.fees,
                    leakageData.waterfallData.grossLoss,
                    leakageData.waterfallData.netResult,
                ],
                backgroundColor: [
                    themeColors.success,
                    themeColors.warning,
                    themeColors.danger,
                    leakageData.waterfallData.netResult >= 0
                        ? themeColors.success
                        : themeColors.danger,
                ],
            },
        ],
    };

    $: leakageTagData = {
        labels: leakageData.worstTags.map((t) =>
            t.label === "No Tag"
                ? $_("journal.deepDive.charts.labels.noTag")
                : t.label
        ),
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.pnl"),
                data: leakageData.worstTags.map((t) => t.pnl),
                backgroundColor: themeColors.danger,
            },
        ],
    };
    $: leakageTimingData = {
        labels: leakageData.worstHours.map((h) => `${h.hour}h`),
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.grossLoss"),
                data: leakageData.worstHours.map((h) => h.loss), // Absolute positive values for display
                backgroundColor: themeColors.danger,
            },
        ],
    };

    // Timing
    $: timingData = $timingMetrics;
    $: hourlyPnlData = {
        labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.grossProfit"),
                data: timingData.hourlyGrossProfit,
                backgroundColor: themeColors.success,
            },
            {
                label: $_("journal.deepDive.charts.labels.grossLoss"),
                data: timingData.hourlyGrossLoss,
                backgroundColor: themeColors.danger,
            },
        ],
    };

    $: dayOfWeekPnlData = {
        labels: timingData.dayLabels,
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.grossProfit"),
                data: timingData.dayOfWeekGrossProfit,
                backgroundColor: themeColors.success,
            },
            {
                label: $_("journal.deepDive.charts.labels.grossLoss"),
                data: timingData.dayOfWeekGrossLoss,
                backgroundColor: themeColors.danger,
            },
        ],
    };

    $: durationStats = $durationStatsMetrics;
    $: durationChartData = {
        labels: durationStats.labels,
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.pnl"),
                data: durationStats.pnlData,
                backgroundColor: durationStats.pnlData.map((d) =>
                    d >= 0 ? themeColors.success : themeColors.danger
                ),
                yAxisID: "y",
            },
            {
                label: $_("journal.deepDive.charts.titles.winRate"),
                data: durationStats.winRateData,
                type: "line",
                borderColor: themeColors.accent,
                backgroundColor: hexToRgba(themeColors.accent, 0.1),
                yAxisID: "y1",
            },
        ],
    };

    $: durationDataRaw = $durationDataMetrics;
    $: durationScatterData = {
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.trades"),
                data: durationDataRaw.scatterData,
                backgroundColor: durationDataRaw.scatterData.map((d) =>
                    d.y >= 0 ? themeColors.success : themeColors.danger
                ),
            },
        ],
    };

    $: confluenceData = $confluenceMetrics;

    // Assets
    $: dirData = calculator.getDirectionData(journal); // Re-used for Asset Top Symbol
    $: assetData = $assetMetrics;
    $: assetBubbleData = {
        datasets: [
            {
                label: $_("journal.deepDive.assets"),
                data: assetData.bubbleData,
                backgroundColor: assetData.bubbleData.map((d) =>
                    d.y >= 0
                        ? hexToRgba(themeColors.success, 0.6)
                        : hexToRgba(themeColors.danger, 0.6)
                ),
            },
        ],
    };

    // Risk
    $: riskScatterData = $riskMetrics;
    $: riskRewardScatter = {
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.trades"),
                data: riskScatterData.scatterData,
                backgroundColor: riskScatterData.scatterData.map((d) =>
                    d.y >= 0 ? themeColors.success : themeColors.danger
                ),
            },
        ],
    };

    // Quality - R Distribution
    $: qualMetrics = $qualityMetrics;
    $: rDistData = {
        labels: Object.keys(qualMetrics.rHistogram || {}),
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.trades"),
                data: Object.values(qualMetrics.rHistogram || {}),
                backgroundColor: themeColors.accent,
            },
        ],
    };

    // Performance - Drawdown
    $: perfMetrics = $performanceMetrics;
    $: drawdownData = {
        labels: (perfMetrics.drawdownSeries || []).map((d) =>
            new Date(d.x).toLocaleDateString()
        ),
        datasets: [
            {
                label: $_("journal.deepDive.charts.titles.drawdown"),
                data: (perfMetrics.drawdownSeries || []).map((d) => d.y),
                borderColor: themeColors.danger,
                backgroundColor: hexToRgba(themeColors.danger, 0.2),
                fill: true,
                tension: 0.1,
            },
        ],
    };

    // Market (Leverage + Win Rate Long/Short)
    $: marketData = $marketMetrics;
    $: longShortWinData = {
        labels: [
            $_("journal.deepDive.charts.labels.longWinRate"),
            $_("journal.deepDive.charts.labels.shortWinRate"),
        ],
        datasets: [
            {
                data: marketData.longShortWinRate,
                backgroundColor: [themeColors.success, themeColors.danger],
                borderWidth: 0,
            },
        ],
    };
    $: leverageDistData = {
        labels: marketData.leverageLabels,
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.count"),
                data: marketData.leverageDist,
                backgroundColor: themeColors.accent,
            },
        ],
    };

    // Psychology
    $: psychData = $psychologyMetrics;
    $: winStreakData = {
        labels: psychData.streakLabels,
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.frequency"),
                data: psychData.winStreakData,
                backgroundColor: themeColors.success,
            },
        ],
    };
    $: lossStreakData = {
        labels: psychData.streakLabels,
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.frequency"),
                data: psychData.lossStreakData,
                backgroundColor: themeColors.danger,
            },
        ],
    };
    // Need Drawdown Data for Psychology tab (Recovery)
    // Drawdown comes from performanceMetrics
    // Let's import performanceMetrics

    // Strategies (Tags)
    $: tagData = $tagMetrics;
    $: tagPnlData = {
        labels: tagData.labels,
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.pnl"),
                data: tagData.pnlData,
                backgroundColor: tagData.pnlData.map((d) =>
                    d >= 0 ? themeColors.success : themeColors.danger
                ),
            },
        ],
    };
    $: tagEvolutionData = $tagEvolutionMetrics;
    $: tagEvolutionChartData = {
        datasets: tagEvolutionData.datasets.map((ds, i) => ({
            label: ds.label,
            data: ds.data,
            borderColor: [
                themeColors.success,
                themeColors.accent,
                themeColors.warning,
                themeColors.danger,
                themeColors.textSecondary,
            ][i % 5],
            fill: false,
            tension: 0.1,
            pointRadius: 0,
        })),
    };

    // Calendar
    $: calendarData = $calendarMetrics;

    $: availableYears = (() => {
        const years = new Set<number>();
        years.add(new Date().getFullYear());
        calendarData.forEach((d) => {
            const y = new Date(d.date).getFullYear();
            if (!isNaN(y)) years.add(y);
        });
        return Array.from(years).sort((a, b) => b - a);
    })();

    function handleCalendarClick(event: CustomEvent) {
        dispatch("filterDateChange", { date: event.detail.date });
    }

    // Missing Imports handling:
    // Need performanceMetrics for Drawdown in Psychology
    // Need qualityMetrics for RDist in Risk
</script>

<!-- Actually I will just fix the imports in the main script block in the final file writing -->

<div class="mt-8 border-t border-[var(--border-color)] pt-6">
    <div class="flex items-center gap-2 mb-4">
        <span class="text-2xl">🦆</span>
        <h3 class="text-xl font-bold text-[var(--text-primary)]">
            {$_("journal.deepDive.title")}
        </h3>
    </div>

    <DashboardNav
        activePreset={activeDeepDivePreset}
        presets={[
            { id: "forecast", label: $_("journal.deepDive.forecast") },
            { id: "trends", label: $_("journal.deepDive.trends") },
            { id: "leakage", label: $_("journal.deepDive.leakage") },
            { id: "timing", label: $_("journal.deepDive.timing") },
            { id: "assets", label: $_("journal.deepDive.assets") },
            { id: "risk", label: $_("journal.deepDive.risk") },
            { id: "market", label: $_("journal.deepDive.market") },
            {
                id: "psychology",
                label: $_("journal.deepDive.psychology"),
            },
            {
                id: "strategies",
                label: $_("journal.deepDive.strategies"),
            },
            { id: "calendar", label: $_("journal.deepDive.calendar") },
        ]}
        on:select={(e) => (activeDeepDivePreset = e.detail)}
    />

    <div
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 min-h-[250px] mt-4"
    >
        {#if activeDeepDivePreset === "forecast"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-3"
            >
                {#if monteCarloChartData}
                    <LineChart
                        data={monteCarloChartData}
                        title={$_("journal.deepDive.charts.labels.forecast")}
                        yLabel={$_(
                            "journal.deepDive.charts.labels.equityChange"
                        )}
                        description={$_(
                            "journal.deepDive.charts.descriptions.forecast"
                        )}
                    />
                {:else}
                    <div
                        class="flex items-center justify-center h-full text-[var(--text-secondary)]"
                    >
                        {$_("journal.noData")}
                        {$_("journal.messages.min5Trades")}
                    </div>
                {/if}
            </div>
        {:else if activeDeepDivePreset === "trends"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-3 lg:col-span-3"
            >
                {#if rollingWinRateData}
                    <div class="mb-4 h-64">
                        <LineChart
                            data={rollingWinRateData}
                            title={$_(
                                "journal.deepDive.charts.labels.rollingWinRate"
                            )}
                            yLabel="%"
                            description={$_(
                                "journal.deepDive.charts.descriptions.rollingWinRate"
                            )}
                        />
                    </div>
                {/if}
                {#if rollingPFData}
                    <div class="h-64 mb-4">
                        <LineChart
                            data={rollingPFData}
                            title={$_(
                                "journal.deepDive.charts.labels.rollingPF"
                            )}
                            yLabel="PF"
                            description={$_(
                                "journal.deepDive.charts.descriptions.rollingPF"
                            )}
                        />
                    </div>
                {/if}
                {#if rollingSQNData}
                    <div class="h-64">
                        <LineChart
                            data={rollingSQNData}
                            title={$_(
                                "journal.deepDive.charts.labels.rollingSQN"
                            )}
                            yLabel="SQN"
                            description={$_(
                                "journal.deepDive.charts.descriptions.rollingSQN"
                            )}
                        />
                    </div>
                {/if}
                {#if !rollingWinRateData}
                    <div
                        class="flex items-center justify-center h-full text-[var(--text-secondary)]"
                    >
                        {$_("journal.noData")}
                        {$_("journal.messages.min20Trades")}
                    </div>
                {/if}
            </div>
        {:else if activeDeepDivePreset === "leakage"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <BarChart
                    data={leakageWaterfallChartData}
                    title={$_("journal.deepDive.charts.labels.profitRetention")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.leakageWaterfall"
                    ) || "PnL Waterfall"}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                {#if leakageData.worstTags.length > 0}
                    <BarChart
                        data={leakageTagData}
                        title={$_(
                            "journal.deepDive.charts.titles.strategyLeakage"
                        )}
                        horizontal={true}
                        description={$_(
                            "journal.deepDive.charts.descriptions.leakageTags"
                        )}
                    />
                {:else}
                    <div
                        class="flex items-center justify-center h-full text-[var(--text-secondary)]"
                    >
                        {$_("journal.noData")}
                        {$_("journal.messages.noStrategyLosses")}
                    </div>
                {/if}
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                {#if leakageData.worstHours.length > 0}
                    <BarChart
                        data={leakageTimingData}
                        title={$_("journal.deepDive.charts.titles.timeLeakage")}
                        description={$_(
                            "journal.deepDive.charts.descriptions.leakageTiming"
                        )}
                    />
                {:else}
                    <div
                        class="flex items-center justify-center h-full text-[var(--text-secondary)]"
                    >
                        {$_("journal.noData")}
                        {$_("journal.messages.noTimingLosses")}
                    </div>
                {/if}
            </div>
        {:else if activeDeepDivePreset === "timing"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <BarChart
                    data={hourlyPnlData}
                    title={$_("journal.deepDive.charts.hourlyPnl")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.hourlyPnl"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <BarChart
                    data={dayOfWeekPnlData}
                    title={$_("journal.deepDive.charts.dayOfWeekPnl")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.dayOfWeekPnl"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <BubbleChart
                    data={durationScatterData}
                    title={$_("journal.deepDive.charts.titles.durationVsPnl")}
                    xLabel="Dauer (Min)"
                    yLabel="PnL ($)"
                    description={$_(
                        "journal.deepDive.charts.descriptions.durationVsPnl"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-1 h-[250px]"
            >
                <BarChart
                    data={durationChartData}
                    title={$_(
                        "journal.deepDive.charts.labels.durationAnalysis"
                    )}
                    description={$_(
                        "journal.deepDive.charts.descriptions.durationPnl"
                    )}
                    options={{
                        scales: {
                            y: {
                                type: "linear",
                                display: true,
                                position: "left",
                            },
                            y1: {
                                type: "linear",
                                display: true,
                                position: "right",
                                grid: { drawOnChartArea: false },
                            },
                        },
                    }}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2 h-[250px] overflow-auto"
            >
                <div
                    class="text-sm font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider"
                >
                    {$_("journal.deepDive.charts.labels.confluence")}
                </div>
                <div
                    class="grid grid-cols-[auto_repeat(24,1fr)] gap-1 text-[10px] overflow-x-auto pb-2"
                >
                    <!-- Header Row (Hours) -->
                    <div class="h-6" />
                    {#each Array(24) as _, i}
                        <div class="text-center text-[var(--text-secondary)]">
                            {i}
                        </div>
                    {/each}

                    <!-- Data Rows (Days) -->
                    {#each confluenceData as row}
                        <div
                            class="font-bold text-[var(--text-primary)] pr-2 flex items-center h-8"
                        >
                            {row.day}
                        </div>
                        {#each row.hours as cell}
                            <div
                                class="h-8 rounded w-full flex items-center justify-center relative group"
                                style="background-color: {cell.pnl > 0
                                    ? `rgba(var(--success-rgb), ${Math.min(
                                          cell.pnl / 100,
                                          1
                                      )})`
                                    : cell.pnl < 0
                                    ? `rgba(var(--danger-rgb), ${Math.min(
                                          Math.abs(cell.pnl) / 100,
                                          1
                                      )})`
                                    : 'var(--bg-tertiary)'};
                                            border: 1px solid {cell.count > 0
                                    ? 'transparent'
                                    : 'var(--border-color)'}"
                            >
                                {#if cell.count > 0}
                                    <span
                                        class="text-[9px] font-mono {Math.abs(
                                            cell.pnl
                                        ) > 50
                                            ? 'text-white font-bold'
                                            : 'text-[var(--text-primary)]'}"
                                    >
                                        {cell.count}
                                    </span>
                                    <!-- Tooltip -->
                                    <div
                                        class="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 bg-black text-white p-2 rounded text-xs whitespace-nowrap shadow-lg pointer-events-none"
                                    >
                                        <div class="font-bold">
                                            {row.day}
                                            {cell.hour}:00
                                        </div>
                                        <div
                                            class={cell.pnl >= 0
                                                ? "text-[var(--success-color)]"
                                                : "text-[var(--danger-color)]"}
                                        >
                                            {$_(
                                                "journal.deepDive.charts.labels.pnl"
                                            )}: {formatDynamicDecimal(
                                                cell.pnl,
                                                2
                                            )}
                                        </div>
                                        <div>
                                            {$_(
                                                "journal.deepDive.charts.labels.trades"
                                            )}: {cell.count}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    {/each}
                </div>
                <div class="text-xs text-[var(--text-secondary)] mt-1">
                    {$_(
                        "journal.deepDive.charts.descriptions.confluenceMatrix"
                    )}
                </div>
            </div>
        {:else if activeDeepDivePreset === "assets"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2"
            >
                <BubbleChart
                    data={assetBubbleData}
                    title={$_("journal.deepDive.charts.assetBubble")}
                    xLabel="Win Rate (%)"
                    yLabel={$_("journal.totalPL") + " ($)"}
                    description={$_(
                        "journal.deepDive.charts.descriptions.assetBubble"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex items-center justify-center"
            >
                <div class="text-center">
                    <div class="text-sm text-[var(--text-secondary)]">
                        {$_("journal.labels.topAsset")}
                    </div>
                    {#if dirData.topSymbols.labels.length > 0}
                        <div
                            class="text-2xl font-bold text-[var(--success-color)]"
                        >
                            {dirData.topSymbols.labels[0]}
                        </div>
                        <div class="text-lg text-[var(--text-primary)]">
                            ${formatDynamicDecimal(
                                dirData.topSymbols.data[0],
                                2
                            )}
                        </div>
                    {:else}
                        <div class="text-xl">-</div>
                    {/if}
                </div>
            </div>
        {:else if activeDeepDivePreset === "risk"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2"
            >
                <BubbleChart
                    data={riskRewardScatter}
                    title={$_("journal.deepDive.charts.riskRewardScatter")}
                    xLabel="Risk Amount ($)"
                    yLabel="Realized PnL ($)"
                    description={$_(
                        "journal.deepDive.charts.descriptions.riskRewardScatter"
                    )}
                />
            </div>
            <!-- Re-use quality metrics R-Dist here. We need to import qualityMetrics and create rDistData -->
            <!-- To avoid duplication, I will just let this be empty or fix the imports. -->
            <!-- Actually I will assume rDistData is available via import qualityMetrics. -->
            <!-- Wait, rDistData needs calculation. -->
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <!-- Placeholder for R-Dist since I need to import it properly. -->
                <!-- Actually I will add rDistData calculation loop below imports. -->
                <BarChart
                    data={rDistData}
                    title={$_("journal.deepDive.charts.titles.rMultipleDist")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.rMultipleDist"
                    )}
                />
            </div>
        {:else if activeDeepDivePreset === "market"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <DoughnutChart
                    data={longShortWinData}
                    title={$_("journal.deepDive.charts.longShortWinRate")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.longShortWinRate"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2"
            >
                <BarChart
                    data={leverageDistData}
                    title={$_("journal.deepDive.charts.leverageDist")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.leverageDist"
                    )}
                />
            </div>
        {:else if activeDeepDivePreset === "psychology"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <BarChart
                    data={winStreakData}
                    title={$_("journal.deepDive.charts.winStreak")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.winStreak"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <BarChart
                    data={lossStreakData}
                    title={$_("journal.deepDive.charts.lossStreak")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.lossStreak"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <LineChart
                    data={drawdownData}
                    title={$_("journal.deepDive.charts.recovery")}
                    yLabel="Drawdown ($)"
                    description={$_(
                        "journal.deepDive.charts.descriptions.recovery"
                    )}
                />
            </div>
        {:else if activeDeepDivePreset === "strategies"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-3"
            >
                <LineChart
                    data={tagEvolutionChartData}
                    title={$_(
                        "journal.deepDive.charts.titles.strategyEvolution"
                    )}
                    description={$_(
                        "journal.deepDive.charts.descriptions.tagEvolution"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2"
            >
                <BarChart
                    data={tagPnlData}
                    title={$_("journal.deepDive.charts.tagPerformance")}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex items-center justify-center"
            >
                <div class="text-center p-4">
                    <div class="text-[var(--text-secondary)] text-sm mb-2">
                        {$_("journal.labels.mostProfitableStrategy")}
                    </div>
                    {#if tagData.labels.length > 0 && tagData.pnlData.length > 0}
                        {@const maxVal = Math.max(...tagData.pnlData)}
                        {@const bestIdx = tagData.pnlData.indexOf(maxVal)}
                        {#if bestIdx !== -1 && tagData.labels[bestIdx]}
                            <div
                                class="text-2xl font-bold text-[var(--success-color)]"
                            >
                                #{tagData.labels[bestIdx]}
                            </div>
                            <div class="text-[var(--text-primary)]">
                                ${formatDynamicDecimal(
                                    tagData.pnlData[bestIdx],
                                    2
                                )}
                            </div>
                        {:else}
                            <div class="text-xl">-</div>
                        {/if}
                    {:else}
                        <div class="text-xl">-</div>
                    {/if}
                </div>
            </div>
        {:else if activeDeepDivePreset === "calendar"}
            <div
                class="col-span-1 md:col-span-2 lg:col-span-3 flex flex-col items-center"
            >
                <div class="flex items-center gap-4 mb-4">
                    <h4 class="font-bold text-[var(--text-primary)]">
                        {$_("journal.deepDive.charts.heatmap")}
                    </h4>
                    <div class="flex gap-2">
                        {#each availableYears as year}
                            <button
                                class="px-3 py-1 text-sm rounded-full transition-colors border border-[var(--border-color)]
                                           {selectedYear === year
                                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] font-bold'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]'}"
                                on:click={() => (selectedYear = year)}
                            >
                                {year}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="w-full">
                    <CalendarHeatmap
                        data={calendarData}
                        year={selectedYear}
                        on:click={handleCalendarClick}
                    />
                </div>
            </div>
        {/if}
    </div>
</div>
