
<script lang="ts">
  import { onMount } from "svelte";
  import { Chart, type ChartConfiguration, type Plugin } from "chart.js";
  import { browser } from "$app/environment";
  import "../../lib/chartSetup";
  import type { ChartPattern } from "../../services/chartPatterns";

  interface Props {
    pattern: ChartPattern;
  }

  let { pattern }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  // Tooltip state for custom canvas drawing
  let activeTooltip: { text: string; x: number; y: number } | null = $state(null);
  let interactivePaths: { path: Path2D; text: string }[] = [];

  const customDrawingPlugin: Plugin = {
    id: 'customPatternDrawing',
    afterDraw(chart) {
      const ctx = chart.ctx;
      const { width, height } = chart.chartArea;
      // We draw in the chart area. Note: Chart.js has padding.
      // We might want to use the full canvas size but respect padding if axes were visible.
      // Since axes are hidden, chartArea is close to full size but safer to use.

      // Clear paths for hit testing
      interactivePaths = [];

      // Add tooltip helper
      const addTooltip = (path: Path2D | null, text: string) => {
          if (path) {
              interactivePaths.push({ path, text });
          }
      };

      // Save context to ensure styles don't leak
      ctx.save();
      // Translate to chart area if needed, but drawing functions expect 0,0 to w,h
      // chart.chartArea has left, top offsets.
      ctx.translate(chart.chartArea.left, chart.chartArea.top);

      // Execute the pattern's draw function
      if (pattern && pattern.drawFunction) {
          pattern.drawFunction(ctx, width, height, addTooltip);
      }

      ctx.restore();
    }
  };

  function initChart() {
      if (!canvas || !browser) return;
      if (chart) chart.destroy();

      const config: ChartConfiguration = {
          type: 'scatter',
          data: { datasets: [] }, // Empty data
          options: {
              responsive: true,
              maintainAspectRatio: false,
              layout: {
                  padding: 20
              },
              scales: {
                  x: { display: false, min: 0, max: 100 },
                  y: { display: false, min: 0, max: 100 }
              },
              plugins: {
                  legend: { display: false },
                  tooltip: { enabled: false } // Disable native tooltips
              },
              animation: false,
              events: ['mousemove', 'mouseout', 'click'] // We handle events manually or let Chart.js bubble them
          },
          plugins: [customDrawingPlugin]
      };

      chart = new Chart(canvas, config);
  }

  function handleMouseMove(e: MouseEvent) {
      if (!chart || !interactivePaths.length) {
          activeTooltip = null;
          return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Adjust for chart area offset
      const chartArea = chart.chartArea;
      const relativeX = x - chartArea.left;
      const relativeY = y - chartArea.top;

      const ctx = chart.ctx;
      let found = false;

      // We need to check paths. Note: Context must be in the same state (transform) as when drawn?
      // Path2D objects are coordinate-agnostic but isPointInPath uses current transform?
      // Actually Path2D stores the path. We need to check intersection.
      // Simple workaround: Redraw or use simple distance checks if possible?
      // The drawFunction creates Path2D objects relative to 0,0 of the drawing area.
      // So we check against relativeX, relativeY.

      for (const item of interactivePaths) {
          if (ctx.isPointInPath(item.path, relativeX, relativeY)) {
              activeTooltip = { text: item.text, x: x + 10, y: y + 10 };
              canvas.style.cursor = 'help';
              found = true;
              break;
          }
      }

      if (!found) {
          activeTooltip = null;
          canvas.style.cursor = 'default';
      }
  }

  function handleMouseOut() {
      activeTooltip = null;
  }

  $effect(() => {
      if (pattern && canvas) {
          initChart();
      }
  });

  // Theme observer
  let observer: MutationObserver;
  onMount(() => {
      observer = new MutationObserver(() => {
          if (chart) chart.update();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
      return () => {
          if (chart) chart.destroy();
          observer.disconnect();
      };
  });

</script>

<div class="w-full h-64 lg:h-96 bg-[var(--bg-secondary)] rounded-lg relative flex items-center justify-center p-4 border border-[var(--border-color)]">
    <canvas
        bind:this={canvas}
        onmousemove={handleMouseMove}
        onmouseout={handleMouseOut}
        onblur={handleMouseOut}
    ></canvas>

    {#if activeTooltip}
        <div
            class="absolute z-50 px-2 py-1 text-xs text-white bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded shadow-lg pointer-events-none"
            style="left: {activeTooltip.x}px; top: {activeTooltip.y}px;"
        >
            {activeTooltip.text}
        </div>
    {/if}
</div>
