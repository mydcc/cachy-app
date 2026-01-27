<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Chart, type ChartConfiguration, type Plugin } from "chart.js";
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

  function prepareChartData(candles: CandleData[]) {
    const labels = candles.map((_, i) => i.toString());

    // Dataset 1: Wicks (Low to High) - Thin bars
    const wickData: [number, number][] = candles.map((c) => [c.low, c.high]);

    // Dataset 2: Bodies (Open to Close) - Thick bars
    // Note: If Open == Close (Doji), we need a tiny height to make it visible
    const bodyData: [number, number][] = candles.map((c) => {
      if (Math.abs(c.open - c.close) < 0.00001) {
        // Tiny offset for Doji visibility
        return [c.open - 0.05, c.open + 0.05];
      }
      return [Math.min(c.open, c.close), Math.max(c.open, c.close)];
    });

    const colors = candles.map((c) =>
      c.close >= c.open ? "#0ECB81" : "#F6465D",
    ); // Binance-like Green/Red
    const borderColors = candles.map((c) =>
      c.close >= c.open ? "#0ECB81" : "#F6465D",
    );

    return {
      labels,
      datasets: [
        {
          label: "Wicks",
          data: wickData,
          backgroundColor: colors, // Wick matches body color
          borderColor: colors, // Wick matches body color
          barThickness: 2, // Thin wick (2px)
          grouped: false, // IMPORTANT: Overlap with body
          order: 1, // Draw behind (technically Chart.js draws higher order first? No, lower index first usually. But Order property: lower number is top. Let's rely on array order + grouped: false)
        },
        {
          label: "Bodies",
          data: bodyData,
          backgroundColor: colors,
          borderColor: borderColors,
          borderWidth: 1,
          barThickness: 20, // Wider body
          grouped: false, // IMPORTANT: Overlap with wick
          order: 0, // Draw on top of wick (if needed, though same color merges them)
        },
      ],
    };
  }

  // Custom Plugin for Annotations (kept mostly same, adjusted for visual clarity)
  const annotationPlugin: Plugin = {
    id: "patternHighlights",
    afterDraw(chart) {
      if (!pattern.keyFeatures) return;

      const ctx = chart.ctx;
      const xAxis = chart.scales.x;
      const yAxis = chart.scales.y;

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
          const width = 32; // Slightly larger than bar (20px body)

          ctx.fillStyle = feature.color || "rgba(250, 204, 21, 0.2)"; // Softer yellow
          ctx.strokeStyle = feature.borderColor || "#FACC15";
          ctx.lineWidth = 1.5;

          // Round Rect
          ctx.beginPath();
          ctx.roundRect(x - width / 2, yTop - 2, width, yBottom - yTop + 4, 6); // Add padding
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
            ctx.fillStyle = feature.color || "rgba(163,230,53,0.2)";
            ctx.strokeStyle = "rgba(163,230,53, 0.8)";
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

          ctx.strokeStyle = feature.color || "#FACC15";
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

          // Highlight shadow with a colored line alongside it or over it
          ctx.strokeStyle = feature.color || "#FACC15";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x + 5, yStart); // Offset slightly to right
          ctx.lineTo(x + 5, yEnd);
          ctx.stroke();
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
      const padding = (max - min) * 0.25; // More padding

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
              stacked: true, // Crucial for overlapping if grouped: false isn't enough, but grouped: false is better for individual control.
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
      });
    }
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
