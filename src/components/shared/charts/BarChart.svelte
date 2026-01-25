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
  import { throttle } from "lodash-es";

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
    options = undefined,
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

  $effect(() => {
    if (canvas) {
      chart = new Chart(canvas, {
        type: "bar",
        data: untrack(() => data),
        options: untrack(() => options || defaultOptions),
      });

      return () => {
        if (chart) {
          chart.destroy();
          chart = null;
        }
      };
    }
  });

  // Throttled chart update (max 4 updates/sec)
  const throttledChartUpdate = throttle(() => {
    if (chart) {
      chart.data = data;
      chart.options = options || defaultOptions;
      chart.update();
    }
  }, 250);

  $effect(() => {
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
