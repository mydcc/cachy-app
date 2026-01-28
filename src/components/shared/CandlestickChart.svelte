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
  import { onMount, untrack } from "svelte";
  import { Chart, type ChartConfiguration, type Plugin } from "chart.js";
  import { browser } from "$app/environment";
  import "../../lib/chartSetup"; // Ensure Chart.js defaults are loaded
  import type {
    PatternDefinition,
    CandleData,
  } from "../../services/candlestickPatterns";

  interface Props {
    pattern: PatternDefinition;
  }

  let { pattern }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  // Helper to resolve CSS variables (handles "var(--name)" references)
  const resolveColor = (varName: string, fallback: string = "#000000") => {
    if (!browser) return fallback;

    // 1. Get the raw value (might be "var(--other)")
    let val = getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim();
    if (!val) return fallback;

    // 2. If it's a direct color (hex, rgb, etc) and not a variable reference, return it
    if (!val.startsWith("var(") && !val.includes("var(")) {
      return val;
    }

    // 3. If it is a variable reference, we need the browser to resolve it.
    try {
      const temp = document.createElement("div");
      temp.style.display = "none";
      temp.style.backgroundColor = `var(${varName})`;
      document.body.appendChild(temp);
      const resolved = getComputedStyle(temp).backgroundColor;
      document.body.removeChild(temp);
      return resolved || fallback;
    } catch (e) {
      console.warn("Failed to resolve color:", varName, e);
      return fallback;
    }
  };

  // Helper to add opacity to a color string
  function addOpacity(color: string, opacity: number): string {
      if (!color) return `rgba(0,0,0,${opacity})`;

      // Handle RGB(A)
      if (color.startsWith('rgb')) {
          // If rgba, we can't easily increase opacity without parsing, but usually we get rgb from computed style
          if (color.startsWith('rgba')) return color;
          return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
      }

      // Handle Hex
      if (color.startsWith('#')) {
          let hex = color.substring(1);
          if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
          const bigint = parseInt(hex, 16);
          const r = (bigint >> 16) & 255;
          const g = (bigint >> 8) & 255;
          const b = bigint & 255;
          return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }

      // Fallback for named colors or others, return as is (no opacity added)
      return color;
  }

  function prepareChartData(candles: CandleData[]) {
    // Dynamic Spacing Logic
    // If few candles, we pad with empty labels to center them visually
    // If many candles, we use them as is.
    // Target: We want them centered.
    // Hack: Add empty data points to left and right?
    // Better: Chart.js 'barThickness' and axis padding.

    // We stick to simple data mapping but control visual density via scales config
    const labels = candles.map((_, i) => i.toString());

    const wickData = candles.map((c) => [c.low, c.high] as [number, number]);

    const bodyData = candles.map((c) => {
      if (Math.abs(c.open - c.close) < 0.00001) {
        return [c.open - 0.05, c.open + 0.05] as [number, number];
      }
      return [Math.min(c.open, c.close), Math.max(c.open, c.close)] as [
        number,
        number,
      ];
    });

    const successColor = resolveColor("--success-color", "#0ECB81");
    const dangerColor = resolveColor("--danger-color", "#F6465D");

    const colors = candles.map((c) =>
      c.close >= c.open ? successColor : dangerColor,
    );

    return {
      labels,
      datasets: [
        {
          label: "Wicks",
          data: wickData,
          backgroundColor: colors,
          borderColor: colors,
          barThickness: 2,
          grouped: false,
          order: 1,
        },
        {
          label: "Bodies",
          data: bodyData,
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 1,
          barThickness: 20,
          borderRadius: 2, // Rounded corners for bodies
          grouped: false,
          order: 0,
        },
      ],
    };
  }

  const annotationPlugin: Plugin = {
    id: "patternHighlights",
    afterDraw(chart) {
      if (!pattern.keyFeatures) return;

      const ctx = chart.ctx;
      const xAxis = chart.scales.x;
      const yAxis = chart.scales.y;

      const accentColor = resolveColor("--color-accent", "#FACC15");
      const accentBg = resolveColor(
        "--color-accent-transparent",
        "rgba(250, 204, 21, 0.2)",
      );
      // Manually making transparency if variable not available
      const accentRgbMatch = accentColor.match(/\d+, \d+, \d+/);
      const accentRgb = accentRgbMatch ? accentRgbMatch[0] : "250, 204, 21";
      const accentBgManual = `rgba(${accentRgb}, 0.2)`;

      const successBg = `rgba(${resolveColor("--success-color-rgb", "34, 197, 94")}, 0.2)`;
      const dangerBg = `rgba(${resolveColor("--danger-color-rgb", "239, 68, 68")}, 0.2)`;

      pattern.keyFeatures.forEach((feature) => {
        ctx.save();

        // Helper to get coordinates
        const getX = (idx: number) => xAxis.getPixelForValue(idx);
        const getY = (val: number) => yAxis.getPixelForValue(val);
        const getCandle = (idx: number) => pattern.candles[idx];

        if (feature.type === "body" && feature.candleIndex !== undefined) {
          const candle = getCandle(feature.candleIndex);
          const x = getX(feature.candleIndex);
          const yTop = getY(Math.max(candle.open, candle.close));
          const yBottom = getY(Math.min(candle.open, candle.close));
          const width = 32;

          ctx.fillStyle = feature.color
            ? resolveColor(feature.color, feature.color)
            : accentBgManual;
          ctx.strokeStyle = feature.borderColor
            ? resolveColor(feature.borderColor, feature.borderColor)
            : accentColor;
          ctx.lineWidth = 1.5;

          ctx.beginPath();
          ctx.roundRect(x - width / 2, yTop - 2, width, yBottom - yTop + 4, 6);
          ctx.fill();
          if (feature.borderColor) ctx.stroke();
        } else if (
          feature.type === "gap" &&
          feature.candleIndex1 !== undefined &&
          feature.candleIndex2 !== undefined
        ) {
          const x1 = getX(feature.candleIndex1);
          const x2 = getX(feature.candleIndex2);
          const c1 = getCandle(feature.candleIndex1);
          const c2 = getCandle(feature.candleIndex2);

          let yHigh, yLow;
          if (feature.direction === "up") {
            yHigh = getY(c2.low);
            yLow = getY(c1.high);
          } else {
            yHigh = getY(c1.low);
            yLow = getY(c2.high);
          }

          const top = Math.min(yHigh, yLow);
          const height = Math.abs(yHigh - yLow);
          const x = (x1 + x2) / 2;

          if (height > 2) {
            ctx.fillStyle = feature.color
              ? resolveColor(feature.color, feature.color)
              : successBg;
            ctx.strokeStyle = feature.color
              ? resolveColor(feature.color, feature.color).replace("0.2", "0.8")
              : successBg.replace("0.2", "0.8");
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(x - 12, top, 24, height, 4);
            ctx.fill();
            ctx.stroke();
          }
        } else if (
          feature.type === "line" &&
          feature.candleIndex1 !== undefined &&
          feature.candleIndex2 !== undefined
        ) {
          const x1 = getX(feature.candleIndex1);
          const x2 = getX(feature.candleIndex2);
          // @ts-ignore
          const val1 = getCandle(feature.candleIndex1)[
            feature.yValue1Property || "close"
          ];
          // @ts-ignore
          const val2 = getCandle(feature.candleIndex2)[
            feature.yValue2Property || "close"
          ];

          const y1 = getY(val1);
          const y2 = getY(val2);

          ctx.strokeStyle = feature.color
            ? resolveColor(feature.color, feature.color)
            : accentColor;
          ctx.lineWidth = feature.lineWidth || 2;
          if (feature.dashed) ctx.setLineDash([4, 4]);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (
          feature.type === "shadow" &&
          feature.candleIndex !== undefined
        ) {
          const x = getX(feature.candleIndex);
          const candle = getCandle(feature.candleIndex);

          let yStart, yEnd;
          if (feature.shadowType === "upper") {
            yStart = getY(Math.max(candle.open, candle.close));
            yEnd = getY(candle.high);
          } else {
            yStart = getY(Math.min(candle.open, candle.close));
            yEnd = getY(candle.low);
          }

          ctx.strokeStyle = feature.color
            ? resolveColor(feature.color, feature.color)
            : accentColor;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x + 5, yStart);
          ctx.lineTo(x + 5, yEnd);
          ctx.stroke();
        } else if (
          feature.type === "engulf" &&
          feature.candleIndex1 !== undefined &&
          feature.candleIndex2 !== undefined
        ) {
          // Engulfing box
          const x2 = getX(feature.candleIndex2);
          const c2 = getCandle(feature.candleIndex2);
          const yTop = getY(Math.max(c2.open, c2.close));
          const yBottom = getY(Math.min(c2.open, c2.close));
          const width = 36;

          ctx.strokeStyle = feature.borderColor
            ? resolveColor(feature.borderColor, feature.borderColor)
            : accentColor;
          ctx.lineWidth = 2;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.roundRect(x2 - width / 2, yTop - 4, width, yBottom - yTop + 8, 6);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.restore();
      });
    },
  };

  $effect(() => {
    if (canvas && pattern) {
      if (chart) {
        chart.destroy();
      }

      let min = Infinity;
      let max = -Infinity;
      pattern.candles.forEach((c) => {
        min = Math.min(min, c.low);
        max = Math.max(max, c.high);
      });
      const range = max - min;
      const padding = range * 0.25;

      // Center Logic: Chart.js scales
      // We can force X axis min/max to create padding
      // Candles are indexed 0, 1, 2...
      // If we have 1 candle (index 0), we want it centered.
      // Setting min: -2, max: 2 puts 0 in middle.

      const count = pattern.candles.length;
      let xMin = -0.5;
      let xMax = count - 0.5;

      if (count < 5) {
        // Add padding to force centering visually
        const padCount = (5 - count) / 2;
        xMin = -padCount - 0.5;
        xMax = count + padCount - 0.5;
      }

      chart = new Chart(canvas, {
        type: "bar",
        data: prepareChartData(pattern.candles),
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              display: false,
              grid: { display: false },
              min: xMin,
              max: xMax,
              stacked: true,
            },
            y: {
              display: false,
              grid: { display: false },
              min: min - padding,
              max: max + padding,
            },
          },
          animation: false,
        },
        plugins: [annotationPlugin],
      } as ChartConfiguration);
    }
  });

  // Re-render on theme change?
  // We need to listen to theme changes to update colors.
  // Using MutationObserver on document.documentElement (like in ThreeBackground) or simple interval check?
  // Or just rely on re-mount if user changes theme? Modal usually stays open.
  // Ideally we subscribe to a theme store or signal.

  let observer: MutationObserver;
  onMount(() => {
    observer = new MutationObserver(() => {
      if (chart && pattern) {
        const newData = prepareChartData(pattern.candles);
        chart.data.datasets[0].backgroundColor =
          newData.datasets[0].backgroundColor;
        chart.data.datasets[0].borderColor = newData.datasets[0].borderColor;
        chart.data.datasets[1].backgroundColor =
          newData.datasets[1].backgroundColor;
        chart.data.datasets[1].borderColor = newData.datasets[1].borderColor;
        chart.update();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => observer.disconnect();
  });

  $effect(() => {
    return () => {
      if (chart) chart.destroy();
    };
  });
</script>

<div
  class="w-full h-64 bg-[var(--bg-secondary)] rounded-lg relative flex items-center justify-center p-4 border border-[var(--border-color)]"
>
  <canvas bind:this={canvas}></canvas>
</div>
