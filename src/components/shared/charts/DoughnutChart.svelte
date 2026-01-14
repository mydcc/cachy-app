<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Chart } from "chart.js";
  import "../../../lib/chartSetup";
  import Tooltip from "../Tooltip.svelte";

  interface Props {
    data: any;
    title?: string;
    description?: string;
    options?: any;
  }

  let {
    data,
    title = "",
    description = "",
    options = {}
  }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "right" as const },
      title: { display: !!title, text: title },
    },
  };

  let mergedOptions = $derived({
    ...defaultOptions,
    ...options,
    plugins: {
      ...defaultOptions.plugins,
      ...(options.plugins || {}),
      legend: {
        ...defaultOptions.plugins.legend,
        ...(options.plugins?.legend || {}),
      },
      title: {
        display: !!title,
        text: title,
        ...(options.plugins?.title || {}),
      },
    },
  });

  onMount(() => {
    if (canvas) {
      chart = new Chart(canvas, {
        type: "doughnut",
        data,
        options: mergedOptions,
      });
    }
  });

  $effect(() => {
    if (chart) {
      chart.data = data;
      chart.options = mergedOptions;
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
