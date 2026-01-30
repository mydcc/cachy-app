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

<script lang="ts">
  import { untrack } from "svelte";
  import { Chart } from "chart.js";
  import "../../../lib/chartSetup";
  import Tooltip from "../Tooltip.svelte";
  import type { ChartOptions } from "chart.js";
  import { throttle } from "lodash-es";

  interface Props {
    data: any;
    title?: string;
    yLabel?: string;
    description?: string;
    onChartClick?: (detail: {
      index: number;
      datasetIndex: number;
      label: string;
      value: any;
    }) => void;
  }

  let {
    data,
    title = "",
    yLabel = "",
    description = "",
    onChartClick,
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

  let finalOptions = $derived.by(() => {
    const base = options;
    if (onChartClick) {
      return {
        ...base,
        onClick: (e: any, elements: any[], chart: any) => {
          if (base.onClick) base.onClick(e, elements, chart);
          if (elements && elements.length > 0) {
            const first = elements[0];
            const label = chart.data.labels
              ? chart.data.labels[first.index]
              : null;
            const value =
              chart.data.datasets[first.datasetIndex].data[first.index];
            onChartClick({
              index: first.index,
              datasetIndex: first.datasetIndex,
              label,
              value,
            });
          }
        },
      };
    }
    return base;
  });

  $effect(() => {
    if (canvas) {
      // Initialize chart without tracking dependencies to prevent re-creation
      chart = new Chart(canvas, {
        type: "line",
        data: untrack(() => data),
        options: untrack(() => finalOptions),
      });

      return () => {
        if (chart) {
          chart.destroy();
          chart = null;
        }
      };
    }
  });

  // Throttled chart update (max 4 updates/sec statt 60+)
  const throttledChartUpdate = throttle(() => {
    if (chart) {
      chart.data = data;
      chart.options = finalOptions;
      chart.update();
    }
  }, 250);

  $effect(() => {
    // Trigger throttled update whenever data/options change
    throttledChartUpdate();
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
