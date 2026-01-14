<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Chart } from "chart.js";
  import "../../../lib/chartSetup";
  import Tooltip from "../Tooltip.svelte";

  interface Props {
    data: any;
    title?: string;
    horizontal?: boolean;
    description?: string;
    options?: any;
  }

  let {
    data,
    title = "",
    horizontal = false,
    description = "",
    options = undefined
  }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  let defaultOptions = $derived({
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? ("y" as const) : ("x" as const),
    plugins: {
      legend: { display: false },
      title: { display: !!title, text: title },
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { display: true } },
    },
  });

  onMount(() => {
    if (canvas) {
      chart = new Chart(canvas, {
        type: "bar",
        data,
        options: options || defaultOptions,
      });
    }
  });

  $effect(() => {
    if (chart) {
      chart.data = data;
      chart.options = options || defaultOptions;
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
