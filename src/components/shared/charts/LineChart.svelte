<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Chart } from "chart.js";
  import "../../../lib/chartSetup";
  import Tooltip from "../Tooltip.svelte";
  import type { ChartOptions } from "chart.js";

  interface Props {
    data: any;
    title?: string;
    yLabel?: string;
    description?: string;
  }

  let {
    data,
    title = "",
    yLabel = "",
    description = ""
  }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  let options = $derived<ChartOptions<"line">>({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: !!title, text: title },
    },
    scales: {
      x: {
        grid: { display: false },
      },
      y: {
        title: { display: !!yLabel, text: yLabel },
      },
    },
    interaction: {
      mode: "index",
      intersect: false,
    },
  });

  onMount(() => {
    if (canvas) {
      chart = new Chart(canvas, {
        type: "line",
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
