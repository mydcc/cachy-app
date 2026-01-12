<script lang="ts">
    import { Bar } from 'svelte-chartjs';
    import { _ } from '../../locales/i18n';
    import type { IndividualTpResult } from '../../stores/types';
    import type { ChartOptions, ChartData } from 'chart.js';
    import { formatDynamicDecimal } from '../../utils/utils';

    export let entryPrice: number | null;
    export let stopLossPrice: number | null;
    export let targets: Array<{ price: number | null; percent: number | null; isLocked: boolean }>;
    export let calculatedTpDetails: IndividualTpResult[];

    // Use 'any' for chartData to bypass strict Chart.js typing issues in the template
    // which struggles with the floating bar [number, number] tuple type.
    let chartData: any;
    let chartOptions: ChartOptions<'bar'>;

    // Helper to resolve CSS variables
    const getCssVar = (name: string) => {
        if (typeof window !== 'undefined') {
            return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        }
        return '#000'; // Fallback
    };

    $: {
        if (entryPrice && stopLossPrice && targets.length > 0 && targets[targets.length - 1].price) {

            const lastTpPrice = targets[targets.length - 1].price as number;

            // Determine colors based on win/loss zones
            const dangerColor = getCssVar('--danger-color') || '#ef4444';
            const successColor = getCssVar('--success-color') || '#22c55e';
            const textColor = getCssVar('--text-primary') || '#e2e8f0';
            const textSecondary = getCssVar('--text-secondary') || '#94a3b8';
            const bgTertiary = getCssVar('--bg-tertiary') || '#1e293b';

            // Risk Segment: From SL to Entry
            // Reward Segment: From Entry to Last TP

            // Explicitly cast to [number, number] to satisfy Chart.js types
            const riskSegment: [number, number] = [stopLossPrice, entryPrice];
            const rewardSegment: [number, number] = [entryPrice, lastTpPrice];

            chartData = {
                labels: ['Analysis'], // Dummy label for the single y-axis row
                datasets: [
                    {
                        label: 'Risk',
                        data: [riskSegment],
                        backgroundColor: dangerColor,
                        borderSkipped: false,
                        borderRadius: { topLeft: 4, bottomLeft: 4 }, // Rounded corners on left
                        barPercentage: 0.6,
                        categoryPercentage: 1.0
                    },
                    {
                        label: 'Reward',
                        data: [rewardSegment],
                        backgroundColor: successColor,
                        borderSkipped: false,
                        borderRadius: { topRight: 4, bottomRight: 4 }, // Rounded corners on right
                        barPercentage: 0.6,
                        categoryPercentage: 1.0
                    }
                ]
            };

            // Annotations
            const annotations: any = {};

            // Entry Line (White) - Bottom Label
            annotations['entryLine'] = {
                type: 'line',
                xMin: entryPrice,
                xMax: entryPrice,
                borderColor: textColor,
                borderWidth: 2,
                label: {
                    display: true,
                    content: 'Einstieg',
                    position: 'start', // bottom for horizontal chart? In Chart.js 'start' on x scale is left/bottom depending.
                    // For x-scale line, position is along the line. 'start' is bottom, 'end' is top.
                    yAdjust: 20, // Push it down
                    backgroundColor: bgTertiary,
                    color: textColor,
                    font: { size: 10 },
                    padding: 4,
                    borderRadius: 4
                }
            };

            // SL Line (Red) - Top Label
            annotations['slLine'] = {
                type: 'line',
                xMin: stopLossPrice,
                xMax: stopLossPrice,
                borderColor: dangerColor,
                borderWidth: 2,
                label: {
                    display: true,
                    content: 'SL',
                    position: 'end', // Top
                    yAdjust: -20,
                    backgroundColor: dangerColor,
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
                        borderColor: 'rgba(255, 255, 255, 0.5)', // Semi-transparent white
                        borderWidth: 1,
                        borderDash: [4, 4],
                        label: {
                            display: true,
                            content: [`TP${index + 1}`, rrText],
                            position: 'end', // Top
                            yAdjust: -25, // Staggered slightly if needed?
                            backgroundColor: 'transparent',
                            color: textSecondary,
                            font: { size: 10 },
                            textAlign: 'center'
                        }
                    };
                }
            });

            chartOptions = {
                indexAxis: 'y', // Horizontal bar
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }, // Custom tooltips or none? The old one had tooltips.
                    // We can use the datalabels or just reliance on visual lines.
                    // Let's keep it simple first as requested.
                    annotation: {
                        annotations: annotations,
                        clip: false // Allow labels outside
                    },
                    datalabels: {
                        display: false // We use annotations for labels
                    },
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
                        display: false, // Hide the axis numbers
                        grid: { display: false },
                        min: Math.min(stopLossPrice, lastTpPrice) * 0.995, // Add some padding
                        max: Math.max(stopLossPrice, lastTpPrice) * 1.005
                    },
                    y: {
                        display: false, // Hide the category label
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
        {#if chartData}
            <Bar data={chartData} options={chartOptions} />
        {:else}
            <div class="text-center text-gray-500 py-4">
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
