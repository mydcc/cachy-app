
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Chart, type ChartConfiguration, type Plugin } from "chart.js";
  import "../../lib/chartSetup"; // Ensure Chart.js defaults are loaded
  import type { PatternDefinition, CandleData } from "../../services/candlestickPatterns";

  interface Props {
    pattern: PatternDefinition;
  }

  let { pattern }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  function prepareChartData(candles: CandleData[]) {
    const labels = candles.map((_, i) => i.toString());

    // Dataset 1: Wicks (Low to High) - Thin bars
    const wickData = candles.map(c => [c.low, c.high]);

    // Dataset 2: Bodies (Open to Close) - Thick bars
    // Note: If Open == Close (Doji), we need a tiny height to make it visible
    const bodyData = candles.map(c => {
        if (Math.abs(c.open - c.close) < 0.00001) {
            // Tiny offset for Doji visibility
            return [c.open - 0.05, c.open + 0.05];
        }
        return [Math.min(c.open, c.close), Math.max(c.open, c.close)];
    });

    const colors = candles.map(c => c.close >= c.open ? '#22C55E' : '#EF4444');
    const borderColors = candles.map(c => c.close >= c.open ? '#15803d' : '#b91c1c');

    return {
      labels,
      datasets: [
        {
          label: 'Wicks',
          data: wickData,
          backgroundColor: '#6B7280', // Gray for wicks
          barThickness: 2,
          order: 1 // Draw behind bodies? No, standard is wicks behind or center.
                   // Chart.js draws datasets in order.
                   // If we want wicks 'behind', draw them first (index 0).
        },
        {
          label: 'Bodies',
          data: bodyData,
          backgroundColor: colors,
          borderColor: borderColors,
          borderWidth: 1,
          barThickness: 20, // Fixed width or percentage
          barPercentage: 0.7,
          categoryPercentage: 0.8,
          order: 0 // Draw on top
        }
      ]
    };
  }

  // Custom Plugin for Annotations
  const annotationPlugin: Plugin = {
    id: 'patternHighlights',
    afterDraw(chart) {
      if (!pattern.keyFeatures) return;

      const ctx = chart.ctx;
      const xAxis = chart.scales.x;
      const yAxis = chart.scales.y;

      pattern.keyFeatures.forEach(feature => {
        ctx.save();

        // Helper to get coordinates
        const getX = (idx: number) => xAxis.getPixelForValue(idx);
        const getY = (val: number) => yAxis.getPixelForValue(val);
        const getCandle = (idx: number) => pattern.candles[idx];

        if (feature.type === 'body' && feature.candleIndex !== undefined) {
            const candle = getCandle(feature.candleIndex);
            const x = getX(feature.candleIndex);
            // Highlight full range or body? The HTML logic highlighted body + small padding
            // Let's highlight the body region
            const yTop = getY(Math.max(candle.open, candle.close));
            const yBottom = getY(Math.min(candle.open, candle.close));
            const width = 28; // Slightly larger than bar

            ctx.fillStyle = feature.color || 'rgba(250, 204, 21, 0.3)';
            ctx.strokeStyle = feature.borderColor || '#FACC15';
            ctx.lineWidth = 2;

            // Round Rect
            ctx.beginPath();
            ctx.roundRect(x - width/2, yTop, width, yBottom - yTop, 4);
            ctx.fill();
            if (feature.borderColor) ctx.stroke();

        } else if (feature.type === 'gap' && feature.candleIndex1 !== undefined && feature.candleIndex2 !== undefined) {
            const x1 = getX(feature.candleIndex1);
            const x2 = getX(feature.candleIndex2);
            const c1 = getCandle(feature.candleIndex1);
            const c2 = getCandle(feature.candleIndex2);

            // Determine gap region
            let yHigh, yLow;
            if (feature.direction === 'up') {
                yHigh = getY(Math.min(c1.high, c2.low)); // Upper bound (lower price) in Chart.js Y is inverted? No, getPixel handles it.
                // Wait, Y pixel 0 is top. High price is low pixel value.
                // Gap is between c1.High and c2.Low (if Up)
                yHigh = getY(c2.low);
                yLow = getY(c1.high);
            } else {
                yHigh = getY(c1.low);
                yLow = getY(c2.high);
            }

            // Chart.js getPixelForValue(highPrice) < getPixelForValue(lowPrice)
            // Rect top is min pixel, height is diff
            const top = Math.min(yHigh, yLow);
            const height = Math.abs(yHigh - yLow);
            const x = (x1 + x2) / 2;

            if (height > 2) {
                ctx.fillStyle = feature.color || 'rgba(163,230,53,0.3)';
                ctx.beginPath();
                ctx.roundRect(x - 10, top, 20, height, 4);
                ctx.fill();
            }

        } else if (feature.type === 'line' && feature.candleIndex1 !== undefined && feature.candleIndex2 !== undefined) {
             const x1 = getX(feature.candleIndex1);
             const x2 = getX(feature.candleIndex2);
             // @ts-ignore
             const val1 = getCandle(feature.candleIndex1)[feature.yValue1Property || 'close'];
             // @ts-ignore
             const val2 = getCandle(feature.candleIndex2)[feature.yValue2Property || 'close'];

             const y1 = getY(val1);
             const y2 = getY(val2);

             ctx.strokeStyle = feature.color || '#FACC15';
             ctx.lineWidth = feature.lineWidth || 2;
             if (feature.dashed) ctx.setLineDash([5, 5]);

             ctx.beginPath();
             ctx.moveTo(x1, y1);
             ctx.lineTo(x2, y2);
             ctx.stroke();
             ctx.setLineDash([]);
        }

        // Add more types (shadow, engulf, etc.) as needed based on extract
        // Implementing basic ones for now covers 80% visual impact

        ctx.restore();
      });
    }
  };

  $effect(() => {
    if (canvas && pattern) {
      if (chart) {
        chart.destroy();
      }

      // Calculate min/max for scale with padding
      let min = Infinity;
      let max = -Infinity;
      pattern.candles.forEach(c => {
          min = Math.min(min, c.low);
          max = Math.max(max, c.high);
      });
      const padding = (max - min) * 0.2;

      chart = new Chart(canvas, {
        type: 'bar', // Using bar for candles
        data: prepareChartData(pattern.candles),
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false } // Disable tooltips for static pattern view
            },
            scales: {
                x: {
                    display: false, // Hide X axis
                    grid: { display: false }
                },
                y: {
                    display: false, // Hide Y axis price labels for cleaner look? Or keep them?
                                    // HTML had no axis. Let's hide grid but maybe keep scale?
                                    // Actually HTML canvas had no axis.
                    grid: { display: false },
                    min: min - padding,
                    max: max + padding
                }
            },
            animation: false // Disable animation for instant render
        },
        plugins: [annotationPlugin]
      });
    }
  });

  // Cleanup
  $effect(() => {
      return () => {
          if (chart) chart.destroy();
      }
  })

</script>

<div class="w-full h-64 bg-[var(--bg-secondary)] rounded-lg relative flex items-center justify-center p-4 border border-[var(--border-color)]">
    <canvas bind:this={canvas}></canvas>

    <!-- Optional: Pattern Name Overlay if needed, but Modal handles it outside -->
</div>
