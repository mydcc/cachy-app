<script lang="ts">
    import { Bubble } from 'svelte-chartjs';
    import {
        Chart as ChartJS,
        Tooltip as ChartTooltip,
        Legend,
        PointElement,
        LinearScale,
    } from 'chart.js';
    import Tooltip from '../Tooltip.svelte';

    ChartJS.register(
        LinearScale,
        PointElement,
        ChartTooltip,
        Legend
    );

    export let data: any;
    export let title: string = "";
    export let xLabel: string = "";
    export let yLabel: string = "";
    export let description: string = "";

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            title: {
                display: !!title,
                text: title,
                color: '#94a3b8'
            },
            tooltip: {
                callbacks: {
                     label: function(context: any) {
                        return context.raw.l || '';
                     }
                }
            }
        },
        scales: {
            x: {
                title: {
                    display: !!xLabel,
                    text: xLabel,
                    color: '#64748b'
                },
                grid: {
                    color: 'rgba(148, 163, 184, 0.1)'
                },
                ticks: {
                    color: '#94a3b8'
                }
            },
            y: {
                 title: {
                    display: !!yLabel,
                    text: yLabel,
                    color: '#64748b'
                },
                grid: {
                    color: 'rgba(148, 163, 184, 0.1)'
                },
                ticks: {
                    color: '#94a3b8'
                }
            }
        }
    };
</script>

<div class="w-full h-full min-h-[200px] relative">
    {#if description}
        <div class="absolute bottom-[-10px] left-[-10px] z-10 p-2">
           <Tooltip text={description} />
        </div>
    {/if}
    <Bubble {data} {options} />
</div>
