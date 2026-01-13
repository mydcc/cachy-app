<script lang="ts">
    import { tradeStore } from "../../stores/tradeStore";
    import { settingsStore } from "../../stores/settingsStore";
    import { journalStore } from "../../stores/journalStore";
    import { uiStore } from "../../stores/uiStore";
    import { app } from "../../services/app";
    import { imgbbService } from "../../services/imgbbService";
    import { calculator } from "../../lib/calculator";
    import { _, locale } from "../../locales/i18n";
    import { icons, CONSTANTS } from "../../lib/constants";
    import { browser } from "$app/environment";
    import { getComputedColor, hexToRgba } from "../../utils/colors";
    import ModalFrame from "./ModalFrame.svelte";
    import DashboardNav from "./DashboardNav.svelte";
    import LineChart from "./charts/LineChart.svelte";
    import BarChart from "./charts/BarChart.svelte";
    import DoughnutChart from "./charts/DoughnutChart.svelte";
    import BubbleChart from "./charts/BubbleChart.svelte";
    import CalendarHeatmap from "./charts/CalendarHeatmap.svelte";
    import Tooltip from "./Tooltip.svelte";
    import JournalEntryTags from "./JournalEntryTags.svelte";
    import { clickOutside } from "../../lib/actions/clickOutside";
    import { Decimal } from "decimal.js";
    import { onMount, onDestroy } from "svelte";

    // --- State for Dashboard ---
    let activePreset = "performance";
    let activeDeepDivePreset = "timing";
    let showUnlockOverlay = false;
    let unlockOverlayMessage = "";

    // --- Cheat Code Logic ---
    const CODE_UNLOCK = "VIPENTE2026";
    const CODE_LOCK = "VIPDEEPDIVE";
    const CODE_SPACE = "VIPSPACE2026";
    const CODE_BONUS = "VIPBONUS2026";
    const CODE_STREAK = "VIPSTREAK2026";

    const MAX_CODE_LENGTH = Math.max(
        CODE_UNLOCK.length,
        CODE_LOCK.length,
        CODE_SPACE.length,
        CODE_BONUS.length,
        CODE_STREAK.length,
    );

    let inputBuffer: string[] = [];

    function handleKeydown(event: KeyboardEvent) {
        // Ignore if user is typing in an input field
        const target = event.target as HTMLElement;
        if (
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable
        )
            return;

        const key = event.key.toUpperCase();
        if (key.length === 1) {
            inputBuffer.push(key);
            if (inputBuffer.length > MAX_CODE_LENGTH) {
                inputBuffer.shift();
            }

            const bufferStr = inputBuffer.join("");

            // VIPENTE2026: Pro Active + VIP Theme Active => Unlock Charts
            if (bufferStr.endsWith(CODE_UNLOCK)) {
                if ($settingsStore.isPro && $uiStore.currentTheme === "VIP") {
                    unlockDeepDive();
                }
            }
            // VIPDEEPDIVE: Lock Charts (Always works if matched)
            else if (bufferStr.endsWith(CODE_LOCK)) {
                lockDeepDive();
            }
            // VIPSPACE2026: Pro Active + VIP Theme Active => Space Dialog + Link
            else if (bufferStr.endsWith(CODE_SPACE)) {
                if ($settingsStore.isPro && $uiStore.currentTheme === "VIP") {
                    activateVipSpace();
                }
            }
            // Placeholders
            else if (bufferStr.endsWith(CODE_BONUS)) {
                inputBuffer = [];
            } else if (bufferStr.endsWith(CODE_STREAK)) {
                inputBuffer = [];
            }
        }
    }

    function unlockDeepDive() {
        if ($settingsStore.isDeepDiveUnlocked) return;
        $settingsStore.isDeepDiveUnlocked = true;
        unlockOverlayMessage = $_("journal.messages.unlocked");
        showUnlockOverlay = true;
        inputBuffer = []; // Reset buffer
        setTimeout(() => {
            showUnlockOverlay = false;
        }, 2000);
    }

    function lockDeepDive() {
        if (!$settingsStore.isDeepDiveUnlocked) return;
        $settingsStore.isDeepDiveUnlocked = false;
        unlockOverlayMessage = $_("journal.messages.deactivated");
        showUnlockOverlay = true;
        inputBuffer = []; // Reset buffer
        setTimeout(() => {
            showUnlockOverlay = false;
        }, 2000);
    }

    function activateVipSpace() {
        unlockOverlayMessage = $_("journal.messages.vipSpaceUnlocked");
        showUnlockOverlay = true;
        inputBuffer = [];
        setTimeout(() => {
            showUnlockOverlay = false;
            if (browser) {
                window.open("https://metaverse.bitunix.cyou", "_blank");
            }
        }, 2000);
    }

    onMount(() => {
        if (browser) {
            window.addEventListener("keydown", handleKeydown);
        }
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener("keydown", handleKeydown);
        }
    });

    // --- Reactive Data for Charts ---
    $: journal = $journalStore;

    // Theme Color Management
    let themeColors = {
        success: "#10b981",
        danger: "#ef4444",
        warning: "#f59e0b",
        accent: "#3b82f6",
        textSecondary: "#64748b",
    };

    function updateThemeColors() {
        if (!browser) return;
        setTimeout(() => {
            themeColors = {
                success: getComputedColor("--success-color") || "#10b981",
                danger: getComputedColor("--danger-color") || "#ef4444",
                warning: getComputedColor("--warning-color") || "#f59e0b",
                accent: getComputedColor("--accent-color") || "#3b82f6",
                textSecondary:
                    getComputedColor("--text-secondary") || "#64748b",
            };
        }, 0);
    }

    let lastTheme = "";
    $: if ($uiStore.currentTheme !== lastTheme) {
        lastTheme = $uiStore.currentTheme;
        updateThemeColors();
    }

    // Performance Data
    $: perfData = calculator.getPerformanceData(journal);
    $: equityData = {
        labels: perfData.equityCurve.map((d) =>
            new Date(d.x).toLocaleDateString(),
        ),
        datasets: [
            {
                label: "Equity",
                data: perfData.equityCurve.map((d) => d.y),
                borderColor: themeColors.success,
                backgroundColor: hexToRgba(themeColors.success, 0.1),
                fill: true,
                tension: 0.1,
            },
        ],
    };
    $: drawdownData = {
        labels: perfData.drawdownSeries.map((d) =>
            new Date(d.x).toLocaleDateString(),
        ),
        datasets: [
            {
                label: "Drawdown",
                data: perfData.drawdownSeries.map((d) => d.y),
                borderColor: themeColors.danger,
                backgroundColor: hexToRgba(themeColors.danger, 0.2),
                fill: true,
                tension: 0.1,
            },
        ],
    };
    $: monthlyData = {
        labels: perfData.monthlyLabels,
        datasets: [
            {
                label: "Monthly PnL",
                data: perfData.monthlyData,
                backgroundColor: perfData.monthlyData.map((d) =>
                    d >= 0 ? themeColors.success : themeColors.danger,
                ),
            },
        ],
    };

    // Quality Data
    $: qualData = calculator.getQualityData(journal);
    $: winLossChartData = {
        labels: [
            "Win Long",
            "Win Short",
            "Loss Long",
            "Loss Short",
            "BE Long",
            "BE Short",
        ],
        datasets: [
            {
                data: qualData.sixSegmentData,
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
        labels: Object.keys(qualData.rHistogram),
        datasets: [
            {
                label: "Trades",
                data: Object.values(qualData.rHistogram),
                backgroundColor: themeColors.accent,
            },
        ],
    };
    $: cumRData = {
        labels: qualData.cumulativeRCurve.map((d) =>
            new Date(d.x).toLocaleDateString(),
        ),
        datasets: [
            {
                label: "Cumulative R",
                data: qualData.cumulativeRCurve.map((d) => d.y),
                borderColor: themeColors.accent,
                backgroundColor: hexToRgba(themeColors.accent, 0.1),
                fill: true,
                tension: 0.1,
            },
        ],
    };

    // Direction Data
    $: dirData = calculator.getDirectionData(journal);
    $: longShortData = {
        labels: ["Long", "Short"],
        datasets: [
            {
                label: "Net PnL",
                data: [dirData.longPnl, dirData.shortPnl],
                backgroundColor: [
                    dirData.longPnl >= 0
                        ? themeColors.success
                        : themeColors.danger,
                    dirData.shortPnl >= 0
                        ? themeColors.success
                        : themeColors.danger,
                ],
            },
        ],
    };
    $: topSymbolData = {
        labels: dirData.topSymbols.labels,
        datasets: [
            {
                label: "PnL",
                data: dirData.topSymbols.data,
                backgroundColor: themeColors.success,
            },
        ],
    };
    $: bottomSymbolData = {
        labels: dirData.bottomSymbols.labels,
        datasets: [
            {
                label: "PnL",
                data: dirData.bottomSymbols.data,
                backgroundColor: themeColors.danger,
            },
        ],
    };

    $: directionEvolutionData = {
        labels: dirData.longCurve.map((d) =>
            new Date(d.x).toLocaleDateString(),
        ),
        datasets: [
            {
                label: "Long Cumulative PnL",
                data: dirData.longCurve.map((d) => d.y),
                borderColor: themeColors.success,
                backgroundColor: hexToRgba(themeColors.success, 0.1),
                fill: true,
                tension: 0.1,
            },
            {
                label: "Short Cumulative PnL",
                data: dirData.shortCurve.map((d) => d.y),
                borderColor: themeColors.danger,
                backgroundColor: hexToRgba(themeColors.danger, 0.1),
                fill: true,
                tension: 0.1,
            },
        ],
    };

    // Strategies (Tags)
    $: tagData = calculator.getTagData(journal);
    $: tagPnlData = {
        labels: tagData.labels,
        datasets: [
            {
                label: "PnL",
                data: tagData.pnlData,
                backgroundColor: tagData.pnlData.map((d) =>
                    d >= 0 ? themeColors.success : themeColors.danger,
                ),
            },
        ],
    };

    // Calendar Data
    $: calendarData = calculator.getCalendarData(journal);

    function handleCalendarClick(event: CustomEvent) {
        const dateStr = event.detail.date;
        // Set filters to this date
        filterDateStart = dateStr;
        filterDateEnd = dateStr;
        // Optionally scroll to table?
    }

    $: availableYears = (() => {
        const years = new Set<number>();
        years.add(new Date().getFullYear()); // Always include current year
        calendarData.forEach((d) => {
            const y = new Date(d.date).getFullYear();
            if (!isNaN(y)) years.add(y);
        });
        return Array.from(years).sort((a, b) => b - a);
    })();

    let selectedYear = new Date().getFullYear();
    // Auto-select latest year with data if current selection has no data?
    // Or just default to current year. Let's default to current year, but if user has data in prev years, they can switch.
    // Actually, let's strictly default to current year, unless we want to be smart.
    // Let's stick to a simple default, but maybe update if availableYears changes and selected isn't in it?
    // No, keep it simple. User can select.

    // Discipline Data
    $: discData = calculator.getDisciplineData(journal);
    $: hourlyData = {
        labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
        datasets: [
            {
                label: "PnL",
                data: discData.hourlyPnl,
                backgroundColor: discData.hourlyPnl.map((d) =>
                    d >= 0 ? themeColors.success : themeColors.danger,
                ),
            },
        ],
    };
    $: riskData = {
        labels: Object.keys(discData.riskBuckets),
        datasets: [
            {
                label: "Trades",
                data: Object.values(discData.riskBuckets),
                backgroundColor: themeColors.warning,
            },
        ],
    };

    // Cost Data
    $: costData = calculator.getCostData(journal);
    $: grossNetData = {
        labels: ["Gross", "Net"],
        datasets: [
            {
                label: "PnL",
                data: [costData.gross, costData.net],
                backgroundColor: [
                    themeColors.accent,
                    costData.net >= 0
                        ? themeColors.success
                        : themeColors.danger,
                ],
            },
        ],
    };
    $: feeCurveData = {
        labels: costData.feeCurve.map((d) =>
            new Date(d.x).toLocaleDateString(),
        ),
        datasets: [
            {
                label: "Cumulative Fees",
                data: costData.feeCurve.map((d) => d.y),
                borderColor: themeColors.warning,
                fill: true,
                backgroundColor: hexToRgba(themeColors.warning, 0.1),
            },
        ],
    };
    $: feeStructureData = {
        labels: ["Trading", "Funding"],
        datasets: [
            {
                data: [
                    costData.feeStructure.trading,
                    costData.feeStructure.funding,
                ],
                backgroundColor: [
                    themeColors.textSecondary,
                    themeColors.danger,
                ],
                borderWidth: 0,
            },
        ],
    };

    // --- Deep Dive Data ---
    // Timing
    $: timingData = calculator.getTimingData(journal);
    $: confluenceData = calculator.getConfluenceData(journal);
    $: durationStats = calculator.getDurationStats(journal);

    $: durationChartData = {
        labels: durationStats.labels,
        datasets: [
            {
                label: "PnL",
                data: durationStats.pnlData,
                backgroundColor: durationStats.pnlData.map((d) =>
                    d >= 0 ? themeColors.success : themeColors.danger,
                ),
                yAxisID: "y",
            },
            {
                label: "Win Rate %",
                data: durationStats.winRateData,
                type: "line",
                borderColor: themeColors.accent,
                backgroundColor: hexToRgba(themeColors.accent, 0.1),
                yAxisID: "y1",
            },
        ],
    };

    // Split View for Timing (Green/Red) - SIDE BY SIDE (no stack property)
    $: hourlyPnlData = {
        labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
        datasets: [
            {
                label: "Gross Profit",
                data: timingData.hourlyGrossProfit,
                backgroundColor: themeColors.success,
            },
            {
                label: "Gross Loss",
                data: timingData.hourlyGrossLoss,
                backgroundColor: themeColors.danger,
            },
        ],
    };

    $: dayOfWeekPnlData = {
        labels: timingData.dayLabels,
        datasets: [
            {
                label: "Gross Profit",
                data: timingData.dayOfWeekGrossProfit,
                backgroundColor: themeColors.success,
            },
            {
                label: "Gross Loss",
                data: timingData.dayOfWeekGrossLoss,
                backgroundColor: themeColors.danger,
            },
        ],
    };

    // Duration
    $: durationDataRaw = calculator.getDurationData(journal);
    $: durationScatterData = {
        datasets: [
            {
                label: "Trades",
                data: durationDataRaw.scatterData,
                backgroundColor: durationDataRaw.scatterData.map((d) =>
                    d.y >= 0 ? themeColors.success : themeColors.danger,
                ),
            },
        ],
    };

    $: tagEvolutionData = calculator.getTagEvolution(journal);
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

    // Assets
    $: assetData = calculator.getAssetData(journal);
    $: assetBubbleData = {
        datasets: [
            {
                label: "Assets",
                data: assetData.bubbleData,
                backgroundColor: assetData.bubbleData.map((d) =>
                    d.y >= 0
                        ? hexToRgba(themeColors.success, 0.6)
                        : hexToRgba(themeColors.danger, 0.6),
                ),
            },
        ],
    };

    // Risk
    $: riskScatterData = calculator.getRiskData(journal);
    $: riskRewardScatter = {
        datasets: [
            {
                label: "Trades",
                data: riskScatterData.scatterData,
                backgroundColor: riskScatterData.scatterData.map((d) =>
                    d.y >= 0 ? themeColors.success : themeColors.danger,
                ),
            },
        ],
    };

    // Market
    $: marketData = calculator.getMarketData(journal);
    $: longShortWinData = {
        labels: ["Long Win Rate", "Short Win Rate"],
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
                label: "Count",
                data: marketData.leverageDist,
                backgroundColor: themeColors.accent,
            },
        ],
    };

    // Psychology
    $: psychData = calculator.getPsychologyData(journal);
    $: winStreakData = {
        labels: psychData.streakLabels,
        datasets: [
            {
                label: "Frequency",
                data: psychData.winStreakData,
                backgroundColor: themeColors.success,
            },
        ],
    };
    $: lossStreakData = {
        labels: psychData.streakLabels,
        datasets: [
            {
                label: "Frequency",
                data: psychData.lossStreakData,
                backgroundColor: themeColors.danger,
            },
        ],
    };

    // --- New Extrapolated Data ---
    // Forecast (Monte Carlo)
    $: monteCarloData = calculator.getMonteCarloData(journal);
    $: monteCarloChartData = monteCarloData
        ? {
              labels: monteCarloData.labels,
              datasets: [
                  {
                      label: "90th Percentile (Best)",
                      data: monteCarloData.upperPath,
                      borderColor: themeColors.success,
                      backgroundColor: "transparent",
                      borderDash: [5, 5],
                      borderWidth: 1,
                      pointRadius: 0,
                  },
                  {
                      label: "Median",
                      data: monteCarloData.medianPath,
                      borderColor: themeColors.accent,
                      backgroundColor: "transparent",
                      borderWidth: 2,
                      pointRadius: 0,
                  },
                  {
                      label: "10th Percentile (Worst)",
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
                      label: "Rolling Win Rate (20)",
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
                      label: "Rolling Profit Factor (20)",
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
                      label: "Rolling SQN (20)",
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
                label: "PnL Breakdown",
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
                : t.label,
        ),
        datasets: [
            {
                label: "PnL",
                data: leakageData.worstTags.map((t) => t.pnl),
                backgroundColor: themeColors.danger,
            },
        ],
    };
    $: leakageTimingData = {
        labels: leakageData.worstHours.map((h) => `${h.hour}h`),
        datasets: [
            {
                label: "Gross Loss",
                data: leakageData.worstHours.map((h) => h.loss), // Absolute positive values for display
                backgroundColor: themeColors.danger,
            },
        ],
    };

    // --- Table State ---
    let currentPage = 1;
    let itemsPerPage = 10;
    // Allow 'duration' as a virtual sort field
    let sortField:
        | keyof import("../../stores/types").JournalEntry
        | "duration" = "date";
    let sortDirection: "asc" | "desc" = "desc";
    let filterDateStart = "";
    let filterDateEnd = "";
    let groupBySymbol = false;
    let showTableSettings = false;
    let expandedGroups: { [key: string]: boolean } = {};

    // Column Visibility State
    // Default: 'Advanced' columns are visible as requested ("permanently active" / configurable via menu)
    let columnVisibility = {
        date: true,
        symbol: true,
        type: true,
        entry: true,
        exit: true,
        sl: true,
        size: true,
        pnl: true,
        funding: true,
        rr: true,
        mae: true,
        mfe: true,
        efficiency: true,
        duration: true,
        status: true,
        screenshot: true,
        tags: true,
        notes: true,
        action: true,
    };

    // --- Table Logic ---
    function formatDuration(
        start: string | undefined,
        end: string | undefined,
    ): string {
        if (!start || !end) return "-";
        const s = new Date(start).getTime();
        const e = new Date(end).getTime();
        if (isNaN(s) || isNaN(e)) return "-";

        const diffMs = Math.max(0, e - s);
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(
            (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
        );
        const diffMinutes = Math.floor(
            (diffMs % (1000 * 60 * 60)) / (1000 * 60),
        );

        const parts = [];
        if (diffDays > 0) parts.push(`${diffDays}d`);
        if (diffHours > 0) parts.push(`${diffHours}h`);
        if (diffMinutes > 0 || parts.length === 0)
            parts.push(`${diffMinutes}m`);

        return parts.join(" ");
    }

    function sortTrades(
        trades: any[],
        field: string,
        direction: "asc" | "desc",
    ) {
        return [...trades].sort((a, b) => {
            let valA = a[field];
            let valB = b[field];

            // Handle virtual field 'duration'
            if (field === "duration") {
                const startA = new Date(a.entryDate || a.date).getTime();
                const endA = new Date(a.date).getTime();
                valA =
                    isNaN(startA) || isNaN(endA)
                        ? 0
                        : Math.max(0, endA - startA);

                const startB = new Date(b.entryDate || b.date).getTime();
                const endB = new Date(b.date).getTime();
                valB =
                    isNaN(startB) || isNaN(endB)
                        ? 0
                        : Math.max(0, endB - startB);
            }

            // Handle Decimals
            if (valA instanceof Decimal) valA = valA.toNumber();
            if (valB instanceof Decimal) valB = valB.toNumber();

            // Handle null/undefined for comparison
            if (valA === undefined || valA === null)
                valA =
                    field === "symbol" || field === "status" ? "" : -Infinity;
            if (valB === undefined || valB === null)
                valB =
                    field === "symbol" || field === "status" ? "" : -Infinity;

            // Handle Dates (if not handled by numeric conversion)
            if (field === "date" && typeof valA === "string") {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            }

            // String comparison
            if (typeof valA === "string" && typeof valB === "string") {
                return direction === "asc"
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            }

            // Number comparison
            if (valA < valB) return direction === "asc" ? -1 : 1;
            if (valA > valB) return direction === "asc" ? 1 : -1;
            return 0;
        });
    }

    // Extract tradeStore values to local reactive variables to prevent unrelated updates (e.g. price) from triggering re-renders/pagination resets
    $: journalSearchQuery = $tradeStore.journalSearchQuery;
    $: journalFilterStatus = $tradeStore.journalFilterStatus;

    $: processedTrades = $journalStore.filter((trade) => {
        // Text Search (Symbol, Notes, Tags)
        const query = journalSearchQuery.toLowerCase();
        const matchesSearch =
            trade.symbol.toLowerCase().includes(query) ||
            (trade.notes && trade.notes.toLowerCase().includes(query)) ||
            (trade.tags &&
                trade.tags.some((t) => t.toLowerCase().includes(query)));

        // Status Filter
        const matchesStatus =
            journalFilterStatus === "all" ||
            trade.status === journalFilterStatus;
        // Date Filter
        let matchesDate = true;
        const tradeDate = new Date(trade.date);
        if (filterDateStart)
            matchesDate = matchesDate && tradeDate >= new Date(filterDateStart);
        if (filterDateEnd) {
            const endDate = new Date(filterDateEnd);
            endDate.setHours(23, 59, 59, 999);
            matchesDate = matchesDate && tradeDate <= endDate;
        }

        return matchesSearch && matchesStatus && matchesDate;
    });

    $: sortedTrades = sortTrades(processedTrades, sortField, sortDirection);

    // Get all unique tags for autocomplete
    $: allUniqueTags = Array.from(
        new Set($journalStore.flatMap((t) => t.tags || [])),
    ).sort();

    // Grouping Logic
    $: groupedTrades = groupBySymbol
        ? Object.entries(
              calculator.calculateSymbolPerformance(processedTrades),
          ).map(([symbol, data]) => ({
              symbol,
              ...data,
          }))
        : [];

    $: paginatedTrades = groupBySymbol
        ? groupedTrades
        : sortedTrades.slice(
              (currentPage - 1) * itemsPerPage,
              currentPage * itemsPerPage,
          );

    $: totalPages = Math.ceil(
        (groupBySymbol ? groupedTrades.length : sortedTrades.length) /
            itemsPerPage,
    );

    function handleSort(field: any) {
        if (sortField === field) {
            sortDirection = sortDirection === "asc" ? "desc" : "asc";
        } else {
            sortField = field;
            sortDirection = "desc"; // Default to desc for new field (usually better for numbers/dates)
        }
    }

    function toggleGroupExpand(symbol: string) {
        expandedGroups[symbol] = !expandedGroups[symbol];
    }

    function handleImportCsv(event: Event) {
        if (browser) {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) {
                app.importFromCSV(file);
            }
        }
    }

    function handleStatusChange(tradeId: number, event: Event) {
        const target = event.target as HTMLSelectElement;
        app.updateTradeStatus(tradeId, target.value);
    }

    function toggleNoteExpand(event: MouseEvent) {
        (event.target as HTMLElement).classList.toggle("expanded");
    }

    function confirmDeleteTrade(tradeId: number) {
        if (confirm($_("journal.confirmDelete"))) {
            app.deleteTrade(tradeId);
        }
    }

    // --- Image Upload Logic ---
    let dragOverTradeId: number | null = null;

    function handleDragOver(tradeId: number, event: DragEvent) {
        event.preventDefault();
        dragOverTradeId = tradeId;
    }

    function handleDragLeave(tradeId: number, event: DragEvent) {
        event.preventDefault();
        if (dragOverTradeId === tradeId) {
            dragOverTradeId = null;
        }
    }

    async function handleDrop(tradeId: number, event: DragEvent) {
        event.preventDefault();
        dragOverTradeId = null;

        const file = event.dataTransfer?.files?.[0];
        if (file && file.type.startsWith("image/")) {
            await uploadScreenshot(tradeId, file);
        }
    }

    async function handleCellPaste(event: ClipboardEvent, tradeId: number) {
        const items = event.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith("image/")) {
                const file = items[i].getAsFile();
                if (file) {
                    await uploadScreenshot(tradeId, file);
                    return; // Stop after first image
                }
            }
        }
    }

    async function handleScreenshotUpload(tradeId: number, event: Event) {
        if (!browser) return;

        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];

        if (file) {
            await uploadScreenshot(tradeId, file);
        }

        // Reset input so same file can be selected again if needed
        input.value = "";
    }

    async function uploadScreenshot(tradeId: number, file: File) {
        uiStore.showLoading("Uploading screenshot...");

        try {
            const url = await imgbbService.uploadToImgbb(file);

            // Update Journal Entry
            journalStore.update((trades) => {
                return trades.map((t) => {
                    if (t.id === tradeId) {
                        return { ...t, screenshot: url };
                    }
                    return t;
                });
            });

            uiStore.showFeedback("save"); // Re-use save success
        } catch (error: any) {
            console.error(error);
            uiStore.showError(error.message || "Screenshot upload failed");
        } finally {
            uiStore.hideLoading();
        }
    }

    function deleteScreenshot(tradeId: number) {
        if (confirm($_("journal.labels.deleteScreenshot") + "?")) {
            journalStore.update((trades) => {
                return trades.map((t) => {
                    if (t.id === tradeId) {
                        return { ...t, screenshot: undefined };
                    }
                    return t;
                });
            });
        }
    }

    function handleTagsUpdate(tradeId: number, newTags: string[]) {
        journalStore.update((trades) => {
            return trades.map((t) => {
                if (t.id === tradeId) {
                    return { ...t, tags: newTags };
                }
                return t;
            });
        });
    }

    function handleNotesUpdate(tradeId: number, newNotes: string) {
        journalStore.update((trades) => {
            return trades.map((t) => {
                if (t.id === tradeId) {
                    return { ...t, notes: newNotes };
                }
                return t;
            });
        });
    }

    // Reset pagination on filter change
    function resetPagination(..._args: any[]) {
        currentPage = 1;
    }

    $: resetPagination(
        journalSearchQuery,
        journalFilterStatus,
        filterDateStart,
        filterDateEnd,
        groupBySymbol,
        sortField,
        sortDirection,
        itemsPerPage,
    );
</script>

<ModalFrame
    isOpen={$uiStore.showJournalModal}
    title={$_("journal.title")}
    on:close={() => uiStore.toggleJournalModal(false)}
    extraClasses="modal-size-journal"
>
    <!-- Dashboard Section -->
    {#if $settingsStore.isPro && $settingsStore.isDeepDiveUnlocked}
        <DashboardNav
            {activePreset}
            on:select={(e) => (activePreset = e.detail)}
        />

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
                            "journal.deepDive.charts.descriptions.equityCurve",
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
                            "journal.deepDive.charts.descriptions.drawdown",
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
                            "journal.deepDive.charts.descriptions.monthlyPnl",
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
                            "journal.deepDive.charts.descriptions.winLoss",
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
                        title={$_(
                            "journal.deepDive.charts.titles.rMultipleDist",
                        )}
                        description={$_(
                            "journal.deepDive.charts.descriptions.rMultipleDist",
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
                            "journal.deepDive.charts.descriptions.cumulativeR",
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
                            "journal.deepDive.charts.descriptions.topSymbols",
                        )}
                    />
                </div>
                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
                >
                    <BarChart
                        data={bottomSymbolData}
                        title={$_(
                            "journal.deepDive.charts.titles.bottomSymbols",
                        )}
                        horizontal={true}
                        description={$_(
                            "journal.deepDive.charts.descriptions.bottomSymbols",
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
                            "journal.deepDive.charts.descriptions.longVsShort",
                        )}
                    />
                </div>

                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2 h-[250px]"
                >
                    <LineChart
                        data={directionEvolutionData}
                        title="Long vs Short Evolution"
                        description={$_(
                            "journal.deepDive.charts.descriptions.directionEvolution",
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
                            >Trading Stats</span
                        >
                    </div>
                    <div class="flex flex-col gap-3 text-sm">
                        <div class="flex justify-between items-center">
                            <span
                                class="text-[var(--text-secondary)] text-[10px] uppercase"
                                >Win Rate</span
                            >
                            <span
                                class="font-mono font-bold {qualData.stats.winRate.greaterThanOrEqualTo(
                                    50,
                                )
                                    ? 'text-[var(--success-color)]'
                                    : 'text-[var(--danger-color)]'}"
                            >
                                {qualData.stats.winRate.toFixed(2)}%
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span
                                class="text-[var(--text-secondary)] text-[10px] uppercase"
                                >Profit Factor</span
                            >
                            <span
                                class="font-mono font-bold {qualData
                                    .detailedStats.profitFactor >= 1.5
                                    ? 'text-[var(--success-color)]'
                                    : qualData.detailedStats.profitFactor >= 1
                                      ? 'text-[var(--warning-color)]'
                                      : 'text-[var(--danger-color)]'}"
                            >
                                {qualData.detailedStats.profitFactor.toFixed(2)}
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span
                                class="text-[var(--text-secondary)] text-[10px] uppercase"
                                >Expectancy</span
                            >
                            <span
                                class="font-mono font-bold {qualData
                                    .detailedStats.expectancy > 0
                                    ? 'text-[var(--success-color)]'
                                    : 'text-[var(--danger-color)]'}"
                            >
                                ${qualData.detailedStats.expectancy.toFixed(2)}
                            </span>
                        </div>
                        <div
                            class="flex justify-between items-center text-[11px]"
                        >
                            <span class="text-[var(--text-secondary)] uppercase"
                                >Avg W/L</span
                            >
                            <div class="flex gap-1">
                                <span class="text-[var(--success-color)]"
                                    >${qualData.detailedStats.avgWin.toFixed(
                                        2,
                                    )}</span
                                >
                                <span class="text-[var(--text-secondary)]"
                                    >/</span
                                >
                                <span class="text-[var(--danger-color)]"
                                    >${qualData.detailedStats.avgLoss.toFixed(
                                        2,
                                    )}</span
                                >
                            </div>
                        </div>
                        <div
                            class="flex justify-between items-center text-[10px]"
                        >
                            <span class="text-[var(--text-secondary)] uppercase"
                                >L/S Win Rate</span
                            >
                            <div class="flex gap-2">
                                <span
                                    style="color: {hexToRgba(
                                        themeColors.success,
                                        1,
                                    )}"
                                    >L: {qualData.detailedStats.winRateLong.toFixed(
                                        1,
                                    )}%</span
                                >
                                <span
                                    style="color: {hexToRgba(
                                        themeColors.success,
                                        0.6,
                                    )}"
                                    >S: {qualData.detailedStats.winRateShort.toFixed(
                                        1,
                                    )}%</span
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
                            "journal.deepDive.charts.descriptions.hourlyPnl",
                        )}
                    />
                </div>
                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
                >
                    <BarChart
                        data={riskData}
                        title={$_(
                            "journal.deepDive.charts.titles.riskConsistency",
                        )}
                        description={$_(
                            "journal.deepDive.charts.descriptions.riskConsistency",
                        )}
                    />
                </div>
                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex flex-col justify-center gap-4"
                >
                    <div class="text-center">
                        <div
                            class="text-xs uppercase text-[var(--text-secondary)]"
                        >
                            Longest Win Streak
                        </div>
                        <div
                            class="text-3xl font-bold text-[var(--success-color)]"
                        >
                            {discData.streak.win}
                        </div>
                    </div>
                    <div class="text-center">
                        <div
                            class="text-xs uppercase text-[var(--text-secondary)]"
                        >
                            Longest Loss Streak
                        </div>
                        <div
                            class="text-3xl font-bold text-[var(--danger-color)]"
                        >
                            {discData.streak.loss}
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
                            "journal.deepDive.charts.descriptions.grossVsNet",
                        )}
                    />
                </div>
                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
                >
                    <LineChart
                        data={feeCurveData}
                        title={$_(
                            "journal.deepDive.charts.titles.cumulativeFees",
                        )}
                        yLabel="$"
                        description={$_(
                            "journal.deepDive.charts.descriptions.cumulativeFees",
                        )}
                    />
                </div>
                <div
                    class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
                >
                    <DoughnutChart
                        data={feeStructureData}
                        title={$_(
                            "journal.deepDive.charts.titles.feeBreakdown",
                        )}
                        description={$_(
                            "journal.deepDive.charts.descriptions.feeBreakdown",
                        )}
                    />
                </div>
            {/if}
        </div>
    {/if}

    <!-- Filter & Toolbar -->
    <div
        class="flex flex-wrap gap-4 my-4 items-end bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-color)]"
    >
        <div class="flex-1 min-w-[200px]">
            <label
                for="journal-search"
                class="text-xs text-[var(--text-secondary)] block mb-1"
                >{$_("journal.labels.search")}</label
            >
            <input
                id="journal-search"
                name="journalSearch"
                type="text"
                class="input-field w-full px-3 py-2 rounded-md"
                placeholder={$_("journal.searchSymbolPlaceholder")}
                bind:value={$tradeStore.journalSearchQuery}
            />
        </div>
        <div class="w-32">
            <label
                for="journal-status"
                class="text-xs text-[var(--text-secondary)] block mb-1"
                >{$_("journal.labels.status")}</label
            >
            <select
                id="journal-status"
                name="journalStatus"
                class="input-field w-full px-3 py-2 rounded-md"
                bind:value={$tradeStore.journalFilterStatus}
            >
                <option value="all">{$_("journal.filterAll")}</option>
                <option value="Open">{$_("journal.filterOpen")}</option>
                <option value="Won">{$_("journal.filterWon")}</option>
                <option value="Lost">{$_("journal.filterLost")}</option>
            </select>
        </div>
        <div class="w-36">
            <label
                for="journal-date-start"
                class="text-xs text-[var(--text-secondary)] block mb-1"
                >{$_("journal.labels.from")}</label
            >
            <input
                id="journal-date-start"
                name="journalDateStart"
                type="date"
                class="input-field w-full px-3 py-2 rounded-md"
                bind:value={filterDateStart}
            />
        </div>
        <div class="w-36">
            <label
                for="journal-date-end"
                class="text-xs text-[var(--text-secondary)] block mb-1"
                >{$_("journal.labels.to")}</label
            >
            <input
                id="journal-date-end"
                name="journalDateEnd"
                type="date"
                class="input-field w-full px-3 py-2 rounded-md"
                bind:value={filterDateEnd}
            />
        </div>

        <div class="flex items-center gap-2 pb-2 relative">
            <label
                class="flex items-center gap-2 select-none {!$settingsStore.isPro
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'}"
            >
                <input
                    id="pivot-mode-toggle"
                    name="pivotMode"
                    type="checkbox"
                    bind:checked={groupBySymbol}
                    disabled={!$settingsStore.isPro}
                    class="form-checkbox h-5 w-5 text-[var(--accent-color)] rounded focus:ring-0 disabled:cursor-not-allowed"
                />
                <span class="text-sm font-bold"
                    >{$_("journal.labels.pivotMode")}</span
                >
            </label>
            <button
                class="p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] {showTableSettings
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : ''}"
                title={$_("settings.title")}
                on:click|stopPropagation={() =>
                    (showTableSettings = !showTableSettings)}
            >
                <!-- svelte-ignore svelte/no-at-html-tags -->
                {@html icons.settings}
            </button>

            {#if showTableSettings}
                <div
                    class="absolute top-full right-0 mt-2 w-[450px] max-h-[60vh] overflow-y-auto bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-xl z-50 p-3 flex flex-col gap-2"
                    use:clickOutside={{
                        enabled: showTableSettings,
                        callback: () => (showTableSettings = false),
                    }}
                >
                    <div
                        class="text-xs font-bold text-[var(--text-secondary)] px-2 py-1 uppercase tracking-wider mb-1"
                    >
                        {$_("journal.labels.tableSettings")}
                    </div>

                    <div class="grid grid-cols-2 gap-x-4">
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-date"
                                name="colVisDate"
                                type="checkbox"
                                bind:checked={columnVisibility.date}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.date")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-symbol"
                                name="colVisSymbol"
                                type="checkbox"
                                bind:checked={columnVisibility.symbol}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.symbol")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-type"
                                name="colVisType"
                                type="checkbox"
                                bind:checked={columnVisibility.type}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.type")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-entry"
                                name="colVisEntry"
                                type="checkbox"
                                bind:checked={columnVisibility.entry}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.entry")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-exit"
                                name="colVisExit"
                                type="checkbox"
                                bind:checked={columnVisibility.exit}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.exit")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-sl"
                                name="colVisSl"
                                type="checkbox"
                                bind:checked={columnVisibility.sl}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm">{$_("journal.table.sl")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-size"
                                name="colVisSize"
                                type="checkbox"
                                bind:checked={columnVisibility.size}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.size")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-pnl"
                                name="colVisPnl"
                                type="checkbox"
                                bind:checked={columnVisibility.pnl}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.pnl")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-funding"
                                name="colVisFunding"
                                type="checkbox"
                                bind:checked={columnVisibility.funding}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.funding")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-rr"
                                name="colVisRr"
                                type="checkbox"
                                bind:checked={columnVisibility.rr}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm">{$_("journal.table.rr")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-mae"
                                name="colVisMae"
                                type="checkbox"
                                bind:checked={columnVisibility.mae}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.mae")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-mfe"
                                name="colVisMfe"
                                type="checkbox"
                                bind:checked={columnVisibility.mfe}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.mfe")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-efficiency"
                                name="colVisEfficiency"
                                type="checkbox"
                                bind:checked={columnVisibility.efficiency}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.efficiency")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-duration"
                                name="colVisDuration"
                                type="checkbox"
                                bind:checked={columnVisibility.duration}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.duration")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-status"
                                name="colVisStatus"
                                type="checkbox"
                                bind:checked={columnVisibility.status}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.status")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-screenshot"
                                name="colVisScreenshot"
                                type="checkbox"
                                bind:checked={columnVisibility.screenshot}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.screenshot")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-tags"
                                name="colVisTags"
                                type="checkbox"
                                bind:checked={columnVisibility.tags}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.tags")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-notes"
                                name="colVisNotes"
                                type="checkbox"
                                bind:checked={columnVisibility.notes}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.notes")}</span
                            >
                        </label>
                        <label
                            class="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer select-none"
                        >
                            <input
                                id="col-vis-action"
                                name="colVisAction"
                                type="checkbox"
                                bind:checked={columnVisibility.action}
                                class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                            />
                            <span class="text-sm"
                                >{$_("journal.table.action")}</span
                            >
                        </label>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- Table Container -->
    <div class="border border-[var(--border-color)] rounded-lg overflow-hidden">
        {#if groupBySymbol}
            <!-- Symbol Pivot Table -->
            <div class="table-scroll-wrapper overflow-x-auto w-full">
                <table class="journal-table">
                    <thead>
                        <tr>
                            <th class="text-left p-3"
                                >{$_("journal.table.symbol")}</th
                            >
                            <th class="text-right p-3"
                                >{$_(
                                    "journal.deepDive.charts.labels.trades",
                                )}</th
                            >
                            <th class="text-right p-3"
                                >{$_(
                                    "journal.deepDive.charts.titles.winRate",
                                )}</th
                            >
                            <th class="text-right p-3"
                                >{$_("journal.totalPL")}</th
                            >
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedTrades as group}
                            <tr
                                class="hover:bg-[var(--bg-secondary)] cursor-pointer border-b border-[var(--border-color)] last:border-0"
                                on:click={() => toggleGroupExpand(group.symbol)}
                            >
                                <td class="p-3 font-bold">{group.symbol}</td>
                                <td class="text-right p-3"
                                    >{group.totalTrades} ({group.wonTrades} W)</td
                                >
                                <td class="text-right p-3"
                                    >{(group.totalTrades > 0
                                        ? (group.wonTrades /
                                              group.totalTrades) *
                                          100
                                        : 0
                                    ).toFixed(1)}%</td
                                >
                                <td
                                    class="text-right p-3 {group.totalProfitLoss.gt(
                                        0,
                                    )
                                        ? 'text-[var(--success-color)]'
                                        : 'text-[var(--danger-color)]'}"
                                >
                                    {group.totalProfitLoss.toFixed(2)}
                                </td>
                            </tr>
                        {/each}
                        {#if paginatedTrades.length === 0}
                            <tr
                                ><td
                                    colspan="4"
                                    class="text-center p-8 text-[var(--text-secondary)]"
                                    >{$_("journal.noData")}</td
                                ></tr
                            >
                        {/if}
                    </tbody>
                </table>
            </div>
        {:else}
            <!-- Standard Trade List -->
            <div class="table-scroll-wrapper overflow-x-auto w-full">
                <table class="journal-table">
                    <thead>
                        <tr>
                            {#if columnVisibility.date}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("date")}
                                    >{$_("journal.table.date")}
                                    {sortField === "date"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.symbol}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("symbol")}
                                    >{$_("journal.table.symbol")}
                                    {sortField === "symbol"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.type}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("tradeType")}
                                    >{$_("journal.table.type")}
                                    {sortField === "tradeType"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.entry}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("entryPrice")}
                                    >{$_("journal.table.entry")}
                                    {sortField === "entryPrice"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.exit}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("exitPrice")}
                                    >{$_("journal.table.exit")}
                                    {sortField === "exitPrice"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.sl}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("stopLossPrice")}
                                    >{$_("journal.table.sl")}
                                    {sortField === "stopLossPrice"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.size}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("positionSize")}
                                    >{$_("journal.table.size")}
                                    {sortField === "positionSize"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.pnl}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() =>
                                        handleSort("totalNetProfit")}
                                    >{$_("journal.table.pnl")}
                                    {sortField === "totalNetProfit"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.funding}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("fundingFee")}
                                    >{$_("journal.table.funding")}
                                    {sortField === "fundingFee"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.rr}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("totalRR")}
                                    >{$_("journal.table.rr")}
                                    {sortField === "totalRR"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.mae}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("mae")}
                                    >{$_("journal.table.mae")}
                                    {sortField === "mae"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.mfe}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("mfe")}
                                    >{$_("journal.table.mfe")}
                                    {sortField === "mfe"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.efficiency}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("efficiency")}
                                    >{$_("journal.table.efficiency")}
                                    {sortField === "efficiency"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.duration}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("duration")}
                                    >{$_("journal.table.duration")}
                                    {sortField === "duration"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.status}
                                <th
                                    class="cursor-pointer hover:text-[var(--text-primary)]"
                                    on:click={() => handleSort("status")}
                                    >{$_("journal.table.status")}
                                    {sortField === "status"
                                        ? sortDirection === "asc"
                                            ? "↑"
                                            : "↓"
                                        : ""}</th
                                >
                            {/if}
                            {#if columnVisibility.screenshot}
                                <th>{$_("journal.table.screenshot")}</th>
                            {/if}
                            {#if columnVisibility.tags}
                                <th>{$_("journal.table.tags")}</th>
                            {/if}
                            {#if columnVisibility.notes}
                                <th>{$_("journal.table.notes")}</th>
                            {/if}
                            {#if columnVisibility.action}
                                <th>{$_("journal.table.action")}</th>
                            {/if}
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedTrades as trade}
                            {@const tradeDate = new Date(trade.date)}
                            <tr>
                                {#if columnVisibility.date}
                                    <td
                                        >{tradeDate.getFullYear() > 1970
                                            ? tradeDate.toLocaleString(
                                                  $locale || undefined,
                                                  {
                                                      day: "2-digit",
                                                      month: "2-digit",
                                                      year: "2-digit",
                                                      hour: "2-digit",
                                                      minute: "2-digit",
                                                  },
                                              )
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.symbol}
                                    <td>{trade.symbol || "-"}</td>
                                {/if}
                                {#if columnVisibility.type}
                                    <td
                                        class={trade.tradeType.toLowerCase() ===
                                        "long"
                                            ? "text-[var(--success-color)]"
                                            : "text-[var(--danger-color)]"}
                                        >{trade.tradeType
                                            .charAt(0)
                                            .toUpperCase() +
                                            trade.tradeType.slice(1)}</td
                                    >
                                {/if}
                                {#if columnVisibility.entry}
                                    <td>{trade.entryPrice.toFixed(4)}</td>
                                {/if}
                                {#if columnVisibility.exit}
                                    <td
                                        >{trade.exitPrice
                                            ? trade.exitPrice.toFixed(4)
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.sl}
                                    <td
                                        >{trade.stopLossPrice.gt(0)
                                            ? trade.stopLossPrice.toFixed(4)
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.size}
                                    <td
                                        >{trade.positionSize
                                            ? trade.positionSize.toFixed(4)
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.pnl}
                                    <td
                                        class={trade.totalNetProfit.gt(0)
                                            ? "text-[var(--success-color)]"
                                            : trade.totalNetProfit.lt(0)
                                              ? "text-[var(--danger-color)]"
                                              : ""}
                                        >{trade.totalNetProfit.toFixed(2)}</td
                                    >
                                {/if}
                                {#if columnVisibility.funding}
                                    <td
                                        class={trade.fundingFee.lt(0)
                                            ? "text-[var(--danger-color)]"
                                            : trade.fundingFee.gt(0)
                                              ? "text-[var(--success-color)]"
                                              : "text-[var(--text-secondary)]"}
                                        >{trade.fundingFee.toFixed(4)}</td
                                    >
                                {/if}
                                {#if columnVisibility.rr}
                                    <td
                                        class={trade.totalRR.gte(2)
                                            ? "text-[var(--success-color)]"
                                            : trade.totalRR.gte(1.5)
                                              ? "text-[var(--warning-color)]"
                                              : "text-[var(--danger-color)]"}
                                    >
                                        {!trade.totalRR.isZero()
                                            ? trade.totalRR.toFixed(2)
                                            : "-"}
                                    </td>
                                {/if}
                                {#if columnVisibility.mae}
                                    <td class="text-[var(--danger-color)]"
                                        >{trade.mae
                                            ? trade.mae.toFixed(4)
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.mfe}
                                    <td class="text-[var(--success-color)]"
                                        >{trade.mfe
                                            ? trade.mfe.toFixed(4)
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.efficiency}
                                    <td
                                        >{trade.efficiency
                                            ? trade.efficiency.toFixed(2) + "%"
                                            : "-"}</td
                                    >
                                {/if}
                                {#if columnVisibility.duration}
                                    <td
                                        >{formatDuration(
                                            trade.entryDate,
                                            trade.date,
                                        )}</td
                                    >
                                {/if}
                                {#if columnVisibility.status}
                                    <td>
                                        {#if trade.isManual === false}
                                            <span
                                                class="px-2 py-1 rounded text-xs font-bold
                                                {trade.status === 'Won'
                                                    ? 'bg-[rgba(var(--success-rgb),0.2)] text-[var(--success-color)]'
                                                    : trade.status === 'Lost'
                                                      ? 'bg-[rgba(var(--danger-rgb),0.2)] text-[var(--danger-color)]'
                                                      : 'bg-[rgba(var(--accent-rgb),0.2)] text-[var(--accent-color)]'}"
                                            >
                                                {trade.status}
                                            </span>
                                        {:else}
                                            <select
                                                id="status-select-{trade.id}"
                                                name="statusSelect"
                                                class="status-select input-field p-1"
                                                data-id={trade.id}
                                                on:change={(e) =>
                                                    handleStatusChange(
                                                        trade.id,
                                                        e,
                                                    )}
                                            >
                                                <option
                                                    value="Open"
                                                    selected={trade.status ===
                                                        "Open"}
                                                    >{$_(
                                                        "journal.filterOpen",
                                                    )}</option
                                                >
                                                <option
                                                    value="Won"
                                                    selected={trade.status ===
                                                        "Won"}
                                                    >{$_(
                                                        "journal.filterWon",
                                                    )}</option
                                                >
                                                <option
                                                    value="Lost"
                                                    selected={trade.status ===
                                                        "Lost"}
                                                    >{$_(
                                                        "journal.filterLost",
                                                    )}</option
                                                >
                                            </select>
                                        {/if}
                                    </td>
                                {/if}

                                {#if columnVisibility.screenshot}
                                    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
                                    <td
                                        class="text-center screenshot-cell relative {dragOverTradeId ===
                                        trade.id
                                            ? 'drag-over'
                                            : ''}"
                                        tabindex="0"
                                        on:dragover={(e) =>
                                            handleDragOver(trade.id, e)}
                                        on:dragleave={(e) =>
                                            handleDragLeave(trade.id, e)}
                                        on:drop={(e) => handleDrop(trade.id, e)}
                                        on:paste={(e) =>
                                            handleCellPaste(e, trade.id)}
                                        title={$_(
                                            "journal.labels.pasteScreenshot",
                                        )}
                                    >
                                        {#if trade.screenshot}
                                            <div
                                                class="preview-container group inline-block relative"
                                            >
                                                <button
                                                    class="icon-btn"
                                                    on:click={() =>
                                                        window.open(
                                                            trade.screenshot,
                                                            "_blank",
                                                        )}
                                                >
                                                    <!-- svelte-ignore svelte/no-at-html-tags -->
                                                    {@html icons.camera || "📷"}
                                                </button>

                                                <!-- Preview -->
                                                <div class="thumbnail-popup">
                                                    <img
                                                        src={trade.screenshot}
                                                        alt="Trade Screenshot"
                                                    />
                                                </div>

                                                <!-- Overlay Actions (Hover) -->
                                                <div
                                                    class="absolute top-0 left-0 w-full h-full bg-[var(--bg-secondary)] hidden group-hover:flex items-center justify-center gap-1 rounded shadow-sm border border-[var(--border-color)]"
                                                >
                                                    <button
                                                        class="p-1 hover:text-[var(--accent-color)]"
                                                        title="View"
                                                        on:click|stopPropagation={() =>
                                                            window.open(
                                                                trade.screenshot,
                                                                "_blank",
                                                            )}
                                                    >
                                                        <!-- svelte-ignore svelte/no-at-html-tags -->
                                                        {@html icons.eye ||
                                                            "👁️"}
                                                    </button>
                                                    <label
                                                        class="p-1 hover:text-[var(--warning-color)] cursor-pointer"
                                                        title={$_(
                                                            "journal.labels.replaceScreenshot",
                                                        )}
                                                    >
                                                        <input
                                                            id="screenshot-upload-replace-{trade.id}"
                                                            name="screenshotUploadReplace"
                                                            type="file"
                                                            accept="image/*"
                                                            class="hidden"
                                                            on:change={(e) =>
                                                                handleScreenshotUpload(
                                                                    trade.id,
                                                                    e,
                                                                )}
                                                            on:click|stopPropagation
                                                        />
                                                        <!-- svelte-ignore svelte/no-at-html-tags -->
                                                        {@html icons.refresh ||
                                                            "🔄"}
                                                    </label>
                                                    <button
                                                        class="p-1 hover:text-[var(--danger-color)]"
                                                        title={$_(
                                                            "journal.labels.deleteScreenshot",
                                                        )}
                                                        on:click|stopPropagation={() =>
                                                            deleteScreenshot(
                                                                trade.id,
                                                            )}
                                                    >
                                                        <!-- svelte-ignore svelte/no-at-html-tags -->
                                                        {@html icons.delete ||
                                                            "🗑️"}
                                                    </button>
                                                </div>
                                            </div>
                                        {:else}
                                            <label
                                                class="cursor-pointer block w-full h-full flex flex-col items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                                                title={$_(
                                                    "journal.labels.uploadScreenshot",
                                                )}
                                            >
                                                <!-- svelte-ignore svelte/no-at-html-tags -->
                                                <span
                                                    class="text-[var(--accent-color)]"
                                                    >{@html icons.plus ||
                                                        "+"}</span
                                                >
                                                <input
                                                    id="screenshot-upload-{trade.id}"
                                                    name="screenshotUpload"
                                                    type="file"
                                                    accept="image/*"
                                                    class="hidden"
                                                    on:change={(e) =>
                                                        handleScreenshotUpload(
                                                            trade.id,
                                                            e,
                                                        )}
                                                />
                                            </label>
                                        {/if}
                                    </td>
                                {/if}

                                {#if columnVisibility.tags}
                                    <td>
                                        <JournalEntryTags
                                            tags={trade.tags}
                                            availableTags={allUniqueTags}
                                            tradeId={trade.id}
                                            onTagsChange={(newTags) =>
                                                handleTagsUpdate(
                                                    trade.id,
                                                    newTags,
                                                )}
                                        />
                                    </td>
                                {/if}

                                {#if columnVisibility.notes}
                                    <td class="notes-cell">
                                        <input
                                            id="notes-input-{trade.id}"
                                            name="notesInput"
                                            type="text"
                                            class="notes-input"
                                            placeholder={$_(
                                                "journal.placeholder.notes",
                                            )}
                                            value={trade.notes || ""}
                                            on:change={(e) =>
                                                handleNotesUpdate(
                                                    trade.id,
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </td>
                                {/if}
                                {#if columnVisibility.action}
                                    <td class="text-center"
                                        ><button
                                            class="delete-trade-btn text-[var(--danger-color)] hover:opacity-80 p-1 rounded-full"
                                            data-id={trade.id}
                                            title={$_("journal.delete")}
                                            on:click={() =>
                                                confirmDeleteTrade(trade.id)}
                                        >
                                            <!-- svelte-ignore svelte/no-at-html-tags -->
                                            {@html icons.delete}</button
                                        ></td
                                    >
                                {/if}
                            </tr>
                        {/each}
                        {#if paginatedTrades.length === 0}
                            <tr
                                ><td
                                    colspan={Object.values(
                                        columnVisibility,
                                    ).filter(Boolean).length + 1}
                                    class="text-center text-slate-500 py-8"
                                    >{$_("journal.noTradesYet")}</td
                                ></tr
                            >
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>

    <!-- Pagination Controls -->
    {#if !groupBySymbol && processedTrades.length > 0}
        <div
            class="flex justify-between items-center mt-4 text-sm text-[var(--text-secondary)]"
        >
            <div class="flex items-center gap-2">
                <span>{$_("journal.pagination.rows")}</span>
                <select
                    id="items-per-page"
                    name="itemsPerPage"
                    bind:value={itemsPerPage}
                    class="input-field p-1 rounded"
                >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                </select>
            </div>
            <div class="flex items-center gap-2">
                <button
                    disabled={currentPage === 1}
                    on:click={() => currentPage--}
                    class="p-1 px-3 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] disabled:opacity-50 hover:bg-[var(--bg-primary)]"
                >
                    &lt; {$_("journal.pagination.prev")}
                </button>
                <span
                    >{$_("journal.pagination.page")}
                    {currentPage}
                    {$_("journal.pagination.of")}
                    {Math.ceil(processedTrades.length / itemsPerPage)}</span
                >
                <button
                    disabled={currentPage >=
                        Math.ceil(processedTrades.length / itemsPerPage)}
                    on:click={() => currentPage++}
                    class="p-1 px-3 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] disabled:opacity-50 hover:bg-[var(--bg-primary)]"
                >
                    {$_("journal.pagination.next")} &gt;
                </button>
            </div>
        </div>
    {/if}

    <!-- Deep Dive Section -->
    {#if $settingsStore.isPro && $settingsStore.isDeepDiveUnlocked}
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
                                title={$_(
                                    "journal.deepDive.charts.labels.forecast",
                                )}
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
                                {$_("journal.noData")} (Min 5 Trades)
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
                                        "journal.deepDive.charts.labels.rollingWinRate",
                                    )}
                                    yLabel="%"
                                    description={$_(
                                        "journal.deepDive.charts.descriptions.rollingWinRate",
                                    )}
                                />
                            </div>
                        {/if}
                        {#if rollingPFData}
                            <div class="h-64 mb-4">
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
                        {/if}
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
                        {/if}
                        {#if !rollingWinRateData}
                            <div
                                class="flex items-center justify-center h-full text-[var(--text-secondary)]"
                            >
                                {$_("journal.noData")} (Min 20 Trades)
                            </div>
                        {/if}
                    </div>
                {:else if activeDeepDivePreset === "leakage"}
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
                    >
                        <BarChart
                            data={leakageWaterfallChartData}
                            title={$_(
                                "journal.deepDive.charts.labels.profitRetention",
                            )}
                            description={$_(
                                "journal.deepDive.charts.descriptions.leakageWaterfall",
                            ) || "PnL Waterfall"}
                        />
                    </div>
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
                    >
                        {#if leakageData.worstTags.length > 0}
                            <BarChart
                                data={leakageTagData}
                                title="Strategy Leakage"
                                horizontal={true}
                                description={$_(
                                    "journal.deepDive.charts.descriptions.leakageTags",
                                )}
                            />
                        {:else}
                            <div
                                class="flex items-center justify-center h-full text-[var(--text-secondary)]"
                            >
                                {$_("journal.noData")} (No Strategy Losses)
                            </div>
                        {/if}
                    </div>
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
                    >
                        {#if leakageData.worstHours.length > 0}
                            <BarChart
                                data={leakageTimingData}
                                title="Time Leakage (Worst Hours)"
                                description={$_(
                                    "journal.deepDive.charts.descriptions.leakageTiming",
                                )}
                            />
                        {:else}
                            <div
                                class="flex items-center justify-center h-full text-[var(--text-secondary)]"
                            >
                                {$_("journal.noData")} (No Timing Losses)
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
                            description="Brutto-Gewinne (Grün) und Brutto-Verluste (Rot) pro Tageszeit. Hilft zu erkennen, wann du profitabel bist und wann du Geld verlierst."
                        />
                    </div>
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
                    >
                        <BarChart
                            data={dayOfWeekPnlData}
                            title={$_("journal.deepDive.charts.dayOfWeekPnl")}
                            description="Brutto-Gewinne und -Verluste pro Wochentag."
                        />
                    </div>
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] h-[250px]"
                    >
                        <BubbleChart
                            data={durationScatterData}
                            title="Duration vs PnL"
                            xLabel="Dauer (Min)"
                            yLabel="PnL ($)"
                            description="Verhältnis von Haltedauer zum Gewinn/Verlust. Erkennst du Muster bei kurzen vs. langen Trades?"
                        />
                    </div>
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-1 h-[250px]"
                    >
                        <BarChart
                            data={durationChartData}
                            title={$_(
                                "journal.deepDive.charts.labels.durationAnalysis",
                            )}
                            description={$_(
                                "journal.deepDive.charts.descriptions.durationPnl",
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
                            <div class="h-6"></div>
                            {#each Array(24) as _, i}
                                <div
                                    class="text-center text-[var(--text-secondary)]"
                                >
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
                                            ? `rgba(var(--success-rgb), ${Math.min(cell.pnl / 100, 1)})`
                                            : cell.pnl < 0
                                              ? `rgba(var(--danger-rgb), ${Math.min(Math.abs(cell.pnl) / 100, 1)})`
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
                                                    {row.day}
                                                    {cell.hour}:00
                                                </div>
                                                <div
                                                    class={cell.pnl >= 0
                                                        ? "text-[var(--success-color)]"
                                                        : "text-[var(--danger-color)]"}
                                                >
                                                    PnL: {cell.pnl.toFixed(2)}
                                                </div>
                                                <div>Trades: {cell.count}</div>
                                            </div>
                                        {/if}
                                    </div>
                                {/each}
                            {/each}
                        </div>
                        <div class="text-xs text-[var(--text-secondary)] mt-1">
                            {$_(
                                "journal.deepDive.charts.descriptions.confluenceMatrix",
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
                            yLabel="Total PnL ($)"
                            description="Asset-Matrix: Oben rechts sind deine besten Coins (hohe Winrate, viel Gewinn). Größe der Blase = Anzahl Trades."
                        />
                    </div>
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex items-center justify-center"
                    >
                        <div class="text-center">
                            <div class="text-sm text-[var(--text-secondary)]">
                                Top Asset
                            </div>
                            {#if dirData.topSymbols.labels.length > 0}
                                <div
                                    class="text-2xl font-bold text-[var(--success-color)]"
                                >
                                    {dirData.topSymbols.labels[0]}
                                </div>
                                <div class="text-lg text-[var(--text-primary)]">
                                    ${dirData.topSymbols.data[0]?.toFixed(2)}
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
                            title={$_(
                                "journal.deepDive.charts.riskRewardScatter",
                            )}
                            xLabel="Risk Amount ($)"
                            yLabel="Realized PnL ($)"
                            description="Risk/Reward Scatter: Zeigt das Verhältnis von eingesetztem Risiko zum tatsächlichen Ergebnis. Ideal: Geringes Risiko, hoher Gewinn (oben links)."
                        />
                    </div>
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
                    >
                        <BarChart
                            data={rDistData}
                            title="R-Multiple Distribution"
                            description="Häufigkeitsverteilung deiner Ergebnisse in R-Multiples."
                        />
                    </div>
                {:else if activeDeepDivePreset === "market"}
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
                    >
                        <DoughnutChart
                            data={longShortWinData}
                            title={$_(
                                "journal.deepDive.charts.longShortWinRate",
                            )}
                            description="Vergleich der Gewinnrate zwischen Long- und Short-Trades."
                        />
                    </div>
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2"
                    >
                        <BarChart
                            data={leverageDistData}
                            title={$_("journal.deepDive.charts.leverageDist")}
                            description="Verteilung der verwendeten Hebel (Leverage)."
                        />
                    </div>
                {:else if activeDeepDivePreset === "psychology"}
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
                    >
                        <BarChart
                            data={winStreakData}
                            title={$_("journal.deepDive.charts.winStreak")}
                            description="Häufigkeit von Gewinnserien unterschiedlicher Länge."
                        />
                    </div>
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
                    >
                        <BarChart
                            data={lossStreakData}
                            title={$_("journal.deepDive.charts.lossStreak")}
                            description="Häufigkeit von Verlustserien unterschiedlicher Länge."
                        />
                    </div>
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]"
                    >
                        <LineChart
                            data={drawdownData}
                            title={$_("journal.deepDive.charts.recovery")}
                            yLabel="Drawdown ($)"
                            description="Verlauf deiner Drawdowns. Zeigt wie schnell du dich von Verlusten erholst."
                        />
                    </div>
                {:else if activeDeepDivePreset === "strategies"}
                    <div
                        class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-3"
                    >
                        <LineChart
                            data={tagEvolutionChartData}
                            title="Strategy Evolution"
                            description={$_(
                                "journal.deepDive.charts.descriptions.tagEvolution",
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
                            <div
                                class="text-[var(--text-secondary)] text-sm mb-2"
                            >
                                Most Profitable Strategy
                            </div>
                            {#if tagData.labels.length > 0 && tagData.pnlData.length > 0}
                                {@const maxVal = Math.max(...tagData.pnlData)}
                                {@const bestIdx =
                                    tagData.pnlData.indexOf(maxVal)}
                                {#if bestIdx !== -1 && tagData.labels[bestIdx]}
                                    <div
                                        class="text-2xl font-bold text-[var(--success-color)]"
                                    >
                                        #{tagData.labels[bestIdx]}
                                    </div>
                                    <div class="text-[var(--text-primary)]">
                                        ${tagData.pnlData[bestIdx].toFixed(2)}
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
    {/if}

    {#if showUnlockOverlay}
        <div
            class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
            <div
                class="bg-black/80 text-white px-8 py-4 rounded-lg shadow-2xl backdrop-blur-sm transform transition-all animate-fade-in-out text-center"
            >
                <div class="text-xl font-bold text-[var(--accent-color)] mb-1">
                    🦆 Deep Dive
                </div>
                <div class="text-lg">{unlockOverlayMessage}</div>
            </div>
        </div>
    {/if}

    <!-- Bottom Actions -->
    <div
        class="flex flex-wrap items-center gap-4 mt-8 pt-4 border-t border-[var(--border-color)]"
    >
        {#if $settingsStore.isPro}
            <button
                id="sync-bitunix-btn"
                class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover-bg)] text-[var(--btn-primary-text)]"
                title={$_("journal.syncBitunix")}
                on:click={app.syncBitunixHistory}
            >
                <!-- svelte-ignore svelte/no-at-html-tags -->
                {@html icons.refresh}<span class="hidden sm:inline"
                    >{$_("journal.syncBitunix")}</span
                ></button
            >
        {/if}
        <button
            id="export-csv-btn"
            class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-success-bg)] hover:bg-[var(--btn-success-hover-bg)] text-[var(--btn-success-text)]"
            title={$_("journal.exportCsvTitle")}
            on:click={app.exportToCSV}
        >
            <!-- svelte-ignore svelte/no-at-html-tags -->
            {@html icons.export}<span class="hidden sm:inline"
                >{$_("journal.export")}</span
            ></button
        >
        <input
            type="file"
            id="import-csv-input"
            name="importCsv"
            accept=".csv"
            class="hidden"
            on:change={handleImportCsv}
        />
        <button
            id="import-csv-btn"
            class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)]"
            title={$_("journal.importCsvTitle")}
            on:click={() =>
                document.getElementById("import-csv-input")?.click()}
        >
            <!-- svelte-ignore svelte/no-at-html-tags -->
            {@html icons.import}<span class="hidden sm:inline"
                >{$_("journal.import")}</span
            ></button
        >
        <button
            id="clear-journal-btn"
            class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-danger-bg)] hover:bg-[var(--btn-danger-hover-bg)] text-[var(--btn-danger-text)]"
            title={$_("journal.clearJournalTitle")}
            on:click={() => {
                if (browser) app.clearJournal();
            }}
        >
            <!-- svelte-ignore svelte/no-at-html-tags -->
            {@html icons.delete}<span class="hidden sm:inline"
                >{$_("journal.clearAll")}</span
            ></button
        >
        <button
            id="show-journal-readme-btn"
            class="font-bold p-2.5 rounded-lg bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)]"
            title={$_("journal.showJournalInstructionsTitle")}
            aria-label={$_("journal.showJournalInstructionsAriaLabel")}
            on:click={() => app.uiManager.showReadme("journal")}
        >
            <!-- svelte-ignore svelte/no-at-html-tags -->
            {@html icons.book}</button
        >
    </div>
</ModalFrame>

<style>
    /* Add style for the thumbnail hover effect */
    .screenshot-cell {
        position: relative;
    }

    .screenshot-cell.drag-over {
        background-color: rgba(var(--accent-rgb), 0.2) !important;
        border: 2px dashed var(--accent-color);
    }

    .thumbnail-popup {
        display: none;
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        z-index: 50;
        background: var(--bg-tertiary);
        padding: 4px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        width: 300px; /* Increased by ~50% from 200px */
        height: auto;
    }

    .screenshot-cell .preview-container:hover .thumbnail-popup {
        display: block;
    }

    .thumbnail-popup img {
        width: 100%;
        height: auto;
        border-radius: 2px;
    }

    /* Icon styling */
    .icon-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        color: var(--text-secondary);
        transition:
            color 0.2s,
            background-color 0.2s;
    }

    .icon-btn:hover {
        color: var(--accent-color);
        background-color: var(--bg-tertiary);
    }

    .notes-input {
        background: transparent;
        border: none;
        width: 100%;
        outline: none;
        padding: 0;
        margin: 0;
        color: var(--text-primary);
        font-size: 0.875rem;
        text-overflow: ellipsis;
    }
    .notes-input:focus {
        background: var(--bg-tertiary);
        border-radius: 2px;
        padding: 2px 4px;
    }

    .journal-table {
        width: max-content;
        min-width: 100%;
        border-collapse: separate;
        border-spacing: 0;
    }

    .journal-table th,
    .journal-table td {
        white-space: nowrap;
        padding: 0.75rem 1rem;
    }

    .table-scroll-wrapper {
        border-radius: 8px;
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
    }
</style>
