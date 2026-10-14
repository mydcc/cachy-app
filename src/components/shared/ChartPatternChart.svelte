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
  import { onMount } from "svelte";
  import { _ } from "../../locales/i18n";
  import type { TranslationKey } from "../../locales/schema";
  import {
    type ChartPatternDefinition,
    type ChartPatternLabels,
    type InteractiveElement,
    CHART_PATTERN_LABEL_KEYS,
    getThemeColors,
  } from "../../services/chartPatterns";
  import { portal } from "../../lib/actions/portal";

  let { pattern }: { pattern: ChartPatternDefinition } = $props();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let container: HTMLDivElement;
  let width = $state(0);
  let height = $state(0);
  let resizeObserver: ResizeObserver;

  // Local state for interactive elements (no longer global)
  let interactiveElements: InteractiveElement[] = [];

  let tooltip = $state({
    visible: false,
    text: "",
    x: 0,
    y: 0
  });

  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, textColor: string) {
    // Grid
    ctx.beginPath();
    ctx.strokeStyle = color; // Use faint color
    ctx.lineWidth = 0.5;

    // Create a 10x10 grid roughly
    const stepX = w / 10;
    const stepY = h / 8;

    for (let x = stepX; x < w; x += stepX) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = stepY; y < h; y += stepY) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Axes
    ctx.beginPath();
    ctx.strokeStyle = textColor; // Stronger color for axes
    ctx.lineWidth = 1;
    ctx.moveTo(0, h);
    ctx.lineTo(w, h); // X Axis
    ctx.moveTo(0, 0);
    ctx.lineTo(0, h); // Y Axis
    ctx.stroke();

    // Axis Labels (Fake)
    ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.5;
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Price", 5, 15);
    ctx.textAlign = "right";
    ctx.fillText("Time", w - 10, h - 10);
    ctx.globalAlpha = 1.0;
  }

  function getChartLabels(): ChartPatternLabels {
    // Resolved here (not in draw.ts) so the pure canvas module stays
    // free of hardcoded text. Read inside draw()'s $effect, so a locale
    // switch redraws the annotations automatically.
    return Object.fromEntries(
        CHART_PATTERN_LABEL_KEYS.map((key) => [
            key,
            $_(`chartPatterns.labels.${key}` as TranslationKey),
        ]),
    ) as ChartPatternLabels;
  }

  function draw() {
    if (!ctx || !width || !height) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    // Reset transform to identity before scaling
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Get dynamic colors
    const colors = getThemeColors((name) =>
        getComputedStyle(canvas).getPropertyValue(name).trim(),
    );

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw Grid
    drawGrid(ctx, width, height, colors.grid, colors.text);

    // Reset local interactives
    interactiveElements = [];

    // Draw Pattern
    if (pattern && pattern.drawFunction) {
      try {
        pattern.drawFunction(
            ctx,
            width,
            height,
            (el) => interactiveElements.push(el),
            colors,
            getChartLabels()
        );
      } catch (e) {
        console.error("Error drawing pattern:", e);
      }
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!canvas || !ctx) return;

    const x = e.offsetX;
    const y = e.offsetY;

    let found = false;
    // Iterate backwards to find top-most element
    for (let i = interactiveElements.length - 1; i >= 0; i--) {
        const el = interactiveElements[i];
        if (el.path && ctx.isPointInPath(el.path, x, y)) {
             found = true;
             tooltip = { visible: true, text: el.tooltip, x: e.clientX, y: e.clientY };
             break;
        }
    }

    if (!found) {
        tooltip.visible = false;
    }
  }

  $effect(() => {
    if (pattern && width && height && ctx) {
      draw();
    }
  });

  onMount(() => {
    if (canvas) {
        ctx = canvas.getContext("2d");
    }

    resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        width = entry.contentRect.width;
        height = width * (9/16); // 16:9 Aspect Ratio
      }
    });
    if (container) {
        resizeObserver.observe(container);
    }

    // getThemeColors() resolves at draw time, so without this a dark↔light
    // switch would leave the old palette on screen — the same reason
    // IndicatorLessonChart and CandlestickChart watch the theme. Coalesced
    // via rAF like the siblings, so clustered attribute writes repaint once.
    let themeFrameId = 0;
    const themeObserver = new MutationObserver(() => {
        cancelAnimationFrame(themeFrameId);
        themeFrameId = requestAnimationFrame(() => draw());
    });
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["style", "class", "data-theme"],
    });

    return () => {
        resizeObserver.disconnect();
        themeObserver.disconnect();
        cancelAnimationFrame(themeFrameId);
    };
  });
</script>

<div bind:this={container} class="w-full relative" style="min-height: 200px;">
  <canvas
    bind:this={canvas}
    onmousemove={handleMouseMove}
    onmouseleave={() => tooltip.visible = false}
    class="w-full block rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
    style="cursor: {tooltip.visible ? 'help' : 'default'};"
  ></canvas>

  {#if tooltip.visible}
    <!-- Portaled to <body>: this chart only ever renders inside the Trading
         Academy modal, and that modal's glass background gives backdrop-filter
         to an ancestor, which makes it the containing block for `position:
         fixed` descendants. Left in place, the tooltip's viewport-relative
         clientX/clientY coordinates would resolve against the modal instead
         (BUG-0048). Portaling out means its z-index now competes globally
         rather than only within the modal, hence --z-toast (above --z-modal)
         instead of the previous, now-too-low literal. -->
    <div
        use:portal
        class="fixed z-[var(--z-toast)] px-3 py-2 bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm rounded-lg shadow-xl border border-[var(--border-color)] pointer-events-none transform -translate-y-full -translate-x-1/2 mt-[-10px]"
        style="left: {tooltip.x}px; top: {tooltip.y}px;"
    >
        {tooltip.text}
    </div>
  {/if}
</div>
