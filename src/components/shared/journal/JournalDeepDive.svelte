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

<!-- Add Imports for Perf and Quality at top if missed -->
<script module>
    // ...
</script>

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { formatDynamicDecimal } from "../../../utils/utils";
    import { hexToRgba } from "../../../utils/colors";
    import { journalState } from "../../../stores/journal.svelte";
    import { calculator } from "../../../lib/calculator";
    import DashboardNav from "../DashboardNav.svelte";
    import LineChart from "../charts/LineChart.svelte";
    import BarChart from "../charts/BarChart.svelte";
    import DoughnutChart from "../charts/DoughnutChart.svelte";
    import BubbleChart from "../charts/BubbleChart.svelte";
    import ScatterChart from "../charts/ScatterChart.svelte";
    import RadarChart from "../charts/RadarChart.svelte";
    import CalendarHeatmap from "../charts/CalendarHeatmap.svelte";

    interface Props {
        themeColors: any;
        onfilterDateChange?: (data: { date: string }) => void;
    }

    let { themeColors, onfilterDateChange }: Props = $props();

    // Local State
    let activeDeepDivePreset = $state("performance");
    let selectedYear = $state(new Date().getFullYear());

    const dayMap: Record<string, string> = {
        Mon: "mon",
        Tue: "tue",
        Wed: "wed",
        Thu: "thu",
        Fri: "fri",
        Sat: "sat",
        Sun: "sun",
    };

    // --- Data Logic derived from stores ---
    let journal = $derived(journalState.entries);

    // 1. PERFORMANCE (Trends)
    let rollingData = $derived(
        journal ? calculator.getRollingData(journal) : null,
    );
    let rollingWinRateData = $derived(
        rollingData
            ? {
                  labels: rollingData.labels || [],
                  datasets: [
                      {
                          label: $_(
                              "journal.deepDive.charts.labels.rollingWinRate",
                          ),
                          data: rollingData.winRates || [],
                          borderColor: themeColors.success,
                          backgroundColor: hexToRgba(themeColors.success, 0.1),
                          fill: true,
                          tension: 0.3,
                      },
                  ],
              }
            : null,
    );
    let rollingPFData = $derived(
        rollingData
            ? {
                  labels: rollingData.labels || [],
                  datasets: [
                      {
                          label: $_("journal.deepDive.charts.labels.rollingPF"),
                          data: rollingData.profitFactors || [],
                          borderColor: themeColors.warning,
                          backgroundColor: hexToRgba(themeColors.warning, 0.1),
                          fill: true,
                          tension: 0.3,
                      },
                  ],
              }
            : null,
    );
    // Performance Drawdown
    let perfMetrics = $derived(journalState.performanceMetrics || {});
    let drawdownData = $derived({
        labels: (perfMetrics.drawdownSeries || []).map((d) =>
            new Date(d.x).toLocaleDateString(),
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
    });

    // 2. EXECUTION
    let execData = $derived(journalState.executionMetrics || {});
    let qualMetrics = $derived(journalState.qualityMetrics || {});
    let sixSegmentData = $derived({
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
                data: qualMetrics.sixSegmentData || [],
                backgroundColor: [
                    themeColors.success, // Win Long
                    hexToRgba(themeColors.success, 0.6), // Win Short
                    themeColors.danger, // Loss Long
                    hexToRgba(themeColors.danger, 0.6), // Loss Short
                    themeColors.textSecondary, // BE Long
                    hexToRgba(themeColors.textSecondary, 0.6), // BE Short
                ],
            },
        ],
    });

    // 3. RISK
    let riskRadarData = $derived(journalState.riskRadarMetrics || {});
    let rDistData = $derived({
        labels: Object.keys(qualMetrics.rHistogram || {}),
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.trades"),
                data: Object.values(qualMetrics.rHistogram || {}),
                backgroundColor: themeColors.accent,
            },
        ],
    });
    let riskScatterData = $derived(journalState.riskMetrics || {});
    let riskRewardScatter = $derived({
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.trades"),
                data: riskScatterData.scatterData || [],
                backgroundColor: (riskScatterData.scatterData || []).map((d) =>
                    d.y >= 0 ? themeColors.success : themeColors.danger,
                ),
            },
        ],
    });

    // 4. MARKET
    let marketCtx = $derived(journalState.marketContextMetrics || null);
    let marketAtrData = $derived(
        marketCtx
            ? {
                  labels: [
                      "Low Volatility",
                      "Normal Volatility",
                      "High Volatility",
                  ],
                  datasets: [
                      {
                          label: $_("journal.deepDive.charts.labels.pnl"),
                          data: [
                              marketCtx.low?.pnl || 0,
                              marketCtx.normal?.pnl || 0,
                              marketCtx.high?.pnl || 0,
                          ],
                          backgroundColor: [
                              (marketCtx.low?.pnl || 0) >= 0
                                  ? themeColors.success
                                  : themeColors.danger,
                              (marketCtx.normal?.pnl || 0) >= 0
                                  ? themeColors.success
                                  : themeColors.danger,
                              (marketCtx.high?.pnl || 0) >= 0
                                  ? themeColors.success
                                  : themeColors.danger,
                          ],
                      },
                  ],
              }
            : null,
    );

    let marketData = $derived(journalState.marketMetrics || {});
    let leverageDistData = $derived({
        labels: marketData.leverageLabels || [],
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.count"),
                data: marketData.leverageDist || [],
                backgroundColor: themeColors.accent,
            },
        ],
    });
    // Asset Bubble
    let dirData = $derived(
        journal
            ? calculator.getDirectionData(journal)
            : {
                  longPnl: 0,
                  shortPnl: 0,
                  topSymbols: { labels: [], data: [] },
                  bottomSymbols: { labels: [], data: [] },
                  longCurve: [],
                  shortCurve: [],
              },
    );
    let assetData = $derived(journalState.assetMetrics || {});
    let assetBubbleData = $derived({
        datasets: [
            {
                label: $_("journal.deepDive.assets"),
                data: assetData.bubbleData || [],
                backgroundColor: (assetData.bubbleData || []).map((d) =>
                    d.y >= 0
                        ? hexToRgba(themeColors.success, 0.6)
                        : hexToRgba(themeColors.danger, 0.6),
                ),
            },
        ],
    });

    // 5. LEAKS
    let leakageData = $derived(
        journal
            ? calculator.getLeakageData(journal)
            : {
                  waterfallData: {
                      grossProfit: 0,
                      fees: 0,
                      grossLoss: 0,
                      netResult: 0,
                  },
                  worstTags: [],
                  worstHours: [],
              },
    );
    let leakageWaterfallChartData = $derived({
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
                    leakageData.waterfallData?.grossProfit || 0,
                    leakageData.waterfallData?.fees || 0,
                    leakageData.waterfallData?.grossLoss || 0,
                    leakageData.waterfallData?.netResult || 0,
                ],
                backgroundColor: [
                    themeColors.success,
                    themeColors.warning,
                    themeColors.danger,
                    (leakageData.waterfallData?.netResult || 0) >= 0
                        ? themeColors.success
                        : themeColors.danger,
                ],
            },
        ],
    });
    let leakageTagData = $derived({
        labels: (leakageData.worstTags || []).map((t) =>
            t.label === "No Tag"
                ? $_("journal.deepDive.charts.labels.noTag")
                : t.label,
        ),
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.pnl"),
                data: (leakageData.worstTags || []).map((t) => t.pnl),
                backgroundColor: themeColors.danger,
            },
        ],
    });
    let leakageTimingData = $derived({
        labels: (leakageData.worstHours || []).map((h) => `${h.hour}h`),
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.grossLoss"),
                data: (leakageData.worstHours || []).map((h) => h.loss),
                backgroundColor: themeColors.danger,
            },
        ],
    });

    // 6. TIME
    let confluenceData = $derived(journalState.confluenceMetrics || []);
    let calendarData = $derived(journalState.calendarMetrics || []);
    let availableYears = $derived(
        (() => {
            const years = new Set<number>();
            years.add(new Date().getFullYear());
            (calendarData || []).forEach((d) => {
                const y = new Date(d.date).getFullYear();
                if (!isNaN(y)) years.add(y);
            });
            return Array.from(years).sort((a, b) => b - a);
        })(),
    );
    function handleCalendarClick(event: CustomEvent) {
        onfilterDateChange?.({ date: event.detail.date });
    }

    // 7. STRATEGIES
    let tagData = $derived(journalState.tagMetrics || {});
    let tagPnlData = $derived({
        labels: tagData.labels || [],
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.pnl"),
                data: tagData.pnlData || [],
                backgroundColor: (tagData.pnlData || []).map((d) =>
                    d >= 0 ? themeColors.success : themeColors.danger,
                ),
            },
        ],
    });
    let tagEvolutionData = $derived(
        journalState.tagEvolutionMetrics || { datasets: [] },
    );
    let tagEvolutionChartData = $derived({
        datasets: (tagEvolutionData.datasets || []).map((ds, i) => ({
            label: ds.label,
            data: (ds.data || []).map((d: any) => ({
                x: new Date(d.x).toLocaleDateString(),
                y: d.y,
            })),
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
    });

    // 8. BEHAVIOR (Psychology)
    let psychData = $derived(journalState.psychologyMetrics || {});
    let winStreakData = $derived({
        labels: psychData.streakLabels || [],
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.frequency"),
                data: psychData.winStreakData || [],
                backgroundColor: themeColors.success,
            },
        ],
    });
    let lossStreakData = $derived({
        labels: psychData.streakLabels || [],
        datasets: [
            {
                label: $_("journal.deepDive.charts.labels.frequency"),
                data: psychData.lossStreakData || [],
                backgroundColor: themeColors.danger,
            },
        ],
    });

    // 9. FORECAST (Monte Carlo)
    let monteCarloData = $derived(
        journal ? calculator.getMonteCarloData(journal) : null,
    );
    let monteCarloChartData = $derived(
        monteCarloData
            ? {
                  labels: monteCarloData.labels || [],
                  datasets: [
                      {
                          label: $_("journal.deepDive.charts.labels.simBest"),
                          data: monteCarloData.upperPath || [],
                          borderColor: themeColors.success,
                          backgroundColor: "transparent",
                          borderDash: [5, 5],
                          borderWidth: 1,
                          pointRadius: 0,
                      },
                      {
                          label: $_("journal.deepDive.charts.labels.simMedian"),
                          data: monteCarloData.medianPath || [],
                          borderColor: themeColors.accent,
                          backgroundColor: "transparent",
                          borderWidth: 2,
                          pointRadius: 0,
                      },
                      {
                          label: $_("journal.deepDive.charts.labels.simWorst"),
                          data: monteCarloData.lowerPath || [],
                          borderColor: themeColors.danger,
                          backgroundColor: "transparent",
                          borderDash: [5, 5],
                          borderWidth: 1,
                          pointRadius: 0,
                      },
                      ...(monteCarloData.randomPaths || []).map((path, i) => ({
                          label: `${$_("journal.deepDive.charts.labels.simRandom")}${i + 1}`,
                          data: path,
                          borderColor: hexToRgba(
                              themeColors.textSecondary,
                              0.2,
                          ),
                          backgroundColor: "transparent",
                          borderWidth: 1,
                          pointRadius: 0,
                      })),
                  ],
              }
            : null,
    );

    // 10. SYSTEM QUALITY (SQN)
    let sqnMetrics = $derived(journalState.systemQualityMetrics || null);
    let rollingSQNData = $derived(
        rollingData
            ? {
                  labels: rollingData.labels || [],
                  datasets: [
                      {
                          label: $_(
                              "journal.deepDive.charts.labels.rollingSQN",
                          ),
                          data: rollingData.sqnValues || [],
                          borderColor: themeColors.accent,
                          backgroundColor: hexToRgba(themeColors.accent, 0.1),
                          fill: true,
                          tension: 0.3,
                      },
                  ],
              }
            : null,
    );
</script>

<div class="mt-12 border-t border-[var(--border-color)] pt-12 relative z-10">
    <div class="flex items-center gap-2 mb-2">
        <span class="text-2xl">🦆</span>
        <h3 class="text-xl font-bold text-[var(--text-primary)]">
            {$_("journal.deepDive.title")}
        </h3>
    </div>

    <DashboardNav
        activePreset={activeDeepDivePreset}
        presets={[
            { id: "performance", label: $_("journal.deepDive.performance") },
            { id: "execution", label: $_("journal.deepDive.execution") },
            { id: "risk", label: $_("journal.deepDive.risk") },
            { id: "market", label: $_("journal.deepDive.market") },
            { id: "leakage", label: $_("journal.deepDive.leakage") },
            { id: "time", label: $_("journal.deepDive.time") },
            { id: "strategies", label: $_("journal.deepDive.strategies") },
            { id: "behavior", label: $_("journal.deepDive.behavior") },
            { id: "forecast", label: $_("journal.deepDive.forecast") },
            { id: "quality", label: $_("journal.deepDive.systemQuality") },
        ]}
        onselect={(id) => (activeDeepDivePreset = id)}
    />

    <div
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 min-h-[250px] mt-4"
    >
        <!-- 1. PERFORMANCE -->
        {#if activeDeepDivePreset === "performance"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2"
            >
                <LineChart
                    data={drawdownData}
                    title={$_("journal.deepDive.charts.titles.drawdown")}
                    yLabel="{$_('journal.deepDive.charts.titles.drawdown')} {$_(
                        'journal.deepDive.charts.units.currency',
                    )}"
                    description={$_(
                        "journal.deepDive.charts.descriptions.drawdown",
                    )}
                />
            </div>
            <div class="flex flex-col gap-4 col-span-1">
                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
                >
                    {#if rollingWinRateData}
                        <div class="h-44">
                            <LineChart
                                data={rollingWinRateData}
                                title={$_(
                                    "journal.deepDive.charts.labels.rollingWinRate",
                                )}
                                yLabel="%"
                                description={$_(
                                    "journal.deepDive.charts.descriptions.rollingWinRate",
                                )}
                            />
                        </div>
                    {:else}
                        <div class="flex items-center justify-center h-full">
                            {$_("journal.noData")}
                        </div>
                    {/if}
                </div>
                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
                >
                    {#if rollingPFData}
                        <div class="h-44">
                            <LineChart
                                data={rollingPFData}
                                title={$_(
                                    "journal.deepDive.charts.labels.rollingPF",
                                )}
                                yLabel="PF"
                                description={$_(
                                    "journal.deepDive.charts.descriptions.rollingPF",
                                )}
                            />
                        </div>
                    {:else}
                        <div class="flex items-center justify-center h-full">
                            {$_("journal.noData")}
                        </div>
                    {/if}
                </div>
            </div>

            <!-- 2. EXECUTION -->
        {:else if activeDeepDivePreset === "execution"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2"
            >
                <ScatterChart
                    data={execData}
                    title={$_("journal.deepDive.charts.titles.mfeVsMae")}
                    xLabel="MAE (R)"
                    yLabel="MFE (R)"
                    description={$_(
                        "journal.deepDive.charts.descriptions.mfeVsMae",
                    )}
                    showEfficiencyLines={true}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <DoughnutChart
                    data={sixSegmentData}
                    title={$_("journal.deepDive.charts.titles.sixSegment")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.sixSegment",
                    )}
                />
            </div>

            <!-- 3. RISK -->
        {:else if activeDeepDivePreset === "risk"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <RadarChart
                    data={riskRadarData}
                    title={$_("journal.deepDive.charts.titles.riskRadar")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.riskRadar",
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <BarChart
                    data={rDistData}
                    title={$_("journal.deepDive.charts.titles.rMultipleDist")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.rMultipleDist",
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <BubbleChart
                    data={riskRewardScatter}
                    title={$_("journal.deepDive.charts.riskRewardScatter")}
                    xLabel={$_("journal.deepDive.charts.labels.riskAmount")}
                    yLabel={$_("journal.deepDive.charts.labels.realizedPnl")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.riskRewardScatter",
                    )}
                />
            </div>

            <!-- 4. MARKET -->
        {:else if activeDeepDivePreset === "market"}
            <div class="flex flex-col gap-4 col-span-1">
                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-full"
                >
                    {#if marketAtrData}
                        <div class="h-44">
                            <BarChart
                                data={marketAtrData}
                                title={$_(
                                    "journal.deepDive.charts.titles.atrMatrix",
                                )}
                                description={$_(
                                    "journal.deepDive.charts.descriptions.atrMatrix",
                                )}
                            />
                        </div>
                    {:else}
                        <div class="flex items-center justify-center h-full">
                            {$_("journal.noData")}
                        </div>
                    {/if}
                </div>
                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-full"
                >
                    <div class="h-44">
                        <BarChart
                            data={leverageDistData}
                            title={$_("journal.deepDive.charts.leverageDist")}
                            description={$_(
                                "journal.deepDive.charts.descriptions.leverageDist",
                            )}
                        />
                    </div>
                </div>
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2"
            >
                <BubbleChart
                    data={assetBubbleData}
                    title={$_("journal.deepDive.charts.assetBubble")}
                    xLabel="Win Rate %"
                    yLabel="PnL"
                    description={$_(
                        "journal.deepDive.charts.descriptions.assetBubble",
                    )}
                />
            </div>

            <!-- 5. LEAKAGE -->
        {:else if activeDeepDivePreset === "leakage"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <BarChart
                    data={leakageWaterfallChartData}
                    title={$_("journal.deepDive.charts.labels.profitRetention")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.leakageWaterfall",
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <BarChart
                    data={leakageTagData}
                    title={$_("journal.deepDive.charts.titles.strategyLeakage")}
                    horizontal={true}
                    description={$_(
                        "journal.deepDive.charts.descriptions.leakageTags",
                    )}
                />
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <BarChart
                    data={leakageTimingData}
                    title={$_("journal.deepDive.charts.titles.timeLeakage")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.leakageTiming",
                    )}
                />
            </div>

            <!-- 6. TIME -->
        {:else if activeDeepDivePreset === "time"}
            <div
                class="col-span-1 md:col-span-2 lg:col-span-3 flex flex-col items-center mb-6"
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
                                onclick={() => (selectedYear = year)}
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

            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-3 h-[300px] overflow-auto"
            >
                <!-- Confluence Matrix (Existing Code) -->
                <div
                    class="text-sm font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider"
                >
                    {$_("journal.deepDive.charts.labels.confluence")}
                </div>
                <div
                    class="grid grid-cols-[auto_repeat(24,1fr)] gap-1 text-[10px] overflow-x-auto pb-2"
                >
                    <div class="h-6"></div>
                    {#each Array(24) as _, i}
                        <div class="text-center text-[var(--text-secondary)]">
                            {i}
                        </div>
                    {/each}
                    {#each confluenceData as row}
                        <div
                            class="font-bold text-[var(--text-primary)] pr-2 flex items-center h-8"
                        >
                            {$_(
                                ("journal.days." +
                                    (dayMap[row.day] || "mon")) as any,
                            )}
                        </div>
                        {#each row.hours as cell}
                            <div
                                class="h-8 rounded w-full flex items-center justify-center relative group"
                                style="background-color: {cell.pnl > 0
                                    ? `rgba(var(--success-rgb), ${Math.min(
                                          cell.pnl / 100,
                                          1,
                                      )})`
                                    : cell.pnl < 0
                                      ? `rgba(var(--danger-rgb), ${Math.min(
                                            Math.abs(cell.pnl) / 100,
                                            1,
                                        )})`
                                      : 'var(--bg-tertiary)'};
                                            border: 1px solid {cell.count > 0
                                    ? 'transparent'
                                    : 'var(--border-color)'}"
                            >
                                {#if cell.count > 0}
                                    <span
                                        class="text-[9px] font-mono {Math.abs(
                                            cell.pnl,
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
                                            {$_(
                                                ("journal.days." +
                                                    (dayMap[row.day] ||
                                                        "mon")) as any,
                                            )}
                                            {cell.hour}:00
                                        </div>
                                        <div
                                            class={cell.pnl >= 0
                                                ? "text-[var(--success-color)]"
                                                : "text-[var(--danger-color)]"}
                                        >
                                            {$_(
                                                "journal.deepDive.charts.labels.pnl",
                                            )}: {formatDynamicDecimal(
                                                cell.pnl,
                                                2,
                                            )}
                                        </div>
                                        <div>
                                            {$_(
                                                "journal.deepDive.charts.labels.trades",
                                            )}: {cell.count}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    {/each}
                </div>
            </div>

            <!-- 7. STRATEGIES -->
        {:else if activeDeepDivePreset === "strategies"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2"
            >
                <LineChart
                    data={tagEvolutionChartData}
                    title={$_(
                        "journal.deepDive.charts.titles.strategyEvolution",
                    )}
                    description={$_(
                        "journal.deepDive.charts.descriptions.tagEvolution",
                    )}
                />
            </div>
            <div class="flex flex-col gap-4 col-span-1">
                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-full"
                >
                    <div class="h-44">
                        <BarChart
                            data={tagPnlData}
                            title={$_("journal.deepDive.charts.tagPerformance")}
                        />
                    </div>
                </div>
                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex items-center justify-center p-6 min-h-[160px]"
                >
                    <div class="text-center">
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
                                <div
                                    class="text-[var(--text-primary)] font-mono"
                                >
                                    ${formatDynamicDecimal(
                                        tagData.pnlData[bestIdx],
                                        2,
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
            </div>

            <!-- 8. BEHAVIOR -->
        {:else if activeDeepDivePreset === "behavior"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
            >
                <BarChart
                    data={winStreakData}
                    title={$_("journal.deepDive.charts.winStreak")}
                    description={$_(
                        "journal.deepDive.charts.descriptions.winStreak",
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
                        "journal.deepDive.charts.descriptions.lossStreak",
                    )}
                />
            </div>

            <!-- 9. FORECAST -->
        {:else if activeDeepDivePreset === "forecast"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-3"
            >
                {#if monteCarloChartData}
                    <LineChart
                        data={monteCarloChartData}
                        title={$_("journal.deepDive.charts.labels.forecast")}
                        yLabel={$_(
                            "journal.deepDive.charts.labels.equityChange",
                        )}
                        description={$_(
                            "journal.deepDive.charts.descriptions.forecast",
                        )}
                    />
                {:else}
                    <div
                        class="flex items-center justify-center h-full text-[var(--text-secondary)]"
                    >
                        {$_("journal.noData")}
                    </div>
                {/if}
            </div>

            <!-- 10. SYSTEM QUALITY -->
        {:else if activeDeepDivePreset === "quality"}
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2"
            >
                {#if rollingSQNData}
                    <div class="h-64">
                        <LineChart
                            data={rollingSQNData}
                            title={$_(
                                "journal.deepDive.charts.labels.rollingSQN",
                            )}
                            yLabel="SQN"
                            description={$_(
                                "journal.deepDive.charts.descriptions.rollingSQN",
                            )}
                        />
                    </div>
                {:else}
                    <div class="flex items-center justify-center h-full">
                        {$_("journal.noData")}
                    </div>
                {/if}
            </div>
            <div
                class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex items-center justify-center col-span-1 min-h-[250px]"
            >
                {#if sqnMetrics}
                    <div class="text-center p-6">
                        <div
                            class="text-sm text-[var(--text-secondary)] uppercase tracking-widest"
                        >
                            Current SQN
                        </div>
                        <div
                            class="text-5xl font-bold text-[var(--accent-color)] my-4"
                        >
                            {sqnMetrics.sqn.toFixed(2)}
                        </div>
                        <div
                            class="px-4 py-1 rounded-full bg-[var(--bg-primary)] text-xl font-bold text-[var(--text-primary)] inline-block border border-[var(--border-color)]"
                        >
                            {sqnMetrics.classification}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
