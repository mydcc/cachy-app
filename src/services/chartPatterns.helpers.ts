/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


import type { InteractiveElement, ThemeColors, AddInteractiveElement } from './chartPatterns.types';

export const DEFAULT_PATTERN_COLORS: ThemeColors = {
  text: "#e5e7eb",
  grid: "#374151",
  border: "#374151",
  bullish: "#22c55e",
  bullishLight: "#86efac",
  bullishFill: "#22c55e33",
  bearish: "#ef4444",
  bearishLight: "#fca5a5",
  bearishFill: "#ef444433",
  neutral: "#60a5fa",
  neutralLight: "#93c5fd",
  highlight: "#fde047",
  gray: "#9ca3af",
  background: "#1f2937"
};


// --- Helper Functions ---

export function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  tooltipText: string,
  addInteractive: AddInteractiveElement
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  if (tooltipText && addInteractive) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const path = new Path2D();
    path.rect(midX - 20, midY - 10, 40, 20);
    addInteractive({
      path,
      tooltip: tooltipText,
      isLine: true,
      x1,
      y1,
      x2,
      y2,
      color,
      width,
    });
  }
}

export function drawLineWithLabel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  label: string,
  addInteractive: AddInteractiveElement,
  labelOffset: number = 15,
) {
  drawLine(ctx, x1, y1, x2, y2, color, width, label, addInteractive);
  if (label) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.translate(midX, midY);
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    let offsetX = labelOffset * Math.sin(angle);
    let offsetY = -labelOffset * Math.cos(angle);
    if (Math.abs(Math.sin(angle)) < 0.1) {
      offsetY = y1 < h / 2 ? -labelOffset : labelOffset;
      offsetX = 0;
    } else if (Math.abs(Math.cos(angle)) < 0.1) {
      offsetX = x1 < w / 2 ? -labelOffset : labelOffset;
      offsetY = 0;
    }
    drawText(ctx, label, offsetX, offsetY, color, "10px");
    ctx.restore();
  }
}

export function drawPeak(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  peakY: number,
  width: number,
  baseY: number,
  color: string,
  tooltipText: string,
  addInteractive: AddInteractiveElement
) {
  const halfWidth = width / 2;
  ctx.beginPath();
  ctx.moveTo(centerX - halfWidth, baseY);
  ctx.lineTo(centerX, peakY);
  ctx.lineTo(centerX + halfWidth, baseY);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (tooltipText && addInteractive) {
    const path = new Path2D();
    path.moveTo(centerX - halfWidth, baseY);
    path.lineTo(centerX, peakY);
    path.lineTo(centerX + halfWidth, baseY);
    path.closePath();
    addInteractive({ path, tooltip: tooltipText });
  }
}

export function drawTrough(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  troughY: number,
  width: number,
  baseY: number,
  color: string,
  tooltipText: string,
  addInteractive: AddInteractiveElement
) {
  const halfWidth = width / 2;
  ctx.beginPath();
  ctx.moveTo(centerX - halfWidth, baseY);
  ctx.lineTo(centerX, troughY);
  ctx.lineTo(centerX + halfWidth, baseY);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (tooltipText && addInteractive) {
    const path = new Path2D();
    path.moveTo(centerX - halfWidth, baseY);
    path.lineTo(centerX, troughY);
    path.lineTo(centerX + halfWidth, baseY);
    path.closePath();
    addInteractive({ path, tooltip: tooltipText });
  }
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size: string = "12px") {
  ctx.fillStyle = color;
  ctx.font = `${size} Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

export function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  width: number,
  tooltipText: string,
  addInteractive: AddInteractiveElement
) {
  const headLength = 10;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  drawLine(ctx, fromX, fromY, toX, toY, color, width, tooltipText, addInteractive);
  const path = new Path2D();
  path.moveTo(toX, toY);
  path.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6),
  );
  path.moveTo(toX, toY);
  path.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
}

export function drawCandle(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, tooltipText: string, addInteractive: AddInteractiveElement) {
  const top = y - height / 2;
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.fillRect(x - width / 2, top, width, height);
  if (tooltipText && addInteractive) {
    const path = new Path2D();
    path.rect(x - width / 2 - 2, top - 2, width + 4, height + 4);
    addInteractive({ path, tooltip: tooltipText });
  }
}

export function addTooltipToPath(addInteractive: AddInteractiveElement, path: Path2D | null, tooltipText: string) {
  if (tooltipText && addInteractive && path) {
     addInteractive({ path, tooltip: tooltipText });
  }
}


export function drawPatternSeries(
  ctx: CanvasRenderingContext2D,
  elements: Array<{ x: number, y: number, width: number, label?: string, tooltip: string, color: string, labelY?: number }>,
  baseY: number,
  drawElement: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, by: number, c: string, t: string, ai: AddInteractiveElement) => void,
  addInteractive: AddInteractiveElement,
  labelColor: string
) {
  elements.forEach(el => {
    drawElement(ctx, el.x, el.y, el.width, baseY, el.color, el.tooltip, addInteractive);
    if (el.label) {
      drawText(ctx, el.label, el.x, el.labelY ?? (el.y - 10), labelColor);
    }
  });
}

export function drawPricePath(
  ctx: CanvasRenderingContext2D,
  points: {x: number, y: number}[],
  color: string,
  width: number = 1.5
) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

// --- Pattern Definitions ---
