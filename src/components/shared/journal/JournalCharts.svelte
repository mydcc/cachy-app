<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import LineChart from "../charts/LineChart.svelte";
    import BarChart from "../charts/BarChart.svelte";
    import DoughnutChart from "../charts/DoughnutChart.svelte";
    import { formatDynamicDecimal } from "../../../utils/utils";
    import { hexToRgba } from "../../../utils/colors";
    import {
        journalStore,
        performanceMetrics,
        qualityMetrics,
        disciplineMetrics,
        costMetrics,
    } from "../../../stores/journalStore";
    import { calculator } from "../../../lib/calculator";

    // Props - General
    export let activePreset: string = "performance";
    export let isPro: boolean = false;
    export let isDeepDiveUnlocked: boolean = false;
    export let themeColors: any = {
        success: "#10b981",
        danger: "#ef4444",
        warning: "#f59e0b",
        accent: "#3b82f6",
        textSecondary: "#64748b",
    };

    // --- Reactive Data Derivation ---

    // Performance Data
    $: perfData = $performanceMetrics || {};
    $: equityData = {
        labels: (perfData.equityCurve || []).map((d) =>
            new Date(d.x).toLocaleDateString()
        ),
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.equity"),
                data: (perfData.equityCurve || []).map((d) => d.y),
                borderColor: themeColors.success,
                backgroundColor: hexToRgba(themeColors.success, 0.1),
                fill: true,
                tension: 0.1,
            },
        ],
    };
    $: drawdownData = {
        labels: (perfData.drawdownSeries || []).map((d) =>
            new Date(d.x).toLocaleDateString()
        ),
        datasets: [
            {
                label: $_("journal.deepDive.charts.titles.drawdown"),
                data: (perfData.drawdownSeries || []).map((d) => d.y),
                borderColor: themeColors.danger,
                backgroundColor: hexToRgba(themeColors.danger, 0.2),
                fill: true,
                tension: 0.1,
            },
        ],
    };
    $: monthlyData = {
        labels: perfData.monthlyLabels || [],
        datasets: [
            {
                label: $_("journal.deepDive.charts.titles.monthlyPnl"),
                data: perfData.monthlyData || [],
                backgroundColor: (perfData.monthlyData || []).map((d) =>
                    d >= 0 ? themeColors.success : themeColors.danger
                ),
            },
        ],
    };

    // Quality Data
    $: qualData = $qualityMetrics || {};
    $: winLossChartData = {
        labels: [
            $_("journal.deepDive.charts.labels.winLong"),
            $_("journal.deepDive.charts.labels.winShort"),
            $_("journal.deepDive.charts.labels.lossLong"),
            $_("journal.deepDive.charts.labels.lossShort"),
            $_("journal.deepDive.charts.labels.beLong"),
            $_("journal.deepDive.charts.labels.beShort"),
        ],
        datasets: [
            {
                data: qualData.sixSegmentData || [],
                backgroundColor: [
                    hexToRgba(themeColors.success, 1),
                    hexToRgba(themeColors.success, 0.5),
                    hexToRgba(themeColors.danger, 1),
                    hexToRgba(themeColors.danger, 0.5),
                    hexToRgba(themeColors.warning, 1),
                    hexToRgba(themeColors.warning, 0.5),
                ],
                borderWidth: 0,
                hoverOffset: 4,
            },
        ],
    };
    $: rDistData = {
        labels: Object.keys(qualData.rHistogram || {}),
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.trades"),
                data: Object.values(qualData.rHistogram || {}),
                backgroundColor: themeColors.accent,
            },
        ],
    };
    $: cumRData = {
        labels: (qualData.cumulativeRCurve || []).map((d) =>
            new Date(d.x).toLocaleDateString()
        ),
        datasets: [
            {
                label: $_("journal.deepDive.charts.titles.cumulativeR"),
                data: (qualData.cumulativeRCurve || []).map((d) => d.y),
                borderColor: themeColors.accent,
                backgroundColor: hexToRgba(themeColors.accent, 0.1),
                fill: true,
                tension: 0.1,
            },
        ],
    };

    // Direction Data
    $: dirData = $journalStore
        ? calculator.getDirectionData($journalStore)
        : {
              longPnl: 0,
              shortPnl: 0,
              topSymbols: { labels: [], data: [] },
              bottomSymbols: { labels: [], data: [] },
              longCurve: [],
              shortCurve: [],
          };
    $: longShortData = {
        labels: [$_("journal.labels.long"), $_("journal.labels.short")],
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.netPnl"),
                data: [dirData.longPnl || 0, dirData.shortPnl || 0],
                backgroundColor: [
                    (dirData.longPnl || 0) >= 0
                        ? themeColors.success
                        : themeColors.danger,
                    (dirData.shortPnl || 0) >= 0
                        ? themeColors.success
                        : themeColors.danger,
                ],
            },
        ],
    };
    $: topSymbolData = {
        labels: dirData.topSymbols?.labels || [],
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.pnl"),
                data: dirData.topSymbols?.data || [],
                backgroundColor: themeColors.success,
            },
        ],
    };
    $: bottomSymbolData = {
        labels: dirData.bottomSymbols?.labels || [],
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.pnl"),
                data: dirData.bottomSymbols?.data || [],
                backgroundColor: themeColors.danger,
            },
        ],
    };
    $: directionEvolutionData = {
        labels: (dirData.longCurve || []).map((d) =>
            new Date(d.x).toLocaleDateString()
        ),
        datasets: [
            {
                label:
                    $_("journal.deepDive.charts.titles.longVsShortEvolution") +
                    " (" +
                    $_("journal.labels.long") +
                    ")",
                data: (dirData.longCurve || []).map((d) => d.y),
                borderColor: themeColors.success,
                backgroundColor: hexToRgba(themeColors.success, 0.1),
                fill: true,
                tension: 0.1,
            },
            {
                label:
                    $_("journal.deepDive.charts.titles.longVsShortEvolution") +
                    " (" +
                    $_("journal.labels.short") +
                    ")",
                data: (dirData.shortCurve || []).map((d) => d.y),
                borderColor: themeColors.danger,
                backgroundColor: hexToRgba(themeColors.danger, 0.1),
                fill: true,
                tension: 0.1,
            },
        ],
    };

    // Discipline Data
    $: discData = $disciplineMetrics || {};
    $: hourlyData = {
        labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.pnl"),
                data: discData.hourlyPnl || [],
                backgroundColor: (discData.hourlyPnl || []).map((d) =>
                    d >= 0 ? themeColors.success : themeColors.danger
                ),
            },
        ],
    };
    $: riskData = {
        labels: Object.keys(discData.riskBuckets || {}),
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.trades"),
                data: Object.values(discData.riskBuckets || {}),
                backgroundColor: themeColors.warning,
            },
        ],
    };

    // Cost Data
    $: costData = $costMetrics || {};
    $: grossNetData = {
        labels: [$_("journal.labels.gross"), $_("journal.labels.net")],
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.pnl"),
                data: [costData.gross || 0, costData.net || 0],
                backgroundColor: [
                    themeColors.accent,
                    (costData.net || 0) >= 0
                        ? themeColors.success
                        : themeColors.danger,
                ],
            },
        ],
    };
    $: feeCurveData = {
        labels: (costData.feeCurve || []).map((d) =>
            new Date(d.x).toLocaleDateString()
        ),
        datasets: [
            {
                label: $_("journal.deepDive.charts.titles.cumulativeFees"),
                data: (costData.feeCurve || []).map((d) => d.y),
                borderColor: themeColors.warning,
                fill: true,
                backgroundColor: hexToRgba(themeColors.warning, 0.1),
            },
        ],
    };
    $: feeStructureData = {
        labels: [
            $_("journal.deepDive.charts.labels.trading"),
            $_("journal.deepDive.charts.labels.funding"),
        ],
        datasets: [
            {
                data: [
                    costData.feeStructure?.trading || 0,
                    costData.feeStructure?.funding || 0,
                ],
                backgroundColor: [
                    themeColors.textSecondary,
                    themeColors.danger,
                ],
                borderWidth: 0,
            },
        ],
    };
</script>

{#if isPro && isDeepDiveUnlocked}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {#if activePreset === "performance"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <LineChart
                    data={equityData}
                    title={$_("journal.deepDive.charts.titles.equityCurve")}
                    yLabel={$_("journal.deepDive.charts.labels.pnl")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.equityCurve"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <LineChart
                    data={drawdownData}
                    title={$_("journal.deepDive.charts.titles.drawdown")}
                    yLabel="$"
                    description={$_(
                        "journal.deepDive.charts.descriptions.drawdown"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <BarChart
                    data={monthlyData}
                    title={$_("journal.deepDive.charts.titles.monthlyPnl")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.monthlyPnl"
                    )}
                />
            </div>
        {:else if activePreset === "quality"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <DoughnutChart
                    data={winLossChartData}
                    title={$_("journal.deepDive.charts.titles.winRate")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.winLoss"
                    )}
                    options={{
                        plugins: {
                            legend: {
                                display: true,
                                position: "right",
                                labels: {
                                    boxWidth: 10,
                                    padding: 10,
                                    color: "#94a3b8",
                                    font: { size: 10 },
                                },
                            },
                        },
                    }}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <BarChart
                    data={rDistData}
                    title={$_("journal.deepDive.charts.titles.rMultipleDist")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.rMultipleDist"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <LineChart
                    data={cumRData}
                    title={$_("journal.deepDive.charts.titles.cumulativeR")}
                    yLabel="R"
                    description={$_(
                        "journal.deepDive.charts.descriptions.cumulativeR"
                    )}
                />
            </div>
        {:else if activePreset === "direction"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <BarChart
                    data={topSymbolData}
                    title={$_("journal.deepDive.charts.titles.topSymbols")}
                    horizontal={true}
                    description={$_(
                        "journal.deepDive.charts.descriptions.topSymbols"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <BarChart
                    data={bottomSymbolData}
                    title={$_("journal.deepDive.charts.titles.bottomSymbols")}
                    horizontal={true}
                    description={$_(
                        "journal.deepDive.charts.descriptions.bottomSymbols"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <BarChart
                    data={longShortData}
                    title={$_("journal.deepDive.charts.titles.longVsShort")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.longVsShort"
                    )}
                />
            </div>

            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2 h-[250px]"
            >
                <LineChart
                    data={directionEvolutionData}
                    title={$_(
                        "journal.deepDive.charts.titles.longVsShortEvolution"
                    )}
                    description={$_(
                        "journal.deepDive.charts.descriptions.directionEvolution"
                    )}
                />
            </div>

            <!-- Stats Tile (1/3 width) -->
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px] flex flex-col justify-center"
            >
                <div class="text-center mb-4">
                    <span
                        class="text-xs font-bold text-[#94a3b8] uppercase tracking-wider"
                        >{$_(
                            "journal.deepDive.charts.labels.tradingStats"
                        )}</span
                    >
                </div>
                <div class="flex flex-col gap-3 text-sm">
                    <div class="flex justify-between items-center">
                        <span
                            class="text-[var(--text-secondary)] text-[10px] uppercase"
                            >{$_(
                                "journal.deepDive.charts.titles.winRate"
                            )}</span
                        >
                        <span
                            class="font-mono font-bold {qualData?.stats?.winRate?.greaterThanOrEqualTo(
                                50
                            )
                                ? 'text-[var(--success-color)]'
                                : 'text-[var(--danger-color)]'}"
                        >
                            {qualData?.stats?.winRate
                                ? formatDynamicDecimal(
                                      qualData.stats.winRate,
                                      2
                                  )
                                : "0"}%
                        </span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span
                            class="text-[var(--text-secondary)] text-[10px] uppercase"
                            >{$_(
                                "journal.deepDive.charts.labels.profitFactor"
                            )}</span
                        >
                        <span
                            class="font-mono font-bold {qualData?.detailedStats
                                ?.profitFactor >= 1.5
                                ? 'text-[var(--success-color)]'
                                : qualData?.detailedStats?.profitFactor >= 1
                                ? 'text-[var(--warning-color)]'
                                : 'text-[var(--danger-color)]'}"
                        >
                            {qualData?.detailedStats?.profitFactor
                                ? formatDynamicDecimal(
                                      qualData.detailedStats.profitFactor,
                                      2
                                  )
                                : "0"}
                        </span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span
                            class="text-[var(--text-secondary)] text-[10px] uppercase"
                            >{$_(
                                "journal.deepDive.charts.labels.expectancy"
                            )}</span
                        >
                        <span
                            class="font-mono font-bold {(qualData?.detailedStats
                                ?.expectancy || 0) > 0
                                ? 'text-[var(--success-color)]'
                                : 'text-[var(--danger-color)]'}"
                        >
                            ${qualData?.detailedStats?.expectancy
                                ? formatDynamicDecimal(
                                      qualData.detailedStats.expectancy,
                                      2
                                  )
                                : "0"}
                        </span>
                    </div>
                    <div class="flex justify-between items-center text-[11px]">
                        <span class="text-[var(--text-secondary)] uppercase"
                            >{$_(
                                "journal.deepDive.charts.labels.avgWinLoss"
                            )}</span
                        >
                        <div class="flex gap-1">
                            <span class="text-[var(--success-color)]"
                                >${qualData?.detailedStats?.avgWin
                                    ? formatDynamicDecimal(
                                          qualData.detailedStats.avgWin,
                                          2
                                      )
                                    : "0"}</span
                            >
                            <span class="text-[var(--text-secondary)]">/</span>
                            <span class="text-[var(--danger-color)]"
                                >${qualData?.detailedStats?.avgLoss
                                    ? formatDynamicDecimal(
                                          qualData.detailedStats.avgLoss,
                                          2
                                      )
                                    : "0"}</span
                            >
                        </div>
                    </div>
                    <div class="flex justify-between items-center text-[10px]">
                        <span class="text-[var(--text-secondary)] uppercase"
                            >{$_(
                                "journal.deepDive.charts.labels.winRateLS"
                            )}</span
                        >
                        <div class="flex gap-2">
                            <span
                                style="color: {themeColors
                                    ? hexToRgba(themeColors.success, 1)
                                    : '#10b981'}"
                                >{$_("journal.labels.long")}: {qualData
                                    ?.detailedStats?.winRateLong
                                    ? formatDynamicDecimal(
                                          qualData.detailedStats.winRateLong,
                                          1
                                      )
                                    : "0"}%</span
                            >
                            <span
                                style="color: {themeColors
                                    ? hexToRgba(themeColors.success, 0.6)
                                    : '#10b981'}"
                                >{$_("journal.labels.short")}: {qualData
                                    ?.detailedStats?.winRateShort
                                    ? formatDynamicDecimal(
                                          qualData.detailedStats.winRateShort,
                                          1
                                      )
                                    : "0"}%</span
                            >
                        </div>
                    </div>
                </div>
            </div>
        {:else if activePreset === "discipline"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <BarChart
                    data={hourlyData}
                    title={$_("journal.deepDive.charts.titles.hourlyPnl")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.hourlyPnl"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <BarChart
                    data={riskData}
                    title={$_("journal.deepDive.charts.titles.riskConsistency")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.riskConsistency"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex flex-col justify-center gap-4"
            >
                <div class="text-center">
                    <div class="text-xs uppercase text-[var(--text-secondary)]">
                        {$_("journal.deepDive.charts.labels.longestWinStreak")}
                    </div>
                    <div class="text-3xl font-bold text-[var(--success-color)]">
                        {discData?.streak?.win || 0}
                    </div>
                </div>
                <div class="text-center">
                    <div class="text-xs uppercase text-[var(--text-secondary)]">
                        {$_("journal.deepDive.charts.labels.longestLossStreak")}
                    </div>
                    <div class="text-3xl font-bold text-[var(--danger-color)]">
                        {discData?.streak?.loss || 0}
                    </div>
                </div>
            </div>
        {:else if activePreset === "costs"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <BarChart
                    data={grossNetData}
                    title={$_("journal.deepDive.charts.titles.grossVsNet")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.grossVsNet"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <LineChart
                    data={feeCurveData}
                    title={$_("journal.deepDive.charts.titles.cumulativeFees")}
                    yLabel="$"
                    description={$_(
                        "journal.deepDive.charts.descriptions.cumulativeFees"
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
            >
                <DoughnutChart
                    data={feeStructureData}
                    title={$_("journal.deepDive.charts.titles.feeBreakdown")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.feeBreakdown"
                    )}
                />
            </div>
        {/if}
    </div>
{/if}
