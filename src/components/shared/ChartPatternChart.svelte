<script lang="ts">
  import { onMount } from "svelte";
  import {
    type ChartPatternDefinition,
    type InteractiveElement,
    type ThemeColors,
    DEFAULT_PATTERN_COLORS
  } from "../../services/chartPatterns";

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

  function getThemeColors(el: HTMLElement): ThemeColors {
    const style = getComputedStyle(el);
    const getVal = (name: string) => style.getPropertyValue(name).trim();

    // Helper to add alpha to hex if possible, otherwise return default
    const withAlpha = (color: string, alpha: string) => {
        if (color && color.startsWith("#") && (color.length === 7 || color.length === 4)) {
            return color + alpha;
        }
        return color; // Return raw color if not hex (alpha will be missing, opaque)
    };

    const text = getVal("--text-primary") || DEFAULT_PATTERN_COLORS.text;
    const grid = getVal("--border-color") || DEFAULT_PATTERN_COLORS.grid;
    const border = getVal("--border-color") || DEFAULT_PATTERN_COLORS.border;
    const bullish = getVal("--success-color") || DEFAULT_PATTERN_COLORS.bullish;
    const bearish = getVal("--danger-color") || DEFAULT_PATTERN_COLORS.bearish;
    const neutral = getVal("--text-secondary") || DEFAULT_PATTERN_COLORS.neutral;
    const highlight = getVal("--warning-color") || DEFAULT_PATTERN_COLORS.highlight;
    const gray = getVal("--text-tertiary") || DEFAULT_PATTERN_COLORS.gray;
    const background = getVal("--bg-tertiary") || DEFAULT_PATTERN_COLORS.background;

    return {
        text,
        grid,
        border,
        bullish,
        bullishLight: bullish, // Fallback to main color if we can't easily lighten
        bullishFill: withAlpha(bullish, "33"),
        bearish,
        bearishLight: bearish,
        bearishFill: withAlpha(bearish, "33"),
        neutral,
        neutralLight: neutral,
        highlight,
        gray,
        background
    };
  }

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
    const colors = getThemeColors(canvas);

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
            colors
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
    return () => resizeObserver.disconnect();
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
    <div
        class="fixed z-[9999] px-3 py-2 bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm rounded-lg shadow-xl border border-[var(--border-color)] pointer-events-none transform -translate-y-full -translate-x-1/2 mt-[-10px]"
        style="left: {tooltip.x}px; top: {tooltip.y}px;"
    >
        {tooltip.text}
    </div>
  {/if}
</div>
