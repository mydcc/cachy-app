<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Chart,
    Tooltip as ChartTooltip,
    Legend,
    PointElement,
    LineElement,
    LinearScale,
    ScatterController,
  } from "chart.js";
  import annotationPlugin from 'chartjs-plugin-annotation';
  import Tooltip from "../Tooltip.svelte";

  Chart.register(LinearScale, PointElement, LineElement, ScatterController, ChartTooltip, Legend, annotationPlugin);

  interface Props {
    data: any; // { scatterPoints: Array, efficiencyLines?: boolean }
    title?: string;
    xLabel?: string;
    yLabel?: string;
    description?: string;
    showEfficiencyLines?: boolean;
  }

  let {
    data,
    title = "",
    xLabel = "",
    yLabel = "",
    description = "",
    showEfficiencyLines = false
  }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  // Prepare datasets
  let chartData = $derived.by(() => {
    const points = data?.scatterPoints || [];

    // Scatter Dataset
    const scatterDataset = {
        label: 'Trades',
        data: points, // {x, y, r, pnl, l}
        backgroundColor: (ctx: any) => {
            const val = ctx.raw?.rawPnl ?? 0;
            return val >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'; // Green / Red
        },
        borderColor: (ctx: any) => {
            const val = ctx.raw?.rawPnl ?? 0;
            return val >= 0 ? 'rgba(34, 197, 94, 1)' : 'rgba(239, 68, 68, 1)';
        },
        pointRadius: 5,
        type: 'scatter'
    };

    const datasets: any[] = [scatterDataset];

    return {
        datasets
    };
  });

  let options = $derived({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: !!title,
        text: title,
        color: "#94a3b8",
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            return context.raw.l || "";
          },
        },
      },
      annotation: showEfficiencyLines ? {
        annotations: {
          line1: {
            type: 'line' as const,
            scaleID: 'x',
            value: 0,
            endValue: 100, // Dynamic?
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
            label: {
              content: '1:1',
              display: true,
              position: 'end' as const
            },
            // This draws a vertical/horizontal line usually.
            // Diagonal lines are harder with simple annotation config unless using points.
            // But we can use the 'line' type with xMin, yMin, xMax, yMax coordinates if supported.
            // Let's rely on dataset lines instead if we want diagonals, or configure annotation carefully.
            // Actually, adding "dummy" line datasets is often easier for diagonals.
          }
        }
      } : {}
    },
    scales: {
      x: {
        title: {
          display: !!xLabel,
          text: xLabel,
          color: "#64748b",
        },
        grid: {
          color: "rgba(148, 163, 184, 0.1)",
        },
        ticks: {
          color: "#94a3b8",
        },
        beginAtZero: true
      },
      y: {
        title: {
          display: !!yLabel,
          text: yLabel,
          color: "#64748b",
        },
        grid: {
          color: "rgba(148, 163, 184, 0.1)",
        },
        ticks: {
          color: "#94a3b8",
        },
        beginAtZero: true
      },
    },
  });

  // Helper to add diagonal lines to chartData if needed
  let finalChartData = $derived.by(() => {
     const d = chartData;
     if (showEfficiencyLines) {
        // Find max extent to draw lines
        const maxX = Math.max(...(d.datasets[0].data.map((p: any) => p.x) || [0]), 1);
        const maxY = Math.max(...(d.datasets[0].data.map((p: any) => p.y) || [0]), 1);
        const limit = Math.max(maxX, maxY) * 1.1;

        // Line 1:1 (y=x)
        d.datasets.push({
            type: 'line',
            label: '1:1',
            data: [{x:0, y:0}, {x: limit, y: limit}],
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            pointRadius: 0,
            borderDash: [5, 5]
        });

        // Line 2:1 (y=2x) - Reward is 2x Risk
        d.datasets.push({
            type: 'line',
            label: '2:1',
            data: [{x:0, y:0}, {x: limit/2, y: limit}],
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            pointRadius: 0,
            borderDash: [5, 5]
        });

        // Line 0.5:1 (y=0.5x)
         d.datasets.push({
            type: 'line',
            label: '0.5:1',
            data: [{x:0, y:0}, {x: limit, y: limit/2}],
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            pointRadius: 0,
            borderDash: [5, 5]
        });
     }
     return d;
  });

  onMount(() => {
    if (canvas) {
      chart = new Chart(canvas, {
        type: "scatter", // Base type
        data: finalChartData,
        options,
      });
    }
  });

  $effect(() => {
    if (chart) {
      chart.data = finalChartData;
      chart.options = options;
      chart.update();
    }
  });

  onDestroy(() => {
    if (chart) {
      chart.destroy();
    }
  });
</script>

<div class="w-full h-full min-h-[250px] relative">
  {#if description}
    <div class="absolute bottom-[-10px] left-[-10px] z-10 p-2">
      <Tooltip text={description} />
    </div>
  {/if}
  <canvas bind:this={canvas}></canvas>
</div>
