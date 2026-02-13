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


export interface InteractiveElement {
  path: Path2D;
  tooltip: string;
  isLine?: boolean;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  color?: string;
  width?: number;
}

export interface ThemeColors {
  text: string;
  grid: string;
  border: string;
  bullish: string;
  bullishLight: string;
  bullishFill: string;
  bearish: string;
  bearishLight: string;
  bearishFill: string;
  neutral: string;
  neutralLight: string;
  highlight: string;
  gray: string;
  background: string;
}

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

export type AddInteractiveElement = (el: InteractiveElement) => void;

export interface ChartPatternDefinition {
  id: string;
  name: string;
  description: string;
  characteristics: string[];
  trading: string;
  advancedConsiderations?: string;
  performanceStats?: string;
  category: string;
  drawFunction: (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    addInteractive: AddInteractiveElement,
    colors: ThemeColors
  ) => void;
}

// --- Helper Functions ---

function drawLine(
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

function drawLineWithLabel(
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

function drawPeak(
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

function drawTrough(
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

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size: string = "12px") {
  ctx.fillStyle = color;
  ctx.font = `${size} Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

function drawArrow(
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

function drawCandle(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, tooltipText: string, addInteractive: AddInteractiveElement) {
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

function addTooltipToPath(addInteractive: AddInteractiveElement, path: Path2D | null, tooltipText: string) {
  if (tooltipText && addInteractive && path) {
     addInteractive({ path, tooltip: tooltipText });
  }
}


function drawPatternSeries(
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

function drawPricePath(
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

export const CHART_PATTERNS: ChartPatternDefinition[] = [
  // --- Umkehrmuster ---
  {
    id: "headAndShoulders",
    name: "SKS (Schulter-Kopf-Schulter)",
    category: "Umkehrmuster",
    description: "Ein SKS-Muster ist eine bärische Umkehrformation, die typischerweise am Ende eines Aufwärtstrends auftritt. Es besteht aus drei Hochs, wobei das mittlere Hoch (Kopf) höher ist als die beiden seitlichen Hochs (Schultern). Eine Nackenlinie verbindet die Tiefs zwischen den Hochs.",
    characteristics: [
      "Tritt nach einem Aufwärtstrend auf.",
      "Drei Peaks: linke Schulter, Kopf (höchster Peak), rechte Schulter.",
      "Nackenlinie (Neckline) verbindet die Tiefs zwischen den Peaks.",
      "Volumen ist oft höher bei der linken Schulter und dem Kopf, geringer bei der rechten Schulter.",
    ],
    trading: "Ein Verkaufssignal entsteht, wenn der Kurs die Nackenlinie nach unten durchbricht. Das Kursziel wird oft als die Distanz vom Kopf zur Nackenlinie, projiziert nach unten vom Ausbruchspunkt, berechnet.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, insbesondere bei klarem Bruch der Nackenlinie mit erhöhtem Volumen und nachfolgender Bestätigung (z.B. Pullback zur Nackenlinie, die dann als Widerstand hält).<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position bei oder nach dem Bruch der Nackenlinie. Stop-Loss (SL): Knapp über der Nackenlinie oder über der rechten Schulter. Take-Profit (TP): Mindestens die Distanz vom Kopf zur Nackenlinie, vom Ausbruchspunkt nach unten projiziert.",
    advancedConsiderations: "<strong>Fehlausbrüche:</strong> Ein Fehlausbruch über die Nackenlinie (nach oben) kann ein starkes bullisches Signal sein (siehe SKS-Top Fehlausbruch). Ein Fehlausbruch unter die Nackenlinie, der schnell wieder darüber schließt, kann ebenfalls eine Falle sein.<br><strong>Variationen:</strong> Die Nackenlinie kann leicht geneigt sein. Die Schultern müssen nicht exakt gleich hoch sein.<br><strong>Kontext:</strong> Stärkeres Signal, wenn es nach einem längeren, etablierten Aufwärtstrend auftritt. Bärische Divergenzen im RSI oder MACD können das Signal verstärken.<br><strong>Kombinationen:</strong> Kann Teil einer größeren Top-Bildung sein oder nach einem Fehlausbruch eines anderen Musters entstehen.",
    performanceStats: "Historisch gesehen eine der zuverlässigeren Umkehrformationen. Die Erfolgsquote kann je nach Markt und Zeitrahmen variieren, liegt aber oft über 60-70% bei idealtypischer Ausbildung und Bestätigung. Das Risk-Reward-Verhältnis ist oft günstig, da das Kursziel klar definiert ist.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const neckY = h * 0.6;
      drawLine(ctx, w * 0.1, neckY, w * 0.9, neckY, colors.text, 2, "Nackenlinie", addInteractive);
      drawPatternSeries(ctx, [
        { x: w * 0.25, y: h * 0.4, width: w * 0.15, label: "L Schulter", tooltip: "Linke Schulter", color: colors.bearishLight, labelY: h * 0.38 },
        { x: w * 0.5, y: h * 0.2, width: w * 0.2, label: "Kopf", tooltip: "Kopf", color: colors.bearish, labelY: h * 0.18 },
        { x: w * 0.75, y: h * 0.45, width: w * 0.15, label: "R Schulter", tooltip: "Rechte Schulter", color: colors.bearishLight, labelY: h * 0.43 }
      ], neckY, (ctx, x, y, width, baseY, color, tooltip, addInteractive) => drawPeak(ctx, x, y, width, baseY, color, tooltip, addInteractive), addInteractive, colors.highlight);
      drawText(ctx, "Nackenlinie", w * 0.5, neckY + 20, colors.text);
      drawArrow(ctx, w * 0.8, neckY, w * 0.8, neckY + h * 0.2, colors.bearish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.8, neckY + h * 0.2 + 20, colors.bearish);
      }
    },
  {
    id: "inverseHeadAndShoulders",
    name: "Inverse SKS (iSKS)",
    category: "Umkehrmuster",
    description: "Eine inverse SKS-Formation ist ein bullisches Umkehrmuster, das typischerweise am Ende eines Abwärtstrends auftritt. Es ist das Spiegelbild des SKS-Musters.",
    characteristics: [
      "Tritt nach einem Abwärtstrend auf.",
      "Drei Tiefs: linke Schulter, Kopf (tiefster Punkt), rechte Schulter.",
      "Nackenlinie verbindet die Hochs zwischen den Tiefs.",
      "Volumen kann beim Ausbruch über die Nackenlinie ansteigen."
    ],
    trading: "Ein Kaufsignal entsteht, wenn der Kurs die Nackenlinie nach oben durchbricht. Das Kursziel wird oft als die Distanz vom Kopf zur Nackenlinie, projiziert nach oben vom Ausbruchspunkt, berechnet.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, insbesondere bei klarem Bruch der Nackenlinie mit erhöhtem Volumen und nachfolgender Bestätigung (z.B. Pullback zur Nackenlinie, die dann als Unterstützung hält).<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position bei oder nach dem Bruch der Nackenlinie. SL: Knapp unter der Nackenlinie oder unter der rechten Schulter. TP: Mindestens die Distanz vom Kopf zur Nackenlinie, vom Ausbruchspunkt nach oben projiziert.",
    advancedConsiderations: "<strong>Fehlausbrüche:</strong> Ein Fehlausbruch unter die Nackenlinie (nach unten) kann ein starkes bärisches Signal sein (siehe iSKS-Boden Fehlausbruch).<br><strong>Variationen:</strong> Die Nackenlinie kann leicht geneigt sein. Die Schultern müssen nicht exakt gleich tief sein.<br><strong>Kontext:</strong> Stärkeres Signal, wenn es nach einem längeren, etablierten Abwärtstrend auftritt. Bullische Divergenzen im RSI oder MACD können das Signal verstärken.",
    performanceStats: "Ähnlich zuverlässig wie das SKS-Top. Die Erfolgsquote ist vergleichbar, und das Risk-Reward-Verhältnis kann attraktiv sein.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const neckY = h * 0.4;
      drawLine(ctx, w * 0.1, neckY, w * 0.9, neckY, colors.text, 2, "Nackenlinie", addInteractive);
      drawPatternSeries(ctx, [
        { x: w * 0.25, y: h * 0.6, width: w * 0.15, label: "L Schulter", tooltip: "Linke Schulter", color: colors.bullishLight, labelY: h * 0.62 },
        { x: w * 0.5, y: h * 0.8, width: w * 0.2, label: "Kopf", tooltip: "Kopf", color: colors.bullish, labelY: h * 0.82 },
        { x: w * 0.75, y: h * 0.55, width: w * 0.15, label: "R Schulter", tooltip: "Rechte Schulter", color: colors.bullishLight, labelY: h * 0.57 }
      ], neckY, (ctx, x, y, width, baseY, color, tooltip, addInteractive) => drawTrough(ctx, x, y, width, baseY, color, tooltip, addInteractive), addInteractive, colors.highlight);
      drawText(ctx, "Nackenlinie", w * 0.5, neckY - 15, colors.text);
      drawArrow(ctx, w * 0.8, neckY, w * 0.8, neckY - h * 0.2, colors.bullish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.8, neckY - h * 0.2 - 15, colors.bullish);
      }
    },
  {
    id: "headAndShouldersTopFailure",
    name: "SKS-Top Fehlausbruch",
    category: "Umkehrmuster",
    description: "Ein SKS-Top Fehlausbruch tritt auf, wenn ein SKS-Muster sich zu bilden beginnt, der Kurs aber die Nackenlinie nicht nachhaltig nach unten durchbricht und stattdessen wieder über die rechte Schulter oder sogar den Kopf ansteigt. Dies kann ein starkes bullisches Signal sein.",
    characteristics: [
      "Ansatz eines SKS-Top-Musters (linke Schulter, Kopf, rechte Schulter).",
      "Der Kurs scheitert daran, die Nackenlinie signifikant nach unten zu durchbrechen.",
      "Stattdessen steigt der Kurs wieder an, oft über das Niveau der rechten Schulter oder des Kopfes.",
      "Signalisiert, dass die Verkäufer nicht stark genug waren, den Trend zu wenden."
    ],
    trading: "Ein Kaufsignal entsteht, wenn der Kurs nach dem gescheiterten Bruch der Nackenlinie wieder Stärke zeigt und über wichtige Widerstandsniveaus des unvollendeten SKS-Musters steigt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, da der Fehlausbruch oft eine Falle für Short-Seller darstellt und eine starke Gegenbewegung auslösen kann.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position, wenn der Kurs über die rechte Schulter oder den Kopf des gescheiterten SKS-Musters steigt. SL: Unterhalb der Nackenlinie oder des Tiefs der rechten Schulter. TP: Basierend auf vorherigen Widerständen oder Fibonacci-Projektionen des vorherigen Aufwärtstrends.",
    advancedConsiderations: "Achten Sie auf das Volumen: Ein Fehlausbruch mit geringem Volumen beim Versuch, die Nackenlinie zu durchbrechen, und anschließendem Anstieg mit höherem Volumen ist ein stärkeres Signal.",
    performanceStats: "Fehlausbrüche können starke Signale sein, da sie Marktteilnehmer auf dem falschen Fuß erwischen. Die Zuverlässigkeit hängt von der Stärke der Umkehr ab.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const neckY = h * 0.6;
      const headPeakY = h * 0.2;
      const shoulderPeakY = h * 0.35;

      drawLine(ctx, w * 0.1, neckY, w * 0.7, neckY, colors.text, 2, "Nackenlinie (nicht gebrochen)", addInteractive);
      drawPeak(ctx, w * 0.2, shoulderPeakY, w * 0.15, neckY, colors.bearishLight, "Linke Schulter", addInteractive);
      drawPeak(ctx, w * 0.4, headPeakY, w * 0.2, neckY, colors.bearish, "Kopf", addInteractive);
      drawPeak(ctx, w * 0.6, shoulderPeakY * 1.1, w * 0.15, neckY, colors.bearishLight, "Rechte Schulter (Ansatz)", addInteractive);

      ctx.beginPath();
      ctx.moveTo(w * 0.6 + (w * 0.15) / 2, neckY);
      ctx.lineTo(w * 0.65, neckY + h * 0.05);
      ctx.quadraticCurveTo(w * 0.7, neckY - h * 0.05, w * 0.75, shoulderPeakY * 0.9);
      ctx.lineTo(w * 0.85, headPeakY * 0.8);
      ctx.strokeStyle = colors.bullish;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      addTooltipToPath(addInteractive, ctx instanceof CanvasRenderingContext2D ? null : null, "Fehlausbruch & Bullische Umkehr"); // Note: Path2D logic handled slightly differently in helpers

      drawText(ctx, "Fehlausbruch!", w * 0.7, neckY + h * 0.1, colors.bullish);
      drawArrow(ctx, w * 0.8, headPeakY, w * 0.8, headPeakY - h * 0.15, colors.bullish, 2, "Starke bullische Bewegung", addInteractive);
    }
  },
  {
    id: "headAndShouldersBottomFailure",
    name: "iSKS-Boden Fehlausbruch",
    category: "Umkehrmuster",
    description: "Ein iSKS-Boden Fehlausbruch tritt auf, wenn ein inverses SKS-Muster sich zu bilden beginnt, der Kurs aber die Nackenlinie nicht nachhaltig nach oben durchbricht und stattdessen wieder unter die rechte Schulter oder sogar den Kopf fällt. Dies kann ein starkes bärisches Signal sein.",
    characteristics: [
      "Ansatz eines iSKS-Musters (linke Schulter, Kopf, rechte Schulter).",
      "Der Kurs scheitert daran, die Nackenlinie signifikant nach oben zu durchbrechen.",
      "Stattdessen fällt der Kurs wieder ab, oft unter das Niveau der rechten Schulter oder des Kopfes.",
      "Signalisiert, dass die Käufer nicht stark genug waren, den Trend zu wenden."
    ],
    trading: "Ein Verkaufssignal entsteht, wenn der Kurs nach dem gescheiterten Bruch der Nackenlinie wieder Schwäche zeigt und unter wichtige Unterstützungsniveaus des unvollendeten iSKS-Musters fällt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position, wenn der Kurs unter die rechte Schulter oder den Kopf des gescheiterten iSKS-Musters fällt. SL: Oberhalb der Nackenlinie oder des Hochs der rechten Schulter. TP: Basierend auf vorherigen Unterstützungen oder Fibonacci-Projektionen des vorherigen Abwärtstrends.",
    advancedConsiderations: "Achten Sie auf das Volumen: Ein Fehlausbruch mit geringem Volumen beim Versuch, die Nackenlinie zu durchbrechen, und anschließendem Abfall mit höherem Volumen ist ein stärkeres Signal.",
    performanceStats: "Analog zum SKS-Top Fehlausbruch, nur in die entgegengesetzte Richtung.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const neckY = h * 0.4;
      const headTroughY = h * 0.8;
      const shoulderTroughY = h * 0.65;

      drawLine(ctx, w * 0.1, neckY, w * 0.7, neckY, colors.text, 2, "Nackenlinie (nicht gebrochen)", addInteractive);
      drawTrough(ctx, w * 0.2, shoulderTroughY, w * 0.15, neckY, colors.bullishLight, "Linke Schulter", addInteractive);
      drawTrough(ctx, w * 0.4, headTroughY, w * 0.2, neckY, colors.bullish, "Kopf", addInteractive);
      drawTrough(ctx, w * 0.6, shoulderTroughY * 0.9, w * 0.15, neckY, colors.bullishLight, "Rechte Schulter (Ansatz)", addInteractive);

      ctx.beginPath();
      ctx.moveTo(w * 0.6 + (w * 0.15) / 2, neckY);
      ctx.lineTo(w * 0.65, neckY - h * 0.05);
      ctx.quadraticCurveTo(w * 0.7, neckY + h * 0.05, w * 0.75, shoulderTroughY * 1.1);
      ctx.lineTo(w * 0.85, headTroughY * 1.2);
      ctx.strokeStyle = colors.bearish;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      drawText(ctx, "Fehlausbruch!", w * 0.7, neckY - h * 0.1, colors.bearish);
      drawArrow(ctx, w * 0.8, headTroughY * 1.1, w * 0.8, headTroughY * 1.1 + h * 0.1, colors.bearish, 2, "Starke bärische Bewegung", addInteractive);
    }
  },
  {
    id: "doubleTop",
    name: "Doppeltop",
    category: "Umkehrmuster",
    description: "Ein Doppeltop ist ein bärisches Umkehrmuster, das nach einem signifikanten Aufwärtstrend auftritt. Es besteht aus zwei etwa gleich hohen Hochs mit einem moderaten Tief dazwischen.",
    characteristics: [
      "Zwei aufeinanderfolgende Hochs auf ähnlichem Niveau.",
      "Ein Zwischentief (Unterstützungslinie) zwischen den Hochs.",
      "Volumen ist oft beim ersten Hoch höher als beim zweiten."
    ],
    trading: "Ein Verkaufssignal wird generiert, wenn der Kurs unter die Unterstützungslinie (das Zwischentief) fällt. Das Kursziel ist oft die Höhe des Musters (Distanz von den Hochs zur Unterstützungslinie), projiziert nach unten.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, wenn der Bruch der Unterstützungslinie mit Volumen bestätigt wird. Eine höhere Wahrscheinlichkeit besteht, wenn das zweite Hoch das erste nicht übersteigt und ggf. bärische Divergenzen bei Indikatoren auftreten.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Bruch der Unterstützungslinie. SL: Knapp über der Unterstützungslinie (die nun Widerstand ist) oder über den Hochs. TP: Höhe des Musters vom Ausbruchspunkt nach unten projiziert.",
    advancedConsiderations: "<strong>Fehlausbrüche:</strong> Ein Fehlausbruch unter die Unterstützungslinie, der schnell wieder darüber schließt, kann eine Falle sein. Ein Ausbruch über die Hochs negiert das Muster.<br><strong>Variationen:</strong> Die Hochs müssen nicht exakt gleich sein; leichte Abweichungen sind normal. Das Zwischentief kann unterschiedlich tief sein.<br><strong>Kontext:</strong> Stärker nach einem langen Aufwärtstrend. Bärische Divergenzen (z.B. im RSI) zwischen den beiden Hochs erhöhen die Aussagekraft.<br><strong>Kombinationen:</strong> Kann Teil einer größeren Verteilungsphase sein.",
    performanceStats: "Gilt als zuverlässiges Umkehrmuster. Die Erfolgsrate kann durch Bestätigungssignale wie Volumen oder Divergenzen verbessert werden.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const supportY = h * 0.7;
      const peakY = h * 0.3;
      drawLine(ctx, w * 0.1, supportY, w * 0.9, supportY, colors.text, 2, "Unterstützungslinie", addInteractive);
      drawPatternSeries(ctx, [
        { x: w * 0.3, y: peakY, width: w * 0.2, label: "Hoch 1", tooltip: "Erstes Hoch", color: colors.bearishLight, labelY: peakY - 10 },
        { x: w * 0.7, y: peakY, width: w * 0.2, label: "Hoch 2", tooltip: "Zweites Hoch", color: colors.bearishLight, labelY: peakY - 10 }
      ], supportY, (ctx, x, y, width, baseY, color, tooltip, addInteractive) => drawPeak(ctx, x, y, width, baseY, color, tooltip, addInteractive), addInteractive, colors.highlight);
      drawText(ctx, "Unterstützung", w * 0.5, supportY + 20, colors.text);
      drawArrow(ctx, w * 0.6, supportY, w * 0.6, supportY + h * 0.2, colors.bearish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.6, supportY + h * 0.2 + 20, colors.bearish);
      }
    },
  {
    id: "doubleBottom",
    name: "Doppelboden",
    category: "Umkehrmuster",
    description: "Ein Doppelboden ist ein bullisches Umkehrmuster, das nach einem signifikanten Abwärtstrend auftritt. Es besteht aus zwei etwa gleich tiefen Tiefs mit einem moderaten Hoch dazwischen.",
    characteristics: [
      "Zwei aufeinanderfolgende Tiefs auf ähnlichem Niveau.",
      "Ein Zwischenhoch (Widerstandslinie) zwischen den Tiefs.",
      "Volumen kann beim zweiten Tief geringer sein und beim Ausbruch ansteigen."
    ],
    trading: "Ein Kaufsignal wird generiert, wenn der Kurs über die Widerstandslinie (das Zwischenhoch) steigt. Das Kursziel ist oft die Höhe des Musters (Distanz von den Tiefs zur Widerstandslinie), projiziert nach oben.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, wenn der Bruch der Widerstandslinie mit Volumen bestätigt wird. Eine höhere Wahrscheinlichkeit besteht, wenn das zweite Tief das erste nicht unterschreitet und ggf. bullische Divergenzen bei Indikatoren auftreten.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Bruch der Widerstandslinie. SL: Knapp unter der Widerstandslinie (die nun Unterstützung ist) oder unter den Tiefs. TP: Höhe des Musters vom Ausbruchspunkt nach oben projiziert.",
    advancedConsiderations: "<strong>Fehlausbrüche:</strong> Ein Fehlausbruch über die Widerstandslinie, der schnell wieder darunter schließt, kann eine Falle sein. Ein Bruch unter die Tiefs negiert das Muster.<br><strong>Variationen:</strong> Die Tiefs müssen nicht exakt gleich sein. Das Zwischenhoch kann unterschiedlich hoch sein.<br><strong>Kontext:</strong> Stärker nach einem langen Abwärtstrend. Bullische Divergenzen (z.B. im RSI) zwischen den beiden Tiefs erhöhen die Aussagekraft.<br><strong>Kombinationen:</strong> Kann Teil einer größeren Akkumulationsphase sein.",
    performanceStats: "Gilt als zuverlässiges Umkehrmuster. Analog zum Doppeltop, Bestätigungssignale sind wichtig.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const resistanceY = h * 0.3;
      const troughY = h * 0.7;
      drawLine(ctx, w * 0.1, resistanceY, w * 0.9, resistanceY, colors.text, 2, "Widerstandslinie", addInteractive);
      drawPatternSeries(ctx, [
        { x: w * 0.3, y: troughY, width: w * 0.2, label: "Tief 1", tooltip: "Erstes Tief", color: colors.bullishLight, labelY: troughY + 20 },
        { x: w * 0.7, y: troughY, width: w * 0.2, label: "Tief 2", tooltip: "Zweites Tief", color: colors.bullishLight, labelY: troughY + 20 }
      ], resistanceY, (ctx, x, y, width, baseY, color, tooltip, addInteractive) => drawTrough(ctx, x, y, width, baseY, color, tooltip, addInteractive), addInteractive, colors.highlight);
      drawText(ctx, "Widerstand", w * 0.5, resistanceY - 10, colors.text);
      drawArrow(ctx, w * 0.6, resistanceY, w * 0.6, resistanceY - h * 0.2, colors.bullish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.6, resistanceY - h * 0.2 - 15, colors.bullish);
      }
    },
  {
    id: "tripleTop",
    name: "Dreifachtop (Triple Top)",
    category: "Umkehrmuster",
    description: "Ein Dreifachtop ist ein bärisches Umkehrmuster, ähnlich dem Doppeltop, aber mit drei Hochs auf etwa gleichem Niveau. Es signalisiert eine stärkere Widerstandszone.",
    characteristics: [
      "Drei aufeinanderfolgende Hochs auf ähnlichem Niveau.",
      "Zwei Zwischentiefs (Unterstützungslinie) zwischen den Hochs.",
      "Volumen nimmt oft bei jedem folgenden Hoch ab."
    ],
    trading: "Ein Verkaufssignal wird generiert, wenn der Kurs unter die Unterstützungslinie (gebildet durch die Zwischentiefs) fällt. Das Kursziel ist oft die Höhe des Musters.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Hoch, da es eine stärkere Bestätigung des Widerstands darstellt als ein Doppeltop. Bestätigung durch Volumen beim Bruch ist wichtig.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Bruch der Unterstützungslinie. SL: Knapp über der Unterstützungslinie oder über den Hochs. TP: Höhe des Musters vom Ausbruchspunkt nach unten projiziert.",
    advancedConsiderations: "<strong>Kontext:</strong> Ein Triple Top nach einem sehr starken Aufwärtstrend hat eine höhere Aussagekraft. Achten Sie auf Divergenzen bei Indikatoren über die drei Hochs hinweg.",
    performanceStats: "Stärker als ein Doppeltop, da der Widerstand dreimal bestätigt wurde. Gute Erfolgsquote bei klarem Bruch.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const supportY = h * 0.7;
      const peakY = h * 0.3;
      drawLine(ctx, w * 0.1, supportY, w * 0.9, supportY, colors.text, 2, "Unterstützungslinie", addInteractive);
      drawPatternSeries(ctx, [
        { x: w * 0.2, y: peakY, width: w * 0.15, label: "H1", tooltip: "Hoch 1", color: colors.bearishLight, labelY: peakY - 10 },
        { x: w * 0.5, y: peakY, width: w * 0.15, label: "H2", tooltip: "Hoch 2", color: colors.bearishLight, labelY: peakY - 10 },
        { x: w * 0.8, y: peakY, width: w * 0.15, label: "H3", tooltip: "Hoch 3", color: colors.bearishLight, labelY: peakY - 10 }
      ], supportY, (ctx, x, y, width, baseY, color, tooltip, addInteractive) => drawPeak(ctx, x, y, width, baseY, color, tooltip, addInteractive), addInteractive, colors.highlight);
      drawText(ctx, "Unterstützung", w * 0.5, supportY + 20, colors.text);
      drawArrow(ctx, w * 0.7, supportY, w * 0.7, supportY + h * 0.2, colors.bearish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.7, supportY + h * 0.2 + 20, colors.bearish);
      }
    },
  {
    id: "tripleBottom",
    name: "Dreifachboden (Triple Bottom)",
    category: "Umkehrmuster",
    description: "Ein Dreifachboden ist ein bullisches Umkehrmuster, ähnlich dem Doppelboden, aber mit drei Tiefs auf etwa gleichem Niveau. Es signalisiert eine stärkere Unterstützungszone.",
    characteristics: [
      "Drei aufeinanderfolgende Tiefs auf ähnlichem Niveau.",
      "Zwei Zwischenhochs (Widerstandslinie) zwischen den Tiefs.",
      "Volumen kann beim dritten Tief geringer sein und beim Ausbruch ansteigen."
    ],
    trading: "Ein Kaufsignal wird generiert, wenn der Kurs über die Widerstandslinie (gebildet durch die Zwischenhochs) steigt. Das Kursziel ist oft die Höhe des Musters.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Hoch, da es eine stärkere Bestätigung der Unterstützung darstellt als ein Doppelboden. Bestätigung durch Volumen beim Bruch ist wichtig.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Bruch der Widerstandslinie. SL: Knapp unter der Widerstandslinie oder unter den Tiefs. TP: Höhe des Musters vom Ausbruchspunkt nach oben projiziert.",
    advancedConsiderations: "<strong>Kontext:</strong> Ein Triple Bottom nach einem sehr starken Abwärtstrend hat eine höhere Aussagekraft. Achten Sie auf Divergenzen bei Indikatoren über die drei Tiefs hinweg.",
    performanceStats: "Stärker als ein Doppelboden. Gute Erfolgsquote bei klarem Bruch.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const resistanceY = h * 0.3;
      const troughY = h * 0.7;
      drawLine(ctx, w * 0.1, resistanceY, w * 0.9, resistanceY, colors.text, 2, "Widerstandslinie", addInteractive);
      drawPatternSeries(ctx, [
        { x: w * 0.2, y: troughY, width: w * 0.15, label: "T1", tooltip: "Tief 1", color: colors.bullishLight, labelY: troughY + 20 },
        { x: w * 0.5, y: troughY, width: w * 0.15, label: "T2", tooltip: "Tief 2", color: colors.bullishLight, labelY: troughY + 20 },
        { x: w * 0.8, y: troughY, width: w * 0.15, label: "T3", tooltip: "Tief 3", color: colors.bullishLight, labelY: troughY + 20 }
      ], resistanceY, (ctx, x, y, width, baseY, color, tooltip, addInteractive) => drawTrough(ctx, x, y, width, baseY, color, tooltip, addInteractive), addInteractive, colors.highlight);
      drawText(ctx, "Widerstand", w * 0.5, resistanceY - 10, colors.text);
      drawArrow(ctx, w * 0.7, resistanceY, w * 0.7, resistanceY - h * 0.2, colors.bullish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.7, resistanceY - h * 0.2 - 15, colors.bullish);
      }
    },
  {
    id: "fallingWedge",
    name: "Fallender Keil (Falling Wedge)",
    category: "Umkehrmuster",
    description: "Ein fallender Keil ist typischerweise eine bullische Umkehrformation, kann aber auch als Fortsetzungsmuster in einem Aufwärtstrend auftreten. Er wird durch zwei konvergierende, abwärts geneigte Linien gebildet.",
    characteristics: [
      "Zwei abwärts geneigte Linien (Widerstand und Unterstützung), die konvergieren.",
      "Die obere Linie (Widerstand) fällt steiler als die untere Linie (Unterstützung).",
      "Volumen nimmt oft während der Bildung ab und steigt beim Ausbruch stark an."
    ],
    trading: "Ein Kaufsignal entsteht, wenn der Kurs über die obere Widerstandslinie ausbricht. Das Kursziel ist oft der breiteste Teil des Keils, projiziert vom Ausbruchspunkt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, besonders wenn der Ausbruch mit hohem Volumen erfolgt und der Keil sich nach einem Abwärtstrend bildet (Umkehr).<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Ausbruch über die obere Keillinie. SL: Unterhalb des Ausbruchspunktes oder unter dem letzten Tief innerhalb des Keils. TP: Höhe der Basis des Keils, projiziert vom Ausbruchspunkt nach oben.",
    advancedConsiderations: "<strong>Kontext und Interpretation (Dualität):</strong> Kann als Umkehr- oder Fortsetzungsmuster fungieren.",
    performanceStats: "Fallende Keile haben eine relativ hohe Erfolgsquote als bullische Muster, insbesondere wenn sie nach einem Abwärtstrend auftreten.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const startResistanceY = h * 0.2;
      const endResistanceY = h * 0.6;
      const startSupportY = h * 0.4;
      const endSupportY = h * 0.7;
      const startX = w * 0.1;
      const endX = w * 0.9;

      drawLineWithLabel(ctx, w, h, startX, startResistanceY, endX, endResistanceY, colors.text, 2, "Widerstand", addInteractive);
      drawLineWithLabel(ctx, w, h, startX, startSupportY, endX, endSupportY, colors.text, 2, "Unterstützung", addInteractive);

            drawPricePath(ctx, [
        { x: startX + w * 0.05, y: startResistanceY + h * 0.02 },
        { x: startX + w * 0.2, y: startSupportY + h * 0.05 },
        { x: startX + w * 0.35, y: ((startResistanceY + endResistanceY) / 2) * 0.9 },
        { x: startX + w * 0.5, y: ((startSupportY + endSupportY) / 2) * 1.05 },
        { x: startX + w * 0.65, y: endResistanceY * 0.95 }
      ], colors.neutral, 1.5);

      drawArrow(ctx, endX * 0.9, endResistanceY, endX * 0.9, endResistanceY - h * 0.2, colors.bullish, 2, "Bullischer Ausbruch", addInteractive);
      drawText(ctx, "Ausbruch", endX * 0.9, endResistanceY - h * 0.2 - 15, colors.bullish);
    }
  },
  {
    id: "risingWedge",
    name: "Steigender Keil (Rising Wedge)",
    category: "Umkehrmuster",
    description: "Ein steigender Keil ist typischerweise eine bärische Umkehrformation, kann aber auch als Fortsetzungsmuster in einem Abwärtstrend auftreten. Er wird durch zwei konvergierende, aufwärts geneigte Linien gebildet.",
    characteristics: [
      "Zwei aufwärts geneigte Linien (Widerstand und Unterstützung), die konvergieren.",
      "Die untere Linie (Unterstützung) steigt steiler als die obere Linie (Widerstand).",
      "Volumen nimmt oft während der Bildung ab und steigt beim Ausbruch."
    ],
    trading: "Ein Verkaufssignal entsteht, wenn der Kurs unter die untere Unterstützungslinie ausbricht. Das Kursziel ist oft der breiteste Teil des Keils, projiziert vom Ausbruchspunkt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, besonders wenn der Ausbruch mit hohem Volumen erfolgt und der Keil sich nach einem Aufwärtstrend bildet (Umkehr).<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Ausbruch unter die untere Keillinie. SL: Oberhalb des Ausbruchspunktes oder über dem letzten Hoch innerhalb des Keils. TP: Höhe der Basis des Keils, projiziert vom Ausbruchspunkt nach unten.",
    advancedConsiderations: "<strong>Kontext und Interpretation (Dualität):</strong> Kann als Umkehr- oder Fortsetzungsmuster fungieren. Bärische Divergenzen bei Oszillatoren erhöhen die Wahrscheinlichkeit.",
    performanceStats: "Steigende Keile haben eine relativ hohe Erfolgsquote als bärische Muster.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const startSupportY = h * 0.8;
      const endSupportY = h * 0.4;
      const startResistanceY = h * 0.6;
      const endResistanceY = h * 0.3;
      const startX = w * 0.1;
      const endX = w * 0.9;

      drawLineWithLabel(ctx, w, h, startX, startSupportY, endX, endSupportY, colors.text, 2, "Unterstützung", addInteractive);
      drawLineWithLabel(ctx, w, h, startX, startResistanceY, endX, endResistanceY, colors.text, 2, "Widerstand", addInteractive);

            drawPricePath(ctx, [
        { x: startX + w * 0.05, y: startSupportY - h * 0.02 },
        { x: startX + w * 0.2, y: startResistanceY - h * 0.05 },
        { x: startX + w * 0.35, y: ((startSupportY + endSupportY) / 2) * 1.1 },
        { x: startX + w * 0.5, y: ((startResistanceY + endResistanceY) / 2) * 0.95 },
        { x: startX + w * 0.65, y: endSupportY * 1.05 }
      ], colors.bearishLight, 1.5);

      drawArrow(ctx, endX * 0.9, endSupportY, endX * 0.9, endSupportY + h * 0.2, colors.bearish, 2, "Bärischer Ausbruch", addInteractive);
      drawText(ctx, "Ausbruch", endX * 0.9, endSupportY + h * 0.2 + 15, colors.bearish);
    }
  },
  {
    id: "diamondTop",
    name: "Diamant Top (Diamond Top)",
    category: "Umkehrmuster",
    description: "Ein Diamant Top ist eine seltene, aber zuverlässige bärische Umkehrformation, die nach einem Aufwärtstrend auftritt. Sie ähnelt einer Kombination aus Broadening Top und Symmetrischem Dreieck.",
    characteristics: [
      "Tritt nach einem signifikanten Aufwärtstrend auf.",
      "Beginnt mit auseinanderlaufenden Hochs und Tiefs (Broadening Phase).",
      "Gefolgt von zusammenlaufenden Hochs und Tiefs (Triangle Phase).",
      "Die vier Hauptpunkte bilden eine Diamantform."
    ],
    trading: "Ein Verkaufssignal entsteht, wenn der Kurs die untere rechte Trendlinie des Diamanten nach unten durchbricht. Das Kursziel wird oft durch Messen der größten vertikalen Distanz innerhalb des Diamanten und Projizieren nach unten vom Ausbruchspunkt bestimmt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel. Diamantformationen sind seltener und können komplexer zu identifizieren sein.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Bruch der unteren rechten Trendlinie. SL: Über dem letzten Hoch innerhalb des Diamanten. TP: Höhe des Diamanten vom Ausbruchspunkt nach unten projiziert.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const midX = w / 2;
      const midY = h / 2;
      const diamondWidth = w * 0.6;
      const diamondHeight = h * 0.5;

      const p1x = midX - diamondWidth / 2;
      const p1y = midY;
      const p2x = midX;
      const p2y = midY - diamondHeight / 2;
      const p3x = midX + diamondWidth / 2;
      const p3y = midY;
      const p4x = midX;
      const p4y = midY + diamondHeight / 2;

      drawLineWithLabel(ctx, w, h, p1x, p1y, p2x, p2y, colors.text, 2, "Obere linke Seite", addInteractive);
      drawLineWithLabel(ctx, w, h, p2x, p2y, p3x, p3y, colors.text, 2, "Obere rechte Seite", addInteractive);
      drawLineWithLabel(ctx, w, h, p3x, p3y, p4x, p4y, colors.text, 2, "Untere rechte Seite", addInteractive);
      drawLineWithLabel(ctx, w, h, p4x, p4y, p1x, p1y, colors.text, 2, "Untere linke Seite", addInteractive);

      ctx.beginPath();
      ctx.moveTo(p1x + 10, p1y);
      ctx.lineTo(midX - diamondWidth * 0.1, p2y + diamondHeight * 0.1);
      ctx.lineTo(midX + diamondWidth * 0.1, p4y - diamondHeight * 0.1);
      ctx.lineTo(p3x - 10, p3y);
      ctx.lineTo(midX, p2y + diamondHeight * 0.3);
      ctx.lineTo(midX, p4y - diamondHeight * 0.3);
      ctx.strokeStyle = colors.bearishLight;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      drawArrow(ctx, p3x - w * 0.05, p3y + h * 0.05, p3x - w * 0.05, p3y + h * 0.25, colors.bearish, 2, "Bärischer Ausbruch", addInteractive);
      drawText(ctx, "Ausbruch", p3x - w * 0.05, p3y + h * 0.25 + 15, colors.bearish);
    }
  },
  {
    id: "diamondBottom",
    name: "Diamant Bottom (Diamond Bottom)",
    category: "Umkehrmuster",
    description: "Ein Diamant Bottom ist eine seltene, aber zuverlässige bullische Umkehrformation, die nach einem Abwärtstrend auftritt. Sie ist das Spiegelbild des Diamant Top.",
    characteristics: [
      "Tritt nach einem signifikanten Abwärtstrend auf.",
      "Beginnt mit auseinanderlaufenden Tiefs und Hochs (Broadening Phase).",
      "Gefolgt von zusammenlaufenden Tiefs und Hochs (Triangle Phase).",
      "Die vier Hauptpunkte bilden eine Diamantform."
    ],
    trading: "Ein Kaufsignal entsteht, wenn der Kurs die obere rechte Trendlinie des Diamanten nach oben durchbricht. Das Kursziel wird oft durch Messen der größten vertikalen Distanz innerhalb des Diamanten und Projizieren nach oben vom Ausbruchspunkt bestimmt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Bruch der oberen rechten Trendlinie. SL: Unter dem letzten Tief innerhalb des Diamanten. TP: Höhe des Diamanten vom Ausbruchspunkt nach oben projiziert.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const midX = w / 2;
      const midY = h / 2;
      const diamondWidth = w * 0.6;
      const diamondHeight = h * 0.5;

      const p1x = midX - diamondWidth / 2;
      const p1y = midY;
      const p2x = midX;
      const p2y = midY + diamondHeight / 2;
      const p3x = midX + diamondWidth / 2;
      const p3y = midY;
      const p4x = midX;
      const p4y = midY - diamondHeight / 2;

      drawLineWithLabel(ctx, w, h, p1x, p1y, p2x, p2y, colors.text, 2, "Untere linke Seite", addInteractive);
      drawLineWithLabel(ctx, w, h, p2x, p2y, p3x, p3y, colors.text, 2, "Untere rechte Seite", addInteractive);
      drawLineWithLabel(ctx, w, h, p3x, p3y, p4x, p4y, colors.text, 2, "Obere rechte Seite", addInteractive);
      drawLineWithLabel(ctx, w, h, p4x, p4y, p1x, p1y, colors.text, 2, "Obere linke Seite", addInteractive);

      ctx.beginPath();
      ctx.moveTo(p1x + 10, p1y);
      ctx.lineTo(midX - diamondWidth * 0.1, p2y - diamondHeight * 0.1);
      ctx.lineTo(midX + diamondWidth * 0.1, p4y + diamondHeight * 0.1);
      ctx.lineTo(p3x - 10, p3y);
      ctx.lineTo(midX, p2y - diamondHeight * 0.3);
      ctx.lineTo(midX, p4y + diamondHeight * 0.3);
      ctx.strokeStyle = colors.neutral;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      drawArrow(ctx, p3x - w * 0.05, p3y - h * 0.05, p3x - w * 0.05, p3y - h * 0.25, colors.bullish, 2, "Bullischer Ausbruch", addInteractive);
      drawText(ctx, "Ausbruch", p3x - w * 0.05, p3y - h * 0.25 - 15, colors.bullish);
    }
  },
  {
    id: "roundingTop",
    name: "Abgerundetes Top (Rounding Top)",
    category: "Umkehrmuster",
    description: "Ein abgerundetes Top ist eine bärische Umkehrformation, die einen allmählichen Übergang von einem Aufwärtstrend zu einem Abwärtstrend darstellt. Es hat eine umgekehrte U-Form.",
    characteristics: [
      "Allmähliche, abgerundete Spitze.",
      "Volumen nimmt oft während der Bildung des Tops ab und kann beim Durchbruch der Unterstützungslinie (falls vorhanden) ansteigen.",
      "Signalisiert eine nachlassende Kaufkraft und zunehmende Verkaufsbereitschaft."
    ],
    trading: "Ein Verkaufssignal kann entstehen, wenn der Kurs eine signifikante Unterstützungslinie unterhalb des Tops durchbricht oder wenn der Abwärtstrend nach der Rundung bestätigt wird.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel. Das Muster entwickelt sich langsam. Bestätigung des Abwärtstrends ist entscheidend.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Bruch einer Unterstützungslinie. SL: Über dem höchsten Punkt des Tops. TP: Kann basierend auf der Höhe des Tops projiziert werden.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const topY = h * 0.2;
      const bottomY = h * 0.7;
      const controlX1 = w * 0.2;
      const controlY1 = topY;
      const controlX2 = w * 0.8;
      const controlY2 = topY;

      ctx.beginPath();
      ctx.moveTo(w * 0.1, bottomY * 0.8);
      ctx.bezierCurveTo(controlX1, controlY1, controlX2, controlY2, w * 0.9, bottomY * 0.8);
      ctx.strokeStyle = colors.bearishLight;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      drawText(ctx, "Allmähliche Umkehr", w / 2, topY + h * 0.1, colors.highlight);
      const supportLineY = bottomY * 0.8 + h * 0.05;
      drawLine(ctx, w * 0.05, supportLineY, w * 0.95, supportLineY, "#e0e0e0", 1, "Mögliche Unterstützung", addInteractive);
      drawArrow(ctx, w * 0.8, supportLineY, w * 0.8, supportLineY + h * 0.15, colors.bearish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.8, supportLineY + h * 0.15 + 15, colors.bearish);
    }
  },
  {
    id: "roundingBottom",
    name: "Abgerundeter Boden (Rounding Bottom)",
    category: "Umkehrmuster",
    description: "Ein abgerundeter Boden (auch Saucer Bottom) ist eine bullische Umkehrformation, die einen allmählichen Übergang von einem Abwärtstrend zu einem Aufwärtstrend darstellt. Es hat eine U-Form.",
    characteristics: [
      "Allmählicher, abgerundeter Boden.",
      "Volumen nimmt oft während der Bildung des Bodens ab und steigt bei Beginn des Aufwärtstrends an.",
      "Signalisiert eine nachlassende Verkaufsbereitschaft und zunehmende Kaufkraft."
    ],
    trading: "Ein Kaufsignal kann entstehen, wenn der Kurs eine signifikante Widerstandslinie oberhalb des Bodens durchbricht oder wenn der Aufwärtstrend nach der Rundung bestätigt wird.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Bruch einer Widerstandslinie. SL: Unter dem tiefsten Punkt des Bodens. TP: Höhe des Bodens nach oben projiziert.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const bottomY = h * 0.8;
      const topY = h * 0.3;
      const controlX1 = w * 0.2;
      const controlY1 = bottomY;
      const controlX2 = w * 0.8;
      const controlY2 = bottomY;

      ctx.beginPath();
      ctx.moveTo(w * 0.1, topY / 0.8);
      ctx.bezierCurveTo(controlX1, controlY1, controlX2, controlY2, w * 0.9, topY / 0.8);
      ctx.strokeStyle = colors.neutral;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      drawText(ctx, "Allmähliche Umkehr", w / 2, bottomY - h * 0.1, colors.highlight);
      const resistanceLineY = topY / 0.8 - h * 0.05;
      drawLine(ctx, w * 0.05, resistanceLineY, w * 0.95, resistanceLineY, "#e0e0e0", 1, "Möglicher Widerstand", addInteractive);
      drawArrow(ctx, w * 0.8, resistanceLineY, w * 0.8, resistanceLineY - h * 0.15, colors.bullish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.8, resistanceLineY - h * 0.15 - 15, colors.bullish);
    }
  },
  {
    id: "broadeningTop",
    name: "Megafon Top (Broadening Top)",
    category: "Umkehrmuster",
    description: "Ein Broadening Top (auch Megafon Top) ist eine bärische Umkehrformation, die durch zunehmende Volatilität gekennzeichnet ist. Es besteht aus drei ansteigenden Hochs und zwei fallenden Tiefs, wobei die Trendlinien auseinanderlaufen.",
    characteristics: [
      "Zwei auseinanderlaufende Trendlinien: obere steigt, untere fällt.",
      "Mindestens drei höhere Hochs und zwei tiefere Tiefs.",
      "Signalisiert zunehmende Unsicherheit und Volatilität, oft am Ende eines Aufwärtstrends."
    ],
    trading: "Ein Verkaufssignal kann entstehen, wenn der Kurs nach dem dritten Hoch unter die untere Trendlinie fällt. Aufgrund der hohen Volatilität schwer zu handeln.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Bruch der unteren Trendlinie. SL: Über dem dritten Hoch. TP: Die Höhe der Formation vom Ausbruchspunkt nach unten projiziert.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const upperStartX = w * 0.1, upperStartY = h * 0.4;
      const upperEndX = w * 0.9, upperEndY = h * 0.1;
      const lowerStartX = w * 0.15, lowerStartY = h * 0.6;
      const lowerEndX = w * 0.85, lowerEndY = h * 0.9;

      drawLineWithLabel(ctx, w, h, upperStartX, upperStartY, upperEndX, upperEndY, colors.text, 2, "Steigender Widerstand", addInteractive);
      drawLineWithLabel(ctx, w, h, lowerStartX, lowerStartY, lowerEndX, lowerEndY, colors.text, 2, "Fallende Unterstützung", addInteractive);

      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.55);
      ctx.lineTo(w * 0.3, h * 0.35);
      ctx.lineTo(w * 0.4, h * 0.65);
      ctx.lineTo(w * 0.55, h * 0.25);
      ctx.lineTo(w * 0.65, h * 0.75);
      ctx.lineTo(w * 0.8, h * 0.15);
      ctx.strokeStyle = colors.bearishLight;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      drawArrow(ctx, w * 0.7, lowerEndY * 0.95, w * 0.7, lowerEndY + h * 0.05, colors.bearish, 2, "Bärischer Ausbruch", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.7, lowerEndY + h * 0.05 + 15, colors.bearish);
    }
  },
  {
    id: "broadeningBottom",
    name: "Megafon Bottom (Broadening Bottom)",
    category: "Umkehrmuster",
    description: "Ein Broadening Bottom (auch Megafon Bottom) ist eine bullische Umkehrformation, die durch zunehmende Volatilität gekennzeichnet ist. Es besteht aus drei fallenden Tiefs und zwei steigenden Hochs.",
    characteristics: [
      "Zwei auseinanderlaufende Trendlinien: obere steigt, untere fällt.",
      "Mindestens drei tiefere Tiefs und zwei höhere Hochs.",
      "Signalisiert zunehmende Unsicherheit und Volatilität, oft am Ende eines Abwärtstrends."
    ],
    trading: "Ein Kaufsignal kann entstehen, wenn der Kurs nach dem dritten Tief über die obere Trendlinie steigt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Bruch der oberen Trendlinie. SL: Unter dem dritten Tief. TP: Die Höhe der Formation vom Ausbruchspunkt nach oben projiziert.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const upperStartX = w * 0.15, upperStartY = h * 0.4;
      const upperEndX = w * 0.85, upperEndY = h * 0.1;
      const lowerStartX = w * 0.1, lowerStartY = h * 0.6;
      const lowerEndX = w * 0.9, lowerEndY = h * 0.9;

      drawLineWithLabel(ctx, w, h, upperStartX, upperStartY, upperEndX, upperEndY, colors.text, 2, "Steigender Widerstand", addInteractive);
      drawLineWithLabel(ctx, w, h, lowerStartX, lowerStartY, lowerEndX, lowerEndY, colors.text, 2, "Fallende Unterstützung", addInteractive);

      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.45);
      ctx.lineTo(w * 0.3, h * 0.65);
      ctx.lineTo(w * 0.4, h * 0.35);
      ctx.lineTo(w * 0.55, h * 0.75);
      ctx.lineTo(w * 0.65, h * 0.25);
      ctx.lineTo(w * 0.8, h * 0.85);
      ctx.strokeStyle = colors.neutral;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      drawArrow(ctx, w * 0.7, upperEndY * 1.1, w * 0.7, upperEndY - h * 0.05, colors.bullish, 2, "Bullischer Ausbruch", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.7, upperEndY - h * 0.05 - 15, colors.bullish);
    }
  },
  {
    id: "islandReversal",
    name: "Umkehrinsel (Island Reversal)",
    category: "Umkehrmuster",
    description: "Eine Umkehrinsel ist eine starke Umkehrformation, die durch eine Kurslücke (Gap), eine Konsolidierungsphase und eine weitere Kurslücke in die entgegengesetzte Richtung gekennzeichnet ist.",
    characteristics: [
      "Ein Gap in Trendrichtung.",
      'Eine Periode der Konsolidierung (die "Insel").',
      "Ein Gap in die entgegengesetzte Richtung, das die Insel isoliert.",
      "Signalisiert eine scharfe und oft emotionale Umkehr."
    ],
    trading: "Ein bärisches Island Reversal (Top) entsteht nach einem Aufwärtstrend, ein bullisches Island Reversal (Bottom) nach einem Abwärtstrend.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Hoch, wenn beide Gaps klar definiert sind.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Nach dem zweiten Gap in die neue Richtung. SL: Auf der anderen Seite der Insel. TP: Oft signifikant.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      // Bullisches Island Reversal
      const islandWidth = w * 0.2;
      const islandHeight = h * 0.15;
      const islandY = h * 0.65;
      const islandStartX = w * 0.4;

      drawLine(ctx, w * 0.1, h * 0.2, islandStartX - w * 0.05, islandY + islandHeight + h * 0.05, colors.bearishLight, 2, "Vorheriger Trend", addInteractive);
      drawText(ctx, "Gap 1", islandStartX - w * 0.025, islandY + islandHeight + h * 0.02, colors.highlight, "10px");

      ctx.beginPath();
      ctx.rect(islandStartX, islandY, islandWidth, islandHeight);
      ctx.fillStyle = colors.grid;
      ctx.fill();
      ctx.strokeStyle = colors.bullishLight;
      ctx.stroke();
      addTooltipToPath(addInteractive, ctx instanceof CanvasRenderingContext2D ? null : null, "Insel-Konsolidierung");
      drawText(ctx, "Insel", islandStartX + islandWidth / 2, islandY + islandHeight / 2, colors.bullishLight);

      drawText(ctx, "Gap 2", islandStartX + islandWidth + w * 0.025, islandY - h * 0.02, colors.highlight, "10px");
      drawLine(ctx, islandStartX + islandWidth + w * 0.05, islandY - h * 0.05, w * 0.9, h * 0.2, colors.bullish, 2, "Neuer Trend", addInteractive);
      drawArrow(ctx, islandStartX + islandWidth + w * 0.05, islandY - h * 0.05, islandStartX + islandWidth + w * 0.05, islandY - h * 0.2, colors.bullish, 2, "Bullische Umkehr", addInteractive);
    }
  },
  {
    id: "pipeBottom",
    name: "Pfeifenboden (Pipe Bottom)",
    category: "Umkehrmuster",
    description: "Ein Pfeifenboden ist eine bullische Umkehrformation, die durch zwei lange, parallele oder leicht konvergierende Abwärtskerzen mit tiefen Tiefs gekennzeichnet ist, gefolgt von einer starken Aufwärtsbewegung.",
    characteristics: [
      "Tritt nach einem Abwärtstrend auf.",
      "Zwei lange bärische Kerzen (Pfeifen) mit ähnlichen oder tieferen Tiefs.",
      "Signalisiert eine Kapitulation der Verkäufer, gefolgt von starkem Kaufinteresse."
    ],
    trading: "Ein Kaufsignal entsteht, wenn der Kurs nach den beiden Pfeifen deutlich ansteigt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position, wenn der Kurs nach den Pfeifen eine starke bullische Kerze bildet. SL: Unter den Tiefs der Pfeifen.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const pipeWidth = w * 0.08;
      const pipeBodyHeight = h * 0.3;
      const pipeShadowHeight = h * 0.1;
      const pipe1X = w * 0.35;
      const pipe2X = w * 0.5;
      const trendStartY = h * 0.2;
      const pipeTopY = h * 0.4;

      drawLine(ctx, w * 0.1, trendStartY, pipe1X - pipeWidth, pipeTopY * 0.9, colors.bearishLight, 2, "Vorheriger Trend", addInteractive);

      ctx.fillStyle = colors.bearish;
      ctx.fillRect(pipe1X, pipeTopY, pipeWidth, pipeBodyHeight);
      drawLine(ctx, pipe1X + pipeWidth / 2, pipeTopY + pipeBodyHeight, pipe1X + pipeWidth / 2, pipeTopY + pipeBodyHeight + pipeShadowHeight, colors.bearish, 2, "Pfeife 1 Tief", addInteractive);

      ctx.fillRect(pipe2X, pipeTopY + h * 0.02, pipeWidth, pipeBodyHeight);
      drawLine(ctx, pipe2X + pipeWidth / 2, pipeTopY + h * 0.02 + pipeBodyHeight, pipe2X + pipeWidth / 2, pipeTopY + h * 0.02 + pipeBodyHeight + pipeShadowHeight, colors.bearish, 2, "Pfeife 2 Tief", addInteractive);

      drawText(ctx, "Pfeifen", (pipe1X + pipe2X + pipeWidth) / 2, pipeTopY - 15, colors.highlight);

      const reversalStartX = pipe2X + pipeWidth * 1.5;
      const reversalStartY = pipeTopY + pipeBodyHeight / 2;
      drawArrow(ctx, reversalStartX, reversalStartY, reversalStartX + w * 0.15, reversalStartY - h * 0.3, colors.bullish, 3, "Bullische Umkehr", addInteractive);
      drawText(ctx, "Starke Umkehr", reversalStartX + w * 0.07, reversalStartY - h * 0.3 - 15, colors.bullish);
    }
  },
  {
    id: "pipeTop",
    name: "Pfeifenspitze (Pipe Top)",
    category: "Umkehrmuster",
    description: "Eine Pfeifenspitze ist eine bärische Umkehrformation, das Spiegelbild des Pfeifenbodens. Sie wird durch zwei lange Aufwärtskerzen mit hohen Hochs gekennzeichnet.",
    characteristics: [
      "Tritt nach einem Aufwärtstrend auf.",
      "Zwei lange bullische Kerzen (Pfeifen) mit ähnlichen oder höheren Hochs.",
      "Signalisiert eine Erschöpfung der Käufer."
    ],
    trading: "Ein Verkaufssignal entsteht, wenn der Kurs nach den beiden Pfeifen deutlich fällt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach Bestätigung der Umkehr. SL: Über den Hochs der Pfeifen.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const pipeWidth = w * 0.08;
      const pipeBodyHeight = h * 0.3;
      const pipeShadowHeight = h * 0.1;
      const pipe1X = w * 0.35;
      const pipe2X = w * 0.5;
      const trendStartY = h * 0.8;
      const pipeBottomY = h * 0.3;

      drawLine(ctx, w * 0.1, trendStartY, pipe1X - pipeWidth, pipeBottomY + pipeBodyHeight * 1.1, colors.bullish, 2, "Vorheriger Trend", addInteractive);

      ctx.fillStyle = colors.bullish;
      ctx.fillRect(pipe1X, pipeBottomY, pipeWidth, pipeBodyHeight);
      drawLine(ctx, pipe1X + pipeWidth / 2, pipeBottomY, pipe1X + pipeWidth / 2, pipeBottomY - pipeShadowHeight, colors.bullish, 2, "Pfeife 1 Hoch", addInteractive);

      ctx.fillRect(pipe2X, pipeBottomY - h * 0.02, pipeWidth, pipeBodyHeight);
      drawLine(ctx, pipe2X + pipeWidth / 2, pipeBottomY - h * 0.02, pipe2X + pipeWidth / 2, pipeBottomY - h * 0.02 - pipeShadowHeight, colors.bullish, 2, "Pfeife 2 Hoch", addInteractive);

      drawText(ctx, "Pfeifen", (pipe1X + pipe2X + pipeWidth) / 2, pipeBottomY + pipeBodyHeight + 15, colors.highlight);

      const reversalStartX = pipe2X + pipeWidth * 1.5;
      const reversalStartY = pipeBottomY + pipeBodyHeight / 2;
      drawArrow(ctx, reversalStartX, reversalStartY, reversalStartX + w * 0.15, reversalStartY + h * 0.3, colors.bearish, 3, "Bärische Umkehr", addInteractive);
      drawText(ctx, "Starke Umkehr", reversalStartX + w * 0.07, reversalStartY + h * 0.3 + 15, colors.bearish);
    }
  },
  {
    id: "bumpAndRunReversalTop",
    name: "Bump and Run Reversal Top",
    category: "Umkehrmuster",
    description: "Eine bärische Umkehrformation. Sie beginnt mit einem moderaten Aufwärtstrend (Lead-in), gefolgt von einem steilen, exzessiven Anstieg (Bump), der die ursprüngliche Trendlinie durchbricht.",
    characteristics: [
      "Lead-in Phase: Moderater Aufwärtstrend.",
      "Bump Phase: Übermäßig steiler Anstieg.",
      "Run Phase: Nach dem Scheitern des Bumps fällt der Kurs unter die Lead-in Trendlinie."
    ],
    trading: "Verkaufssignal beim Bruch der Lead-in Trendlinie.<br><br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short nach dem Bruch der Lead-in-Trendlinie. SL: Über dem Hoch des Bumps.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const leadInStartX = w * 0.1, leadInStartY = h * 0.8;
      const leadInEndX = w * 0.5, leadInEndY = h * 0.5;
      drawLineWithLabel(ctx, w, h, leadInStartX, leadInStartY, leadInEndX, leadInEndY, colors.text, 2, "Lead-in Trend", addInteractive);

      const bumpStartX = leadInEndX - w * 0.05, bumpStartY = leadInEndY - h * 0.05;
      const bumpPeakX = w * 0.65, bumpPeakY = h * 0.15;
      const bumpEndX = w * 0.75, bumpEndY = h * 0.6;

      ctx.beginPath();
      ctx.moveTo(bumpStartX, bumpStartY);
      ctx.quadraticCurveTo(bumpPeakX - w * 0.05, bumpPeakY * 0.8, bumpPeakX, bumpPeakY);
      ctx.quadraticCurveTo(bumpPeakX + w * 0.05, bumpPeakY * 1.2, bumpEndX, bumpEndY);
      ctx.strokeStyle = colors.bearishLight;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawText(ctx, "Bump", bumpPeakX, bumpPeakY - 15, colors.bearishLight);

      drawArrow(ctx, bumpEndX, bumpEndY, bumpEndX + w * 0.1, bumpEndY + h * 0.2, colors.bearish, 2, "Run Phase", addInteractive);
      drawText(ctx, "Run", bumpEndX + w * 0.05, bumpEndY + h * 0.2 + 15, colors.bearish);
    }
  },
  {
    id: "bumpAndRunReversalBottom",
    name: "Bump and Run Reversal Bottom",
    category: "Umkehrmuster",
    description: "Eine bullische Umkehrformation. Sie beginnt mit einem moderaten Abwärtstrend, gefolgt von einem steilen Abfall (Bump).",
    characteristics: [
      "Lead-in Phase: Moderater Abwärtstrend.",
      "Bump Phase: Übermäßig steiler Abfall.",
      "Run Phase: Nach dem Scheitern des Bumps steigt der Kurs über die Lead-in Trendlinie."
    ],
    trading: "Kaufsignal beim Bruch der Lead-in Trendlinie nach oben.<br><br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long nach dem Bruch der Lead-in-Trendlinie. SL: Unter dem Tief des Bumps.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const leadInStartX = w * 0.1, leadInStartY = h * 0.2;
      const leadInEndX = w * 0.5, leadInEndY = h * 0.5;
      drawLineWithLabel(ctx, w, h, leadInStartX, leadInStartY, leadInEndX, leadInEndY, colors.text, 2, "Lead-in Trend", addInteractive);

      const bumpStartX = leadInEndX - w * 0.05, bumpStartY = leadInEndY + h * 0.05;
      const bumpTroughX = w * 0.65, bumpTroughY = h * 0.85;
      const bumpEndX = w * 0.75, bumpEndY = h * 0.4;

      ctx.beginPath();
      ctx.moveTo(bumpStartX, bumpStartY);
      ctx.quadraticCurveTo(bumpTroughX - w * 0.05, bumpTroughY * 1.2, bumpTroughX, bumpTroughY);
      ctx.quadraticCurveTo(bumpTroughX + w * 0.05, bumpTroughY * 0.8, bumpEndX, bumpEndY);
      ctx.strokeStyle = colors.neutral;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawText(ctx, "Bump", bumpTroughX, bumpTroughY + 15, colors.neutral);

      drawArrow(ctx, bumpEndX, bumpEndY, bumpEndX + w * 0.1, bumpEndY - h * 0.2, colors.bullish, 2, "Run Phase", addInteractive);
      drawText(ctx, "Run", bumpEndX + w * 0.05, bumpEndY - h * 0.2 - 15, colors.bullish);
    }
  },
  {
    id: "spikeTop",
    name: "Spike Top",
    category: "Umkehrmuster",
    description: "Ein Spike Top (V-Top) ist eine scharfe, schnelle Umkehrformation ohne signifikante Konsolidierung.",
    characteristics: [
      "Sehr schneller, fast senkrechter Anstieg.",
      "Scharfe Spitze.",
      "Sehr schneller Abfall."
    ],
    trading: "Schwer zu handeln. Bestätigung abwarten. Oft Zeichen von Übertreibung.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const startX = w * 0.2, startY = h * 0.8;
      const peakX = w * 0.5, peakY = h * 0.1;
      const endX = w * 0.8, endY = h * 0.8;

      drawLineWithLabel(ctx, w, h, startX, startY, peakX, peakY, colors.bearishLight, 2.5, "Steiler Anstieg", addInteractive);
      drawLineWithLabel(ctx, w, h, peakX, peakY, endX, endY, colors.bearish, 2.5, "Steiler Abfall", addInteractive);
      drawText(ctx, "Spike / V-Top", peakX, peakY - 15, colors.highlight);
    }
  },
  {
    id: "spikeBottom",
    name: "Spike Bottom",
    category: "Umkehrmuster",
    description: "Ein Spike Bottom (V-Bottom) ist eine scharfe, schnelle bullische Umkehrformation.",
    characteristics: [
      "Sehr schneller, fast senkrechter Abfall.",
      "Scharfes Tief.",
      "Sehr schneller Anstieg."
    ],
    trading: "Schwer zu handeln. Bestätigung abwarten.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const startX = w * 0.2, startY = h * 0.2;
      const troughX = w * 0.5, troughY = h * 0.9;
      const endX = w * 0.8, endY = h * 0.2;

      drawLineWithLabel(ctx, w, h, startX, startY, troughX, troughY, colors.neutral, 2.5, "Steiler Abfall", addInteractive);
      drawLineWithLabel(ctx, w, h, troughX, troughY, endX, endY, colors.bullish, 2.5, "Steiler Anstieg", addInteractive);
      drawText(ctx, "Spike / V-Bottom", troughX, troughY + 15, colors.highlight);
    }
  },
  {
    id: "threeDrivesTop",
    name: "Three Drives to a Top",
    category: "Umkehrmuster",
    description: "Eine bärische Umkehrformation mit drei symmetrischen Hochs.",
    characteristics: [
      "Drei aufeinanderfolgende Hochs (Drives).",
      "Zwei Korrekturphasen zwischen den Drives.",
      "Oft Fibonacci-Beziehungen."
    ],
    trading: "Verkaufssignal nach Vollendung des dritten Drives.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      // Drive 1
      const d1StartX = w * 0.1, d1StartY = h * 0.8;
      const d1PeakX = w * 0.25, d1PeakY = h * 0.4;
      drawLine(ctx, d1StartX, d1StartY, d1PeakX, d1PeakY, colors.bearishLight, 2, "Drive 1", addInteractive);
      drawText(ctx, "1", d1PeakX, d1PeakY - 10, colors.highlight);

      // Retracement 1
      const r1EndX = w * 0.35, r1EndY = h * 0.55;
      drawLine(ctx, d1PeakX, d1PeakY, r1EndX, r1EndY, colors.highlight, 1.5, "Retracement A", addInteractive);
      drawText(ctx, "A", r1EndX, r1EndY + 15, colors.highlight);

      // Drive 2
      const d2PeakX = w * 0.5, d2PeakY = h * 0.25;
      drawLine(ctx, r1EndX, r1EndY, d2PeakX, d2PeakY, colors.bearishLight, 2, "Drive 2", addInteractive);
      drawText(ctx, "2", d2PeakX, d2PeakY - 10, colors.highlight);

      // Retracement 2
      const r2EndX = w * 0.6, r2EndY = h * 0.4;
      drawLine(ctx, d2PeakX, d2PeakY, r2EndX, r2EndY, colors.highlight, 1.5, "Retracement B", addInteractive);
      drawText(ctx, "B", r2EndX, r2EndY + 15, colors.highlight);

      // Drive 3
      const d3PeakX = w * 0.75, d3PeakY = h * 0.1;
      drawLine(ctx, r2EndX, r2EndY, d3PeakX, d3PeakY, colors.bearishLight, 2, "Drive 3", addInteractive);
      drawText(ctx, "3", d3PeakX, d3PeakY - 10, colors.highlight);

      drawArrow(ctx, d3PeakX, d3PeakY + h * 0.05, d3PeakX + w * 0.1, d3PeakY + h * 0.3, colors.bearish, 2.5, "Bärische Umkehr", addInteractive);
    }
  },
  {
    id: "threeDrivesBottom",
    name: "Three Drives to a Bottom",
    category: "Umkehrmuster",
    description: "Eine bullische Umkehrformation mit drei symmetrischen Tiefs.",
    characteristics: [
      "Drei aufeinanderfolgende Tiefs (Drives).",
      "Zwei Korrekturphasen.",
      "Oft Fibonacci-Beziehungen."
    ],
    trading: "Kaufsignal nach Vollendung des dritten Drives.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      // Drive 1
      const d1StartX = w * 0.1, d1StartY = h * 0.2;
      const d1TroughX = w * 0.25, d1TroughY = h * 0.6;
      drawLine(ctx, d1StartX, d1StartY, d1TroughX, d1TroughY, colors.neutral, 2, "Drive 1", addInteractive);
      drawText(ctx, "1", d1TroughX, d1TroughY + 15, colors.highlight);

      // Retracement 1
      const r1EndX = w * 0.35, r1EndY = h * 0.45;
      drawLine(ctx, d1TroughX, d1TroughY, r1EndX, r1EndY, colors.highlight, 1.5, "Retracement A", addInteractive);
      drawText(ctx, "A", r1EndX, r1EndY - 10, colors.highlight);

      // Drive 2
      const d2TroughX = w * 0.5, d2TroughY = h * 0.75;
      drawLine(ctx, r1EndX, r1EndY, d2TroughX, d2TroughY, colors.neutral, 2, "Drive 2", addInteractive);
      drawText(ctx, "2", d2TroughX, d2TroughY + 15, colors.highlight);

      // Retracement 2
      const r2EndX = w * 0.6, r2EndY = h * 0.6;
      drawLine(ctx, d2TroughX, d2TroughY, r2EndX, r2EndY, colors.highlight, 1.5, "Retracement B", addInteractive);
      drawText(ctx, "B", r2EndX, r2EndY - 10, colors.highlight);

      // Drive 3
      const d3TroughX = w * 0.75, d3TroughY = h * 0.9;
      drawLine(ctx, r2EndX, r2EndY, d3TroughX, d3TroughY, colors.neutral, 2, "Drive 3", addInteractive);
      drawText(ctx, "3", d3TroughX, d3TroughY + 15, colors.highlight);

      drawArrow(ctx, d3TroughX, d3TroughY - h * 0.05, d3TroughX + w * 0.1, d3TroughY - h * 0.3, colors.bullish, 2.5, "Bullische Umkehr", addInteractive);
    }
  },
  {
    id: "hornTop",
    name: "Horn Top",
    category: "Umkehrmuster",
    description: "Eine bärische Umkehrformation mit zwei spitzen Hochs (Hörnern) und einem Zwischentief.",
    characteristics: [
      "Zwei scharfe, spitze Hochs.",
      "Zwischentief relativ flach."
    ],
    trading: "Verkaufssignal beim Bruch des Zwischentiefs.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const baseY = h * 0.7;
      const horn1PeakX = w * 0.4, horn1PeakY = h * 0.2;
      const horn2PeakX = w * 0.6, horn2PeakY = h * 0.25;
      const valleyX = (horn1PeakX + horn2PeakX) / 2, valleyY = h * 0.4;

      drawLine(ctx, w * 0.2, baseY, horn1PeakX, horn1PeakY, colors.bearishLight, 2, "Anstieg", addInteractive);
      drawText(ctx, "Horn 1", horn1PeakX, horn1PeakY - 10, colors.highlight);
      drawLine(ctx, horn1PeakX, horn1PeakY, valleyX, valleyY, colors.bearishLight, 1.5, "", addInteractive);
      drawLine(ctx, valleyX, valleyY, horn2PeakX, horn2PeakY, colors.bearish, 2, "Horn 2", addInteractive);
      drawText(ctx, "Horn 2", horn2PeakX, horn2PeakY - 10, colors.highlight);
      drawLine(ctx, horn2PeakX, horn2PeakY, w * 0.8, baseY * 1.1, colors.bearish, 2.5, "Abfall", addInteractive);

      drawLine(ctx, valleyX - w * 0.1, valleyY, valleyX + w * 0.1, valleyY, "#e0e0e0", 1, "Unterstützung", addInteractive);
      drawArrow(ctx, valleyX + w * 0.05, valleyY, valleyX + w * 0.05, valleyY + h * 0.15, colors.bearish, 2, "Bruch", addInteractive);
    }
  },
  {
    id: "hornBottom",
    name: "Horn Bottom",
    category: "Umkehrmuster",
    description: "Eine bullische Umkehrformation mit zwei spitzen Tiefs (Hörnern) und einem Zwischenhoch.",
    characteristics: [
      "Zwei scharfe, spitze Tiefs.",
      "Zwischenhoch relativ flach."
    ],
    trading: "Kaufsignal beim Bruch des Zwischenhochs.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const baseY = h * 0.3;
      const horn1TroughX = w * 0.4, horn1TroughY = h * 0.8;
      const horn2TroughX = w * 0.6, horn2TroughY = h * 0.75;
      const peakX = (horn1TroughX + horn2TroughX) / 2, peakY = h * 0.6;

      drawLine(ctx, w * 0.2, baseY, horn1TroughX, horn1TroughY, colors.bullishLight, 2, "Abfall", addInteractive);
      drawText(ctx, "Horn 1", horn1TroughX, horn1TroughY + 15, colors.highlight);
      drawLine(ctx, horn1TroughX, horn1TroughY, peakX, peakY, colors.bullishLight, 1.5, "", addInteractive);
      drawLine(ctx, peakX, peakY, horn2TroughX, horn2TroughY, colors.bullish, 2, "Horn 2", addInteractive);
      drawText(ctx, "Horn 2", horn2TroughX, horn2TroughY + 15, colors.highlight);
      drawLine(ctx, horn2TroughX, horn2TroughY, w * 0.8, baseY * 0.9, colors.bullish, 2.5, "Anstieg", addInteractive);

      drawLine(ctx, peakX - w * 0.1, peakY, peakX + w * 0.1, peakY, "#e0e0e0", 1, "Widerstand", addInteractive);
      drawArrow(ctx, peakX + w * 0.05, peakY, peakX + w * 0.05, peakY - h * 0.15, colors.bullish, 2, "Bruch", addInteractive);
    }
  },
  {
    id: "eveAdamTop",
    name: "Eve & Adam Top",
    category: "Umkehrmuster",
    description: "Bärische Umkehr: abgerundetes Hoch (Eve) gefolgt von spitzem Hoch (Adam).",
    characteristics: [
      "Eve Top: Breites, abgerundetes Hoch.",
      "Adam Top: Enges, spitzes Hoch."
    ],
    trading: "Verkauf beim Bruch der Nackenlinie.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const neckY = h * 0.7;
      const eveTopY = h * 0.2;
      const eveCenterX = w * 0.3;
      const eveWidth = w * 0.3;
      const adamPeakY = h * 0.25;
      const adamCenterX = w * 0.7;
      const adamWidth = w * 0.15;

      ctx.beginPath();
      ctx.moveTo(eveCenterX - eveWidth / 2, neckY * 0.9);
      ctx.quadraticCurveTo(eveCenterX, eveTopY - h * 0.05, eveCenterX + eveWidth / 2, neckY * 0.9);
      ctx.strokeStyle = colors.bearishLight;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawText(ctx, "Eve", eveCenterX, eveTopY - 10, colors.highlight);

      drawLine(ctx, eveCenterX + eveWidth / 2, neckY * 0.9, w * 0.5, neckY, colors.text, 1.5, "", addInteractive);

      drawPeak(ctx, adamCenterX, adamPeakY, adamWidth, neckY, colors.bearish, "Adam Top", addInteractive);
      drawText(ctx, "Adam", adamCenterX, adamPeakY - 10, colors.highlight);

      drawLine(ctx, w * 0.15, neckY, w * 0.85, neckY, "#e0e0e0", 1.5, "Nackenlinie", addInteractive);
      drawArrow(ctx, w * 0.6, neckY, w * 0.6, neckY + h * 0.2, colors.bearish, 2, "Ausbruchsrichtung", addInteractive);
    }
  },
  {
    id: "eveAdamBottom",
    name: "Eve & Adam Bottom",
    category: "Umkehrmuster",
    description: "Bullische Umkehr: abgerundetes Tief (Eve) gefolgt von spitzem Tief (Adam).",
    characteristics: [
      "Eve Bottom: Breites, abgerundetes Tief.",
      "Adam Bottom: Enges, spitzes Tief."
    ],
    trading: "Kauf beim Bruch der Nackenlinie.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const neckY = h * 0.3;
      const eveBottomY = h * 0.8;
      const eveCenterX = w * 0.3;
      const eveWidth = w * 0.3;
      const adamTroughY = h * 0.75;
      const adamCenterX = w * 0.7;
      const adamWidth = w * 0.15;

      ctx.beginPath();
      ctx.moveTo(eveCenterX - eveWidth / 2, neckY * 1.1);
      ctx.quadraticCurveTo(eveCenterX, eveBottomY + h * 0.05, eveCenterX + eveWidth / 2, neckY * 1.1);
      ctx.strokeStyle = colors.bullishLight;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawText(ctx, "Eve", eveCenterX, eveBottomY + 10, colors.highlight);

      drawLine(ctx, eveCenterX + eveWidth / 2, neckY * 1.1, w * 0.5, neckY, colors.text, 1.5, "", addInteractive);

      drawTrough(ctx, adamCenterX, adamTroughY, adamWidth, neckY, colors.bullish, "Adam Bottom", addInteractive);
      drawText(ctx, "Adam", adamCenterX, adamTroughY + 15, colors.highlight);

      drawLine(ctx, w * 0.15, neckY, w * 0.85, neckY, "#e0e0e0", 1.5, "Nackenlinie", addInteractive);
      drawArrow(ctx, w * 0.6, neckY, w * 0.6, neckY - h * 0.2, colors.bullish, 2, "Ausbruchsrichtung", addInteractive);
    }
  },
  {
    id: "invertedCupAndHandleReversal",
    name: "Invertierte Tasse mit Henkel (Umkehr)",
    category: "Umkehrmuster",
    description: "Bärische Umkehrformation, Spiegelbild der Tasse mit Henkel.",
    characteristics: [
      "Invertierte Tasse (abgerundetes Hoch).",
      "Henkel (kleinere Konsolidierung)."
    ],
    trading: "Verkaufssignal beim Ausbruch unter die Henkel-Unterstützung.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const cupRimY = h * 0.7;
      const cupTopY = h * 0.3;
      const cupWidth = w * 0.6;
      const cupCenterX = w * 0.4;

      ctx.beginPath();
      ctx.moveTo(cupCenterX - cupWidth / 2, cupRimY);
      ctx.quadraticCurveTo(cupCenterX, cupTopY - h * 0.1, cupCenterX + cupWidth / 2, cupRimY);
      ctx.strokeStyle = colors.bearishLight;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawLineWithLabel(ctx, w, h, cupCenterX - cupWidth / 2, cupRimY, cupCenterX + cupWidth / 2 + w * 0.15, cupRimY, colors.text, 1.5, "Unterstützung", addInteractive);

      const handleStartX = cupCenterX + cupWidth / 2;
      const handleStartY = cupRimY;
      const handleEndX = handleStartX + w * 0.15;
      const handleEndY = cupRimY - h * 0.1;
      const handlePeakX = handleStartX + w * 0.075;
      const handlePeakY = cupRimY - h * 0.15;

      ctx.beginPath();
      ctx.moveTo(handleStartX, handleStartY);
      ctx.lineTo(handlePeakX - w * 0.02, handlePeakY + h * 0.03);
      ctx.quadraticCurveTo(handlePeakX, handlePeakY, handleEndX - w * 0.02, handleEndY - h * 0.01);
      ctx.lineTo(handleEndX, handleEndY);
      ctx.strokeStyle = colors.bearishLight;
      ctx.lineWidth = 2;
      ctx.stroke();

      drawText(ctx, "Inv. Tasse", cupCenterX, cupTopY + 10, colors.bearishLight);
      drawText(ctx, "Henkel", handlePeakX, handlePeakY - 15, colors.bearishLight);

      drawArrow(ctx, handleEndX, cupRimY, handleEndX + w * 0.1, cupRimY + h * 0.15, colors.bearish, 2, "Ausbruchsrichtung", addInteractive);
    }
  },

  // --- Fortsetzungsmuster ---
  {
    id: "symmetricalTriangleContinuationBullish",
    name: "Symmetr. Dreieck (Forts. Bullisch)",
    category: "Fortsetzungsmuster",
    description: "Symmetrisches Dreieck im Aufwärtstrend.",
    characteristics: ["Vorheriger Aufwärtstrend.", "Konvergierende Linien."],
    trading: "Kauf beim Ausbruch nach oben.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      drawLine(ctx, w * 0.05, h * 0.85, w * 0.15, h * 0.6, colors.bullish, 2, "Trend", addInteractive);
      const apexX = w * 0.75;
      const upperStartY = h * 0.4;
      const lowerStartY = h * 0.8;
      const midYApex = ((upperStartY + lowerStartY) / 2) * 0.9;

      drawLineWithLabel(ctx, w, h, w * 0.15, upperStartY, apexX, midYApex, colors.text, 2, "Widerstand", addInteractive);
      drawLineWithLabel(ctx, w, h, w * 0.15, lowerStartY, apexX, midYApex, colors.text, 2, "Unterstützung", addInteractive);

      ctx.beginPath();
      ctx.moveTo(w * 0.18, lowerStartY * 0.98);
      ctx.lineTo(w * 0.3, upperStartY * 1.05);
      ctx.lineTo(w * 0.42, lowerStartY * 0.9);
      ctx.lineTo(w * 0.55, upperStartY * 1.1);
      ctx.strokeStyle = colors.neutral;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      drawArrow(ctx, apexX * 0.9, midYApex - h * 0.02, apexX + w * 0.1, midYApex - h * 0.2, colors.bullish, 2, "Ausbruch", addInteractive);
    }
  },
  {
    id: "symmetricalTriangleContinuationBearish",
    name: "Symmetr. Dreieck (Forts. Bärisch)",
    category: "Fortsetzungsmuster",
    description: "Symmetrisches Dreieck im Abwärtstrend.",
    characteristics: ["Vorheriger Abwärtstrend.", "Konvergierende Linien."],
    trading: "Verkauf beim Ausbruch nach unten.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      drawLine(ctx, w * 0.05, h * 0.15, w * 0.15, h * 0.4, colors.bearish, 2, "Trend", addInteractive);
      const apexX = w * 0.75;
      const upperStartY = h * 0.2;
      const lowerStartY = h * 0.6;
      const midYApex = ((upperStartY + lowerStartY) / 2) * 1.1;

      drawLineWithLabel(ctx, w, h, w * 0.15, upperStartY, apexX, midYApex, colors.text, 2, "Widerstand", addInteractive);
      drawLineWithLabel(ctx, w, h, w * 0.15, lowerStartY, apexX, midYApex, colors.text, 2, "Unterstützung", addInteractive);

      ctx.beginPath();
      ctx.moveTo(w * 0.18, upperStartY * 1.02);
      ctx.lineTo(w * 0.3, lowerStartY * 0.95);
      ctx.lineTo(w * 0.42, upperStartY * 1.1);
      ctx.lineTo(w * 0.55, lowerStartY * 0.9);
      ctx.strokeStyle = colors.bearishLight;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      drawArrow(ctx, apexX * 0.9, midYApex + h * 0.02, apexX + w * 0.1, midYApex + h * 0.2, colors.bearish, 2, "Ausbruch", addInteractive);
    }
  },
  {
    id: "cupAndHandle",
    name: "Tasse mit Henkel",
    category: "Fortsetzungsmuster",
    description: "Bullische Fortsetzungsformation.",
    characteristics: ["Tasse (Runder Boden).", "Henkel (Konsolidierung)."],
    trading: "Kauf beim Ausbruch über den Henkel.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const cupRimY = h * 0.3;
      const cupBottomY = h * 0.7;
      const cupWidth = w * 0.6;
      const cupCenterX = w * 0.4;
      ctx.beginPath();
      ctx.moveTo(cupCenterX - cupWidth / 2, cupRimY);
      ctx.quadraticCurveTo(cupCenterX, cupBottomY + h * 0.1, cupCenterX + cupWidth / 2, cupRimY);
      ctx.strokeStyle = colors.neutral;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawLineWithLabel(ctx, w, h, cupCenterX - cupWidth / 2, cupRimY, cupCenterX + cupWidth / 2 + w * 0.15, cupRimY, colors.text, 1.5, "Widerstand", addInteractive);

      const handleStartX = cupCenterX + cupWidth / 2;
      const handleStartY = cupRimY;
      const handleEndX = handleStartX + w * 0.15;
      const handleEndY = cupRimY + h * 0.1;
      const handleDipX = handleStartX + w * 0.075;
      const handleDipY = cupRimY + h * 0.15;
      ctx.beginPath();
      ctx.moveTo(handleStartX, handleStartY);
      ctx.lineTo(handleDipX - w * 0.02, handleDipY - h * 0.03);
      ctx.quadraticCurveTo(handleDipX, handleDipY, handleEndX - w * 0.02, handleEndY + h * 0.01);
      ctx.lineTo(handleEndX, handleEndY);
      ctx.strokeStyle = colors.bullishLight;
      ctx.lineWidth = 2;
      ctx.stroke();

      drawText(ctx, "Tasse", cupCenterX, cupBottomY - 10, colors.neutral);
      drawText(ctx, "Henkel", handleDipX, handleDipY + 15, colors.bullishLight);

      drawArrow(ctx, handleEndX, cupRimY, handleEndX + w * 0.1, cupRimY - h * 0.15, colors.bullish, 2, "Ausbruch", addInteractive);
    }
  },
  {
    id: "invertedCupAndHandleContinuation",
    name: "Invertierte Tasse mit Henkel (Fortsetzung)",
    category: "Fortsetzungsmuster",
    description: "Bärische Fortsetzungsformation.",
    characteristics: ["Invertierte Tasse.", "Henkel."],
    trading: "Verkauf beim Ausbruch nach unten.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const cupRimY = h * 0.7;
      const cupTopY = h * 0.3;
      const cupWidth = w * 0.6;
      const cupCenterX = w * 0.4;

      ctx.beginPath();
      ctx.moveTo(cupCenterX - cupWidth / 2, cupRimY);
      ctx.quadraticCurveTo(cupCenterX, cupTopY - h * 0.1, cupCenterX + cupWidth / 2, cupRimY);
      ctx.strokeStyle = colors.bearishLight;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawLineWithLabel(ctx, w, h, cupCenterX - cupWidth / 2, cupRimY, cupCenterX + cupWidth / 2 + w * 0.15, cupRimY, colors.text, 1.5, "Unterstützung", addInteractive);

      const handleStartX = cupCenterX + cupWidth / 2;
      const handleStartY = cupRimY;
      const handleEndX = handleStartX + w * 0.15;
      const handleEndY = cupRimY - h * 0.1;
      const handlePeakX = handleStartX + w * 0.075;
      const handlePeakY = cupRimY - h * 0.15;

      ctx.beginPath();
      ctx.moveTo(handleStartX, handleStartY);
      ctx.lineTo(handlePeakX - w * 0.02, handlePeakY + h * 0.03);
      ctx.quadraticCurveTo(handlePeakX, handlePeakY, handleEndX - w * 0.02, handleEndY - h * 0.01);
      ctx.lineTo(handleEndX, handleEndY);
      ctx.strokeStyle = colors.bearishLight;
      ctx.lineWidth = 2;
      ctx.stroke();

      drawText(ctx, "Inv. Tasse", cupCenterX, cupTopY + 10, colors.bearishLight);
      drawText(ctx, "Henkel", handlePeakX, handlePeakY - 15, colors.bearishLight);

      drawArrow(ctx, handleEndX, cupRimY, handleEndX + w * 0.1, cupRimY + h * 0.15, colors.bearish, 2, "Ausbruch", addInteractive);
    }
  },
  {
    id: "bullishPennant",
    name: "Bullischer Wimpel",
    category: "Fortsetzungsmuster",
    description: "Kurzfristige Fortsetzung nach starkem Anstieg.",
    characteristics: ["Flaggenmast.", "Kleines symmetrisches Dreieck (Wimpel)."],
    trading: "Kauf beim Ausbruch.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const mastBottomX = w * 0.2; const mastBottomY = h * 0.9;
      const mastTopX = w * 0.2; const mastTopY = h * 0.2;
      drawLineWithLabel(ctx, w, h, mastBottomX, mastBottomY, mastTopX, mastTopY, colors.bullish, 3, "Flaggenmast", addInteractive);

      const pennantStartX = mastTopX;
      const pennantPointX = w * 0.5;
      const pennantTopY = mastTopY - h * 0.1;
      const pennantBottomY = mastTopY + h * 0.1;

      drawLine(ctx, pennantStartX, mastTopY, pennantPointX, pennantTopY, colors.bullishLight, 2, "", addInteractive);
      drawLine(ctx, pennantStartX, mastTopY, pennantPointX, pennantBottomY, colors.bullishLight, 2, "", addInteractive);
      drawLine(ctx, pennantPointX, pennantTopY, pennantPointX, pennantBottomY, colors.bullishLight, 2, "", addInteractive);

      drawArrow(ctx, pennantPointX, pennantTopY, pennantPointX + w * 0.1, pennantTopY - h * 0.1, colors.bullish, 2, "Ausbruch", addInteractive);
    }
  },
  {
    id: "bearishPennant",
    name: "Bärischer Wimpel",
    category: "Fortsetzungsmuster",
    description: "Kurzfristige Fortsetzung nach starkem Abfall.",
    characteristics: ["Flaggenmast.", "Kleines symmetrisches Dreieck (Wimpel)."],
    trading: "Verkauf beim Ausbruch.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const mastTopX = w * 0.2; const mastTopY = h * 0.1;
      const mastBottomX = w * 0.2; const mastBottomY = h * 0.8;
      drawLineWithLabel(ctx, w, h, mastTopX, mastTopY, mastBottomX, mastBottomY, colors.bearish, 3, "Flaggenmast", addInteractive);

      const pennantStartX = mastBottomX;
      const pennantPointX = w * 0.5;
      const pennantTopY = mastBottomY - h * 0.1;
      const pennantBottomY = mastBottomY + h * 0.1;

      drawLine(ctx, pennantStartX, mastBottomY, pennantPointX, pennantTopY, colors.bearishLight, 2, "", addInteractive);
      drawLine(ctx, pennantStartX, mastBottomY, pennantPointX, pennantBottomY, colors.bearishLight, 2, "", addInteractive);
      drawLine(ctx, pennantPointX, pennantTopY, pennantPointX, pennantBottomY, colors.bearishLight, 2, "", addInteractive);

      drawArrow(ctx, pennantPointX, pennantBottomY, pennantPointX + w * 0.1, pennantBottomY + h * 0.1, colors.bearish, 2, "Ausbruch", addInteractive);
    }
  },
  {
    id: "ascendingChannel",
    name: "Aufsteigender Kanal",
    category: "Fortsetzungsmuster",
    description: "Kanal mit aufwärts gerichteten Trendlinien.",
    characteristics: ["Parallele aufwärts geneigte Linien.", "HH und HL."],
    trading: "Trades innerhalb des Kanals oder bei Ausbruch (Vorsicht).",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const startX = w * 0.1, endX = w * 0.9;
      const topStartY = h * 0.3, topEndY = h * 0.1;
      const botStartY = h * 0.7, botEndY = h * 0.5;

      drawLineWithLabel(ctx, w, h, startX, topStartY, endX, topEndY, colors.text, 2, "Widerstand", addInteractive);
      drawLineWithLabel(ctx, w, h, startX, botStartY, endX, botEndY, colors.text, 2, "Unterstützung", addInteractive);

            drawPricePath(ctx, [
        { x: startX + w * 0.05, y: botStartY - h * 0.03 },
        { x: startX + w * 0.2, y: topStartY + h * 0.03 },
        { x: startX + w * 0.35, y: botStartY - h * 0.08 },
        { x: startX + w * 0.5, y: topStartY - h * 0.02 },
        { x: startX + w * 0.65, y: botEndY + h * 0.03 },
        { x: startX + w * 0.8, y: topEndY + h * 0.05 }
      ], colors.bullish, 1.5);

      drawArrow(ctx, endX * 0.9, topEndY, endX * 0.9, topEndY - h * 0.1, colors.bullish, 1.5, "Mögl. Fortsetzung", addInteractive);
    }
  },
  {
    id: "descendingChannel",
    name: "Absteigender Kanal",
    category: "Fortsetzungsmuster",
    description: "Kanal mit abwärts gerichteten Trendlinien.",
    characteristics: ["Parallele abwärts geneigte Linien.", "LH und LL."],
    trading: "Trades innerhalb des Kanals oder bei Ausbruch.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const startX = w * 0.1, endX = w * 0.9;
      const topStartY = h * 0.1, topEndY = h * 0.3;
      const botStartY = h * 0.5, botEndY = h * 0.7;

      drawLineWithLabel(ctx, w, h, startX, topStartY, endX, topEndY, colors.text, 2, "Widerstand", addInteractive);
      drawLineWithLabel(ctx, w, h, startX, botStartY, endX, botEndY, colors.text, 2, "Unterstützung", addInteractive);

            drawPricePath(ctx, [
        { x: startX + w * 0.05, y: topStartY + h * 0.03 },
        { x: startX + w * 0.2, y: botStartY - h * 0.03 },
        { x: startX + w * 0.35, y: topStartY + h * 0.08 },
        { x: startX + w * 0.5, y: botStartY - h * 0.02 },
        { x: startX + w * 0.65, y: topEndY + h * 0.03 },
        { x: startX + w * 0.8, y: botEndY - h * 0.05 }
      ], colors.bearish, 1.5);

      drawArrow(ctx, endX * 0.9, botEndY, endX * 0.9, botEndY + h * 0.1, colors.bearish, 1.5, "Mögl. Fortsetzung", addInteractive);
    }
  },
  {
    id: "rectangleContinuationBullish",
    name: "Rechteck (Forts. Bullisch)",
    category: "Fortsetzungsmuster",
    description: "Rechteck nach Aufwärtstrend.",
    characteristics: ["Vorheriger Aufwärtstrend.", "Horizontale Begrenzungen."],
    trading: "Kauf beim Ausbruch nach oben.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const resistanceY = h * 0.4;
      const supportY = h * 0.6;
      const rectStartX = w * 0.25, rectEndX = w * 0.75;

      drawLine(ctx, w * 0.1, h * 0.8, rectStartX - w * 0.02, supportY + h * 0.02, colors.bullish, 2, "Trend", addInteractive);
      drawLineWithLabel(ctx, w, h, rectStartX, resistanceY, rectEndX, resistanceY, colors.text, 2, "Widerstand", addInteractive);
      drawLineWithLabel(ctx, w, h, rectStartX, supportY, rectEndX, supportY, colors.text, 2, "Unterstützung", addInteractive);

            drawPricePath(ctx, [
        { x: rectStartX + w * 0.02, y: supportY - h * 0.02 },
        { x: rectStartX + w * 0.1, y: resistanceY + h * 0.02 },
        { x: rectStartX + w * 0.2, y: supportY - h * 0.02 },
        { x: rectStartX + w * 0.3, y: resistanceY + h * 0.02 }
      ], colors.neutral, 1.5);

      drawArrow(ctx, rectEndX, resistanceY, rectEndX + w * 0.1, resistanceY - h * 0.15, colors.bullish, 2, "Ausbruch", addInteractive);
    }
  },
  {
    id: "rectangleContinuationBearish",
    name: "Rechteck (Forts. Bärisch)",
    category: "Fortsetzungsmuster",
    description: "Rechteck nach Abwärtstrend.",
    characteristics: ["Vorheriger Abwärtstrend.", "Horizontale Begrenzungen."],
    trading: "Verkauf beim Ausbruch nach unten.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const resistanceY = h * 0.4;
      const supportY = h * 0.6;
      const rectStartX = w * 0.25, rectEndX = w * 0.75;

      drawLine(ctx, w * 0.1, h * 0.2, rectStartX - w * 0.02, resistanceY - h * 0.02, colors.bearish, 2, "Trend", addInteractive);
      drawLineWithLabel(ctx, w, h, rectStartX, resistanceY, rectEndX, resistanceY, colors.text, 2, "Widerstand", addInteractive);
      drawLineWithLabel(ctx, w, h, rectStartX, supportY, rectEndX, supportY, colors.text, 2, "Unterstützung", addInteractive);

            drawPricePath(ctx, [
        { x: rectStartX + w * 0.02, y: resistanceY + h * 0.02 },
        { x: rectStartX + w * 0.1, y: supportY - h * 0.02 },
        { x: rectStartX + w * 0.2, y: resistanceY + h * 0.02 },
        { x: rectStartX + w * 0.3, y: supportY - h * 0.02 }
      ], colors.bearishLight, 1.5);

      drawArrow(ctx, rectEndX, supportY, rectEndX + w * 0.1, supportY + h * 0.15, colors.bearish, 2, "Ausbruch", addInteractive);
    }
  },
  {
    id: "deadCatBounce",
    name: "Dead Cat Bounce",
    category: "Fortsetzungsmuster",
    description: "Kurzfristige Erholung nach starkem Abverkauf, gefolgt von weiterem Abfall.",
    characteristics: [
      "Starker Kursrückgang.",
      "Kurze, schwache Erholung.",
      "Fortsetzung des Abwärtstrends."
    ],
    trading: "Kein Einstiegssignal für Long. Warnsignal.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const startX = w * 0.1, startY = h * 0.15;
      const firstDropX = w * 0.35, firstDropY = h * 0.7;
      const bouncePeakX = w * 0.55, bouncePeakY = h * 0.5;
      const finalDropX = w * 0.8, finalDropY = h * 0.85;

      drawLineWithLabel(ctx, w, h, startX, startY, firstDropX, firstDropY, colors.bearish, 2.5, "Starker Abverkauf", addInteractive);
      drawLineWithLabel(ctx, w, h, firstDropX, firstDropY, bouncePeakX, bouncePeakY, colors.bullishLight, 2, "Bounce", addInteractive);
      drawText(ctx, "Bounce", bouncePeakX, bouncePeakY - 10, colors.bullishLight);
      drawLineWithLabel(ctx, w, h, bouncePeakX, bouncePeakY, finalDropX, finalDropY, colors.bearish, 2.5, "Weiterer Abfall", addInteractive);
    }
  },

  // --- Gap-Typen ---
  {
    id: "runawayGap",
    name: "Fortsetzungslücke (Runaway Gap)",
    category: "Gap-Typen",
    description: "Lücke inmitten eines Trends, signalisiert Beschleunigung.",
    characteristics: ["Etablierter Trend.", "Mittleres bis hohes Volumen."],
    trading: "Einstieg in Trendrichtung.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const bodyHeight = h * 0.08;
      const gapSize = h * 0.08;
      const candleWidth = w * 0.04;

      drawCandle(ctx, w * 0.15, h * 0.7, candleWidth, bodyHeight, colors.bullish, "", addInteractive);
      drawCandle(ctx, w * 0.25, h * 0.6, candleWidth, bodyHeight * 1.2, colors.bullish, "", addInteractive);
      drawCandle(ctx, w * 0.35, h * 0.5, candleWidth, bodyHeight * 1.3, colors.bullish, "Trend vor Gap", addInteractive);

      const firstCandleTop = h * 0.5 - (bodyHeight * 1.3) / 2;
      const gapBottom = firstCandleTop;
      const gapTop = gapBottom - gapSize;
      const secondCandleBottom = gapTop;
      const secondCandleTop = secondCandleBottom - bodyHeight * 1.2;

      ctx.beginPath();
      ctx.rect(w * 0.45, gapTop, candleWidth * 1.5, gapSize);
      ctx.fillStyle = colors.bullishFill;
      ctx.fill();
      ctx.strokeStyle = colors.bullish;
      ctx.stroke();
      drawText(ctx, "Runaway Gap", w * 0.45 + candleWidth * 0.75, gapBottom - gapSize / 2, colors.bullish, "10px");

      drawCandle(ctx, w * 0.55, secondCandleTop + (bodyHeight * 1.2) / 2, candleWidth, bodyHeight * 1.2, colors.bullish, "Trend nach Gap", addInteractive);
      drawCandle(ctx, w * 0.65, secondCandleTop - bodyHeight * 0.8, candleWidth, bodyHeight * 1.5, colors.bullish, "", addInteractive);
      drawArrow(ctx, w * 0.1, h * 0.75, w * 0.85, h * 0.1, colors.bullish, 1.5, "Starker Trend", addInteractive);
    }
  },
  {
    id: "exhaustionGap",
    name: "Erschöpfungslücke (Exhaustion Gap)",
    category: "Gap-Typen",
    description: "Lücke am Ende eines Trends, signalisiert Umkehr.",
    characteristics: ["Ende eines Trends.", "Hohes Volumen oder Blow-off."],
    trading: "Gegenbewegung abwarten.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const bodyHeight = h * 0.07;
      const gapSize = h * 0.1;
      const candleWidth = w * 0.035;

      drawCandle(ctx, w * 0.1, h * 0.8, candleWidth, bodyHeight, colors.bullish, "", addInteractive);
      drawCandle(ctx, w * 0.2, h * 0.65, candleWidth, bodyHeight * 1.2, colors.bullish, "", addInteractive);
      drawCandle(ctx, w * 0.3, h * 0.5, candleWidth, bodyHeight * 1.3, colors.bullish, "", addInteractive);
      drawCandle(ctx, w * 0.4, h * 0.35, candleWidth, bodyHeight * 1.5, colors.bullish, "Letzte Trendphase", addInteractive);

      const firstCandleTop = h * 0.35 - (bodyHeight * 1.5) / 2;
      const gapBottom = firstCandleTop;
      const gapTop = gapBottom - gapSize;
      const secondCandleBottom = gapTop;
      const secondCandleTop = secondCandleBottom - bodyHeight * 0.8;

      ctx.beginPath();
      ctx.rect(w * 0.5, gapTop, candleWidth * 1.5, gapSize);
      ctx.fillStyle = colors.bearishFill;
      ctx.fill();
      ctx.strokeStyle = colors.bearish;
      ctx.stroke();
      drawText(ctx, "Exhaustion Gap", w * 0.5 + candleWidth * 0.75, gapBottom - gapSize / 2, colors.bearish, "10px");

      drawCandle(ctx, w * 0.6, secondCandleTop + (bodyHeight * 0.8) / 2, candleWidth * 0.8, bodyHeight * 0.8, colors.bearishLight, "Schwache Kerze", addInteractive);

      drawArrow(ctx, w * 0.65, secondCandleTop + bodyHeight, w * 0.85, h * 0.7, colors.bearish, 2, "Trendumkehr", addInteractive);
      drawCandle(ctx, w * 0.75, h * 0.5, candleWidth * 1.2, bodyHeight * 1.5, colors.bearish, "Umkehrkerze", addInteractive);
    }
  }
];
