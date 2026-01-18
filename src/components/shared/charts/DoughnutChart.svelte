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

  let { data, title = "", description = "", options = {} }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  let mergedOptions = $derived({
    responsive: true,
    maintainAspectRatio: false,
    ...options,
    plugins: {
      ...((options && options.plugins) || {}),
      legend: {
        position: "right" as const,
        ...((options && options.plugins?.legend) || {}),
      },
      title: {
        display: !!title,
        text: title,
        ...((options && options.plugins?.title) || {}),
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
