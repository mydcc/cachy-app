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
