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

  $effect(() => {
    if (canvas) {
      // Initialize chart without tracking dependencies to prevent re-creation
      chart = new Chart(canvas, {
        type: "line",
        data: untrack(() => data),
        options: untrack(() => options),
      });

      return () => {
        if (chart) {
          chart.destroy();
          chart = null;
        }
      };
    }
  });

  $effect(() => {
    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
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
