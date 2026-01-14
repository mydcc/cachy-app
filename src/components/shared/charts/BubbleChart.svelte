<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Chart,
    Tooltip as ChartTooltip,
    Legend,
    PointElement,
    LinearScale,
  } from "chart.js";
  import Tooltip from "../Tooltip.svelte";

  Chart.register(LinearScale, PointElement, ChartTooltip, Legend);

  interface Props {
    data: any;
    title?: string;
    xLabel?: string;
    yLabel?: string;
    description?: string;
  }

  let {
    data,
    title = "",
    xLabel = "",
    yLabel = "",
    description = ""
  }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

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
      },
    },
  });

  onMount(() => {
    if (canvas) {
      chart = new Chart(canvas, {
        type: "bubble",
        data,
        options,
      });
    }
  });

  $effect(() => {
    if (chart) {
      chart.data = data;
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

<div class="w-full h-full min-h-[200px] relative">
  {#if description}
    <div class="absolute bottom-[-10px] left-[-10px] z-10 p-2">
      <Tooltip text={description} />
    </div>
  {/if}
  <canvas bind:this={canvas}></canvas>
</div>
