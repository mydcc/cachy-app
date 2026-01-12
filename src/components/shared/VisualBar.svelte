<script lang="ts">
    import { onMount } from 'svelte';
    import { Bar } from 'svelte-chartjs';
    import { _ } from '../../locales/i18n';
    import type { IndividualTpResult } from '../../stores/types';
    import type { ChartOptions, ChartData } from 'chart.js';
    import { uiStore } from '../../stores/uiStore'; // To listen for theme changes
    import { formatDynamicDecimal } from '../../utils/utils';

    export let entryPrice: number | null;
    export let stopLossPrice: number | null;
    export let targets: Array<{ price: number | null; percent: number | null; isLocked: boolean }>;
    export let calculatedTpDetails: IndividualTpResult[];

    let chartInstance: any = null;
    let isValidData = false;
    let colors = {
        danger: '#ef4444',
        success: '#22c55e',
        text: '#e2e8f0',
        textSecondary: '#94a3b8',
        bgTertiary: '#1e293b'
    };

    // Default empty state to ensure <Bar> is always mounted
    let chartData: any = {
        labels: ['Analysis'],
        datasets: []
    };

    let chartOptions: ChartOptions<'bar'> = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Disable default animation globally for performance
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            annotation: { annotations: {} },
            datalabels: { display: false },
            zoom: {
                zoom: {
                    wheel: { enabled: true },
                    pinch: { enabled: true },
                    mode: 'x',
                },
                pan: {
                    enabled: true,
                    mode: 'x',
                }
            }
        },
        scales: {
            x: {
                display: false,
                grid: { display: false },
            },
            y: {
                display: false,
                grid: { display: false },
                stacked: true
            }
        },
        layout: {
            padding: {
                top: 30,
                bottom: 30,
                left: 10,
                right: 10
            }
        }
    };

    // Helper to resolve CSS variables once
    const updateColors = () => {
        if (typeof window !== 'undefined') {
            const style = getComputedStyle(document.documentElement);
            colors = {
                danger: style.getPropertyValue('--danger-color').trim() || '#ef4444',
                success: style.getPropertyValue('--success-color').trim() || '#22c55e',
                text: style.getPropertyValue('--text-primary').trim() || '#e2e8f0',
                textSecondary: style.getPropertyValue('--text-secondary').trim() || '#94a3b8',
                bgTertiary: style.getPropertyValue('--bg-tertiary').trim() || '#1e293b'
            };
            // Force update if chart exists to apply new colors
            if (chartInstance && isValidData) {
                updateChart();
            }
        }
    };

    onMount(() => {
        updateColors();
    });

    // Re-fetch colors when theme changes
    $: if ($uiStore.currentTheme) {
        // Use timeout to ensure DOM has updated with new theme classes/variables
        setTimeout(updateColors, 100);
    }

    // Main reactive loop
    $: {
        isValidData = !!(entryPrice && stopLossPrice && targets.length > 0 && targets[targets.length - 1].price);

        if (isValidData) {
            updateChart();
        }
    }

    function updateChart() {
        if (!entryPrice || !stopLossPrice || !targets || targets.length === 0) return;

        const lastTpPrice = targets[targets.length - 1].price as number;

        // Risk Segment: From SL to Entry
        const riskSegment: [number, number] = [stopLossPrice, entryPrice];
        // Reward Segment: From Entry to Last TP
        const rewardSegment: [number, number] = [entryPrice, lastTpPrice];

        const xMin = Math.min(stopLossPrice, lastTpPrice) * 0.995;
        const xMax = Math.max(stopLossPrice, lastTpPrice) * 1.005;

        // Build Annotations
        const annotations: any = {};

        // Entry Line (White)
        annotations['entryLine'] = {
            type: 'line',
            xMin: entryPrice,
            xMax: entryPrice,
            borderColor: colors.text,
            borderWidth: 2,
            label: {
                display: true,
                content: 'Einstieg',
                position: 'start',
                yAdjust: 20,
                backgroundColor: colors.bgTertiary,
                color: colors.text,
                font: { size: 10 },
                padding: 4,
                borderRadius: 4
            }
        };

        // SL Line (Red)
        annotations['slLine'] = {
            type: 'line',
            xMin: stopLossPrice,
            xMax: stopLossPrice,
            borderColor: colors.danger,
            borderWidth: 2,
            label: {
                display: true,
                content: 'SL',
                position: 'end',
                yAdjust: -20,
                backgroundColor: colors.danger,
                color: '#fff',
                font: { size: 10, weight: 'bold' },
                padding: 4,
                borderRadius: 4
            }
        };

        // TP Lines (Green)
        targets.forEach((target, index) => {
            if (target.price) {
                const detail = calculatedTpDetails.find(d => d.index === index);
                const rrText = detail ? `${detail.riskRewardRatio.toFixed(2)}R` : '';

                annotations[`tp${index}`] = {
                    type: 'line',
                    xMin: target.price,
                    xMax: target.price,
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    borderWidth: 1,
                    borderDash: [4, 4],
                    label: {
                        display: true,
                        content: [`TP${index + 1}`, rrText],
                        position: 'end',
                        yAdjust: -25,
                        backgroundColor: 'transparent',
                        color: colors.textSecondary,
                        font: { size: 10 },
                        textAlign: 'center'
                    }
                };
            }
        });

        // Update Chart Instance directly if available
        if (chartInstance) {
            // Update Datasets
            chartInstance.data.datasets = [
                {
                    label: 'Risk',
                    data: [riskSegment],
                    backgroundColor: colors.danger,
                    borderSkipped: false,
                    borderRadius: { topLeft: 4, bottomLeft: 4 },
                    barPercentage: 0.6,
                    categoryPercentage: 1.0
                },
                {
                    label: 'Reward',
                    data: [rewardSegment],
                    backgroundColor: colors.success,
                    borderSkipped: false,
                    borderRadius: { topRight: 4, bottomRight: 4 },
                    barPercentage: 0.6,
                    categoryPercentage: 1.0
                }
            ];

            // Update Options
            if (chartInstance.options?.plugins?.annotation) {
                chartInstance.options.plugins.annotation.annotations = annotations;
            }
            if (chartInstance.options?.scales?.x) {
                chartInstance.options.scales.x.min = xMin;
                chartInstance.options.scales.x.max = xMax;
            }

            // 'none' prevents animation and full re-render flickering
            chartInstance.update('none');
        } else {
            // Initial Load (fallback if chartInstance is not yet bound when data arrives)
             chartData = {
                labels: ['Analysis'],
                datasets: [
                    {
                        label: 'Risk',
                        data: [riskSegment],
                        backgroundColor: colors.danger,
                        borderSkipped: false,
                        borderRadius: { topLeft: 4, bottomLeft: 4 },
                        barPercentage: 0.6,
                        categoryPercentage: 1.0
                    },
                    {
                        label: 'Reward',
                        data: [rewardSegment],
                        backgroundColor: colors.success,
                        borderSkipped: false,
                        borderRadius: { topRight: 4, bottomRight: 4 },
                        barPercentage: 0.6,
                        categoryPercentage: 1.0
                    }
                ]
            };

            // Note: annotations in initial chartOptions are updated via direct mutation below because
            // spreading deep objects is messy. But since chartOptions is a 'let', we can just mutate it
            // before the chart mounts.
            if (chartOptions.plugins && chartOptions.plugins.annotation) {
                chartOptions.plugins.annotation.annotations = annotations;
            }
            if (chartOptions.scales && chartOptions.scales.x) {
                chartOptions.scales.x.min = xMin;
                chartOptions.scales.x.max = xMax;
            }
        }
    }
</script>

<section class="visual-bar-container md:col-span-2">
    <h2 class="section-header text-center !mb-4">{$_('dashboard.visualBar.header')}</h2>
    <div
        class="visual-bar-chart-wrapper"
        role="img"
        aria-label="{$_('dashboard.visualBar.ariaLabel')}"
    >
        <!-- Chart is always rendered but hidden if invalid data to prevent unmount/remount flickering -->
        <div class="h-full w-full" class:invisible={!isValidData}>
            <Bar bind:chart={chartInstance} data={chartData} options={chartOptions} />
        </div>

        {#if !isValidData}
            <div class="absolute inset-0 flex items-center justify-center text-center text-gray-500">
                {$_('dashboard.promptForData')}
            </div>
        {/if}
    </div>
</section>

<style>
    .visual-bar-container {
        background-color: var(--bg-primary);
        padding: 1rem;
        border-radius: 0.5rem;
        margin-top: 1.5rem;
        margin-bottom: 1.5rem;
        position: relative;
    }
    .visual-bar-chart-wrapper {
        position: relative;
        height: 120px; /* Sufficient height for labels */
        width: 100%;
        background-color: var(--bg-tertiary);
        border-radius: 0.5rem;
        padding: 0 1rem;
    }
</style>
