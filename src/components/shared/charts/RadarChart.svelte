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
  import {
    Chart,
    Tooltip as ChartTooltip,
    Legend,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    RadarController,
    type TooltipItem,
  } from "chart.js";
  import Tooltip from "../Tooltip.svelte";
  import { throttle } from "lodash-es";
  import { readCssColor, parseColorToRgb } from "../../../lib/themeColors";

  // Register necessary components for Radar
  Chart.register(
    RadarController,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    ChartTooltip,
    Legend,
  );

  interface Props {
    data: { labels?: string[]; data?: number[] };
    title?: string;
    description?: string;
    labels?: string[];
  }

  let { data, title = "", description = "", labels = [] }: Props = $props();

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
        color: readCssColor("--text-secondary", "#94a3b8"),
      },
      tooltip: {
        callbacks: {
          label: function (context: TooltipItem<"radar">) {
            // If raw values are attached, show them?
            // Currently data is normalized 0-100.
            return `${context.label}: ${(context.raw as number).toFixed(1)}/100`;
          },
        },
      },
    },
    scales: {
      r: {
        angleLines: {
          color: "rgba(148, 163, 184, 0.1)",
        },
        grid: {
          color: "rgba(148, 163, 184, 0.1)",
        },
        pointLabels: {
          color: readCssColor("--text-secondary", "#94a3b8"),
          font: {
            size: 11,
          },
        },
        ticks: {
          display: false, // Hide 0-100 ticks to keep it clean
          backdropColor: "transparent",
        },
        min: 0,
        max: 100,
      },
    },
  });

  // Construct chart data format
  // Data hues resolve the active theme tokens (FEAT-0344) instead of
  // hardcoding Chart.js blues, so the radar follows light/dark themes. The
  // fill is the accent at 0.2 alpha — derived via parseColorToRgb so hex and
  // rgb() resolutions both work (hexToRgba only accepts hex).
  const chartAccent = readCssColor("--accent-color", "rgb(54, 162, 235)");
  const chartAccentRgb = parseColorToRgb(chartAccent) ?? [54, 162, 235];
  const chartAccentFill = `rgba(${chartAccentRgb[0]}, ${chartAccentRgb[1]}, ${chartAccentRgb[2]}, 0.2)`;
  const chartPointFill = readCssColor("--bg-tertiary", "#1e293b");
  let chartData = $derived({
    labels: labels.length > 0 ? labels : data?.labels || [],
    datasets: [
      {
        label: title,
        data: data?.data || [],
        fill: true,
        backgroundColor: chartAccentFill,
        borderColor: chartAccent,
        pointBackgroundColor: chartAccent,
        pointBorderColor: chartPointFill,
        pointHoverBackgroundColor: chartPointFill,
        pointHoverBorderColor: chartAccent,
      },
    ],
  });

  $effect(() => {
    if (canvas) {
      chart = new Chart(canvas, {
        type: "radar",
        data: untrack(() => chartData),
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

  // Throttled chart update (max 4 updates/sec)
  const throttledChartUpdate = throttle(() => {
    if (chart) {
      chart.data = chartData;
      chart.options = options;
      chart.update();
    }
  }, 250);

  $effect(() => {
    throttledChartUpdate();
  });
</script>

<div
  class="w-full h-full min-h-[250px] relative flex flex-col items-center justify-center"
>
  {#if description}
    <div class="absolute bottom-[-10px] left-[-10px] z-10 p-2">
      <Tooltip text={description} />
    </div>
  {/if}
  <canvas bind:this={canvas}></canvas>
</div>
