
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

// --- Pattern Definitions ---

export const CHART_PATTERNS: ChartPatternDefinition[] = [
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
      drawPeak(ctx, w * 0.25, h * 0.4, w * 0.15, neckY, colors.bearishLight, "Linke Schulter", addInteractive);
      drawPeak(ctx, w * 0.5, h * 0.2, w * 0.2, neckY, colors.bearish, "Kopf", addInteractive);
      drawPeak(ctx, w * 0.75, h * 0.45, w * 0.15, neckY, colors.bearishLight, "Rechte Schulter", addInteractive);
      drawText(ctx, "L Schulter", w * 0.25, h * 0.38, colors.highlight);
      drawText(ctx, "Kopf", w * 0.5, h * 0.18, colors.highlight);
      drawText(ctx, "R Schulter", w * 0.75, h * 0.43, colors.highlight);
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
      drawTrough(ctx, w * 0.25, h * 0.6, w * 0.15, neckY, colors.bullishLight, "Linke Schulter", addInteractive);
      drawTrough(ctx, w * 0.5, h * 0.8, w * 0.2, neckY, colors.bullish, "Kopf", addInteractive);
      drawTrough(ctx, w * 0.75, h * 0.55, w * 0.15, neckY, colors.bullishLight, "Rechte Schulter", addInteractive);
      drawText(ctx, "L Schulter", w * 0.25, h * 0.62, colors.highlight);
      drawText(ctx, "Kopf", w * 0.5, h * 0.82, colors.highlight);
      drawText(ctx, "R Schulter", w * 0.75, h * 0.57, colors.highlight);
      drawText(ctx, "Nackenlinie", w * 0.5, neckY - 15, colors.text);
      drawArrow(ctx, w * 0.8, neckY, w * 0.8, neckY - h * 0.2, colors.bullish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.8, neckY - h * 0.2 - 15, colors.bullish);
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
      drawPeak(ctx, w * 0.3, peakY, w * 0.2, supportY, colors.bearishLight, "Erstes Hoch", addInteractive);
      drawPeak(ctx, w * 0.7, peakY, w * 0.2, supportY, colors.bearishLight, "Zweites Hoch", addInteractive);
      drawText(ctx, "Hoch 1", w * 0.3, peakY - 10, colors.highlight);
      drawText(ctx, "Hoch 2", w * 0.7, peakY - 10, colors.highlight);
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
      drawTrough(ctx, w * 0.3, troughY, w * 0.2, resistanceY, colors.bullishLight, "Erstes Tief", addInteractive);
      drawTrough(ctx, w * 0.7, troughY, w * 0.2, resistanceY, colors.bullishLight, "Zweites Tief", addInteractive);
      drawText(ctx, "Tief 1", w * 0.3, troughY + 20, colors.highlight);
      drawText(ctx, "Tief 2", w * 0.7, troughY + 20, colors.highlight);
      drawText(ctx, "Widerstand", w * 0.5, resistanceY - 10, colors.text);
      drawArrow(ctx, w * 0.6, resistanceY, w * 0.6, resistanceY - h * 0.2, colors.bullish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", w * 0.6, resistanceY - h * 0.2 - 15, colors.bullish);
    }
  },
  {
    id: "ascendingTriangle",
    name: "Aufsteigendes Dreieck",
    category: "Fortsetzungsmuster",
    description: "Ein aufsteigendes Dreieck ist typischerweise eine bullische Fortsetzungsformation. Es wird durch eine horizontale obere Widerstandslinie und eine ansteigende untere Unterstützungslinie gebildet.",
    characteristics: [
      "Horizontale obere Linie (Widerstand).",
      "Ansteigende untere Linie (Unterstützung).",
      "Die Linien konvergieren.",
      "Volumen nimmt tendenziell ab, während sich das Muster bildet, und steigt beim Ausbruch."
    ],
    trading: "Ein Kaufsignal entsteht oft, wenn der Kurs über die horizontale Widerstandslinie ausbricht. Das Kursziel kann durch Messen der breitesten Stelle des Dreiecks und Addieren zum Ausbruchspunkt bestimmt werden.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Hoch, da es eine klare Akkumulationsphase zeigt. Bestätigung durch Volumen beim Ausbruch erhöht die Wahrscheinlichkeit.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Ausbruch über die Widerstandslinie. SL: Unter dem Ausbruchsniveau oder unter der ansteigenden Unterstützungslinie. TP: Höhe des Dreiecks (breiteste Stelle) vom Ausbruchspunkt nach oben projiziert.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const resistanceY = h * 0.3;
      const startSupportY = h * 0.8;
      const meetingX = w * 0.85;
      drawLine(ctx, w * 0.1, resistanceY, meetingX, resistanceY, colors.text, 2, "Widerstandslinie", addInteractive);
      drawLine(ctx, w * 0.1, startSupportY, meetingX, resistanceY, colors.text, 2, "Unterstützungslinie", addInteractive);
      ctx.beginPath();
      ctx.moveTo(w * 0.12, startSupportY * 0.98);
      ctx.lineTo(w * 0.25, resistanceY * 1.05);
      ctx.lineTo(w * 0.38, startSupportY * 0.85);
      ctx.lineTo(w * 0.51, resistanceY * 1.05);
      ctx.lineTo(w * 0.64, startSupportY * 0.72);
      ctx.lineTo(w * 0.77, resistanceY * 1.05);
      ctx.strokeStyle = colors.neutral;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawText(ctx, "Widerstand", w * 0.4, resistanceY - 10, colors.text);
      drawText(ctx, "Unterstützung", w * 0.4, (startSupportY + resistanceY) / 2 + 30, colors.text);
      drawArrow(ctx, meetingX * 0.95, resistanceY, meetingX * 0.95, resistanceY - h * 0.15, colors.bullish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", meetingX * 0.95, resistanceY - h * 0.15 - 15, colors.bullish);
    }
  },
  {
    id: "descendingTriangle",
    name: "Absteigendes Dreieck",
    category: "Fortsetzungsmuster",
    description: "Ein absteigendes Dreieck ist typischerweise eine bärische Fortsetzungsformation. Es wird durch eine horizontale untere Unterstützungslinie und eine fallende obere Widerstandslinie gebildet.",
    characteristics: [
      "Horizontale untere Linie (Unterstützung).",
      "Fallende obere Linie (Widerstand).",
      "Die Linien konvergieren.",
      "Volumen nimmt tendenziell ab und steigt beim Ausbruch."
    ],
    trading: "Ein Verkaufssignal entsteht oft, wenn der Kurs unter die horizontale Unterstützungslinie ausbricht. Das Kursziel kann durch Messen der breitesten Stelle des Dreiecks und Subtrahieren vom Ausbruchspunkt bestimmt werden.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Hoch, da es eine klare Distributionsphase zeigt. Bestätigung durch Volumen beim Ausbruch erhöht die Wahrscheinlichkeit.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Ausbruch unter die Unterstützungslinie. SL: Über dem Ausbruchsniveau oder über der fallenden Widerstandslinie. TP: Höhe des Dreiecks (breiteste Stelle) vom Ausbruchspunkt nach unten projiziert.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const supportY = h * 0.7;
      const startResistanceY = h * 0.2;
      const meetingX = w * 0.85;
      drawLine(ctx, w * 0.1, supportY, meetingX, supportY, colors.text, 2, "Unterstützungslinie", addInteractive);
      drawLine(ctx, w * 0.1, startResistanceY, meetingX, supportY, colors.text, 2, "Widerstandslinie", addInteractive);
      ctx.beginPath();
      ctx.moveTo(w * 0.12, startResistanceY * 1.05);
      ctx.lineTo(w * 0.25, supportY * 0.95);
      ctx.lineTo(w * 0.38, startResistanceY * 1.3);
      ctx.lineTo(w * 0.51, supportY * 0.95);
      ctx.lineTo(w * 0.64, startResistanceY * 1.5);
      ctx.lineTo(w * 0.77, supportY * 0.95);
      ctx.strokeStyle = colors.bearishLight;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawText(ctx, "Widerstand", w * 0.4, (startResistanceY + supportY) / 2 - 40, colors.text);
      drawText(ctx, "Unterstützung", w * 0.4, supportY + 20, colors.text);
      drawArrow(ctx, meetingX * 0.95, supportY, meetingX * 0.95, supportY + h * 0.15, colors.bearish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", meetingX * 0.95, supportY + h * 0.15 + 15, colors.bearish);
    }
  },
  {
    id: "bullFlag",
    name: "Bullische Flagge",
    category: "Fortsetzungsmuster",
    description: "Eine bullische Flagge ist eine kurzfristige Fortsetzungsformation, die nach einem starken Aufwärtstrend (dem Flaggenmast) auftritt. Die Flagge selbst ist ein kleiner, nach unten geneigter Konsolidierungskanal.",
    characteristics: [
      "Starker, schneller Anstieg (Flaggenmast).",
      "Konsolidierungsphase in Form eines leicht abwärts geneigten Rechtecks oder Parallelogramms (Flagge).",
      "Volumen nimmt während der Flaggenbildung ab und steigt beim Ausbruch."
    ],
    trading: "Ein Kaufsignal entsteht, wenn der Kurs über die obere Begrenzung der Flagge ausbricht. Das Kursziel wird oft durch Addieren der Höhe des Flaggenmasts zum Ausbruchspunkt bestimmt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Hoch, da es eine kurze Pause in einem starken Trend darstellt.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position beim Ausbruch über die obere Flaggenlinie. SL: Unterhalb der unteren Flaggenlinie oder unter dem Ausbruchspunkt. TP: Höhe des Flaggenmasts, addiert zum Ausbruchspunkt.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const mastBottomX = w * 0.2;
      const mastBottomY = h * 0.9;
      const mastTopX = w * 0.2;
      const mastTopY = h * 0.2;
      drawLineWithLabel(ctx, w, h, mastBottomX, mastBottomY, mastTopX, mastTopY, colors.bullish, 3, "Flaggenmast", addInteractive);
      const flagTopLeftX = mastTopX;
      const flagTopLeftY = mastTopY;
      const flagTopRightX = w * 0.5;
      const flagTopRightY = h * 0.3;
      const flagBottomLeftX = mastTopX + w * 0.05;
      const flagBottomLeftY = mastTopY + h * 0.2;
      const flagBottomRightX = flagTopRightX + w * 0.05;
      const flagBottomRightY = flagTopRightY + h * 0.2;
      drawLineWithLabel(ctx, w, h, flagTopLeftX, flagTopLeftY, flagTopRightX, flagTopRightY, colors.bullishLight, 2, "Obere Flaggenlinie", addInteractive);
      drawLineWithLabel(ctx, w, h, flagBottomLeftX, flagBottomLeftY, flagBottomRightX, flagBottomRightY, colors.bullishLight, 2, "Untere Flaggenlinie", addInteractive);
      drawLine(ctx, flagTopLeftX, flagTopLeftY, flagBottomLeftX, flagBottomLeftY, colors.bullishLight, 1, "", addInteractive);
      drawLine(ctx, flagTopRightX, flagTopRightY, flagBottomRightX, flagBottomRightY, colors.bullishLight, 1, "", addInteractive);
      ctx.beginPath();
      ctx.moveTo(flagTopLeftX + 5, flagTopLeftY + 5);
      ctx.lineTo(flagBottomLeftX + 5, flagBottomLeftY - 5);
      ctx.lineTo(flagTopLeftX + 25, flagTopLeftY + 15);
      ctx.lineTo(flagBottomLeftX + 25, flagBottomLeftY - 15);
      ctx.strokeStyle = colors.neutral;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawArrow(ctx, flagTopRightX, flagTopRightY, flagTopRightX + w * 0.1, flagTopRightY - h * 0.15, colors.bullish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", flagTopRightX + w * 0.1, flagTopRightY - h * 0.15 - 10, colors.bullish);
    }
  },
  {
    id: "bearFlag",
    name: "Bärische Flagge",
    category: "Fortsetzungsmuster",
    description: "Eine bärische Flagge ist eine kurzfristige Fortsetzungsformation, die nach einem starken Abwärtstrend (dem Flaggenmast) auftritt. Die Flagge selbst ist ein kleiner, nach oben geneigter Konsolidierungskanal.",
    characteristics: [
      "Starker, schneller Abfall (Flaggenmast).",
      "Konsolidierungsphase in Form eines leicht aufwärts geneigten Rechtecks oder Parallelogramms (Flagge).",
      "Volumen nimmt während der Flaggenbildung ab und steigt beim Ausbruch."
    ],
    trading: "Ein Verkaufssignal entsteht, wenn der Kurs unter die untere Begrenzung der Flagge ausbricht. Das Kursziel wird oft durch Subtrahieren der Höhe des Flaggenmasts vom Ausbruchspunkt bestimmt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Hoch.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position beim Ausbruch unter die untere Flaggenlinie. SL: Oberhalb der oberen Flaggenlinie oder über dem Ausbruchspunkt. TP: Höhe des Flaggenmasts, subtrahiert vom Ausbruchspunkt.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const mastTopX = w * 0.2;
      const mastTopY = h * 0.1;
      const mastBottomX = w * 0.2;
      const mastBottomY = h * 0.8;
      drawLineWithLabel(ctx, w, h, mastTopX, mastTopY, mastBottomX, mastBottomY, colors.bearish, 3, "Flaggenmast", addInteractive);
      const flagBottomLeftX = mastBottomX;
      const flagBottomLeftY = mastBottomY;
      const flagBottomRightX = w * 0.5;
      const flagBottomRightY = h * 0.7;
      const flagTopLeftX = mastBottomX + w * 0.05;
      const flagTopLeftY = mastBottomY - h * 0.2;
      const flagTopRightX = flagBottomRightX + w * 0.05;
      const flagTopRightY = flagBottomRightY - h * 0.2;
      drawLineWithLabel(ctx, w, h, flagBottomLeftX, flagBottomLeftY, flagBottomRightX, flagBottomRightY, colors.bearishLight, 2, "Untere Flaggenlinie", addInteractive);
      drawLineWithLabel(ctx, w, h, flagTopLeftX, flagTopLeftY, flagTopRightX, flagTopRightY, colors.bearishLight, 2, "Obere Flaggenlinie", addInteractive);
      drawLine(ctx, flagBottomLeftX, flagBottomLeftY, flagTopLeftX, flagTopLeftY, colors.bearishLight, 1, "", addInteractive);
      drawLine(ctx, flagBottomRightX, flagBottomRightY, flagTopRightX, flagTopRightY, colors.bearishLight, 1, "", addInteractive);
      ctx.beginPath();
      ctx.moveTo(flagBottomLeftX + 5, flagBottomLeftY - 5);
      ctx.lineTo(flagTopLeftX + 5, flagTopLeftY + 5);
      ctx.lineTo(flagBottomLeftX + 25, flagBottomLeftY - 15);
      ctx.lineTo(flagTopLeftX + 25, flagTopLeftY + 15);
      ctx.strokeStyle = colors.neutral;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawArrow(ctx, flagBottomRightX, flagBottomRightY, flagBottomRightX + w * 0.1, flagBottomRightY + h * 0.15, colors.bearish, 2, "Ausbruchsrichtung", addInteractive);
      drawText(ctx, "Ausbruch", flagBottomRightX + w * 0.1, flagBottomRightY + h * 0.15 + 10, colors.bearish);
    }
  },
  {
    id: "symmetricalTriangle",
    name: "Symmetrisches Dreieck",
    category: "Bilaterale Muster",
    description: "Ein symmetrisches Dreieck ist ein Chartmuster, bei dem sich zwei konvergierende Trendlinien bilden, wobei die obere abfällt und die untere ansteigt. Es signalisiert eine Konsolidierungsphase mit abnehmender Volatilität und kann sowohl bullisch als auch bärisch ausbrechen.",
    characteristics: [
      "Fallende obere Trendlinie (Widerstand).",
      "Steigende untere Trendlinie (Unterstützung).",
      "Die Linien konvergieren zu einer Spitze (Apex).",
      "Volumen nimmt typischerweise während der Bildung ab und steigt beim Ausbruch stark an."
    ],
    trading: "Ein Ausbruch über die obere Trendlinie ist ein Kaufsignal, ein Ausbruch unter die untere Trendlinie ein Verkaufssignal. Das Kursziel wird oft durch Messen der breitesten Stelle des Dreiecks und Projizieren vom Ausbruchspunkt bestimmt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, *nachdem* die Ausbruchsrichtung mit Volumen bestätigt wurde.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long oder Short nach dem bestätigten Ausbruch aus dem Dreieck. SL: Auf der anderen Seite der Ausbruchslinie, innerhalb des Dreiecks. TP: Höhe des Dreiecks (breiteste Stelle) vom Ausbruchspunkt projiziert.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const apexX = w * 0.9;
      const upperStartY = h * 0.2;
      const lowerStartY = h * 0.8;
      const midY = h * 0.5;
      drawLineWithLabel(ctx, w, h, w * 0.1, upperStartY, apexX, midY, colors.text, 2, "Fallender Widerstand", addInteractive);
      drawLineWithLabel(ctx, w, h, w * 0.1, lowerStartY, apexX, midY, colors.text, 2, "Steigende Unterstützung", addInteractive);
      ctx.beginPath();
      ctx.moveTo(w * 0.12, lowerStartY * 0.98);
      ctx.lineTo(w * 0.25, upperStartY * 1.1);
      ctx.lineTo(w * 0.38, lowerStartY * 0.9);
      ctx.lineTo(w * 0.51, upperStartY * 1.2);
      ctx.lineTo(w * 0.64, lowerStartY * 0.82);
      ctx.lineTo(w * 0.77, midY);
      ctx.strokeStyle = colors.highlight;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawArrow(ctx, apexX * 0.95, midY - h * 0.05, apexX * 0.95, midY - h * 0.2, colors.bullish, 2, "Bullischer Ausbruch", addInteractive);
      drawText(ctx, "Ausbruch?", apexX * 0.95, midY - h * 0.2 - 10, colors.bullish);
      drawArrow(ctx, apexX * 0.95, midY + h * 0.05, apexX * 0.95, midY + h * 0.2, colors.bearish, 2, "Bärischer Ausbruch", addInteractive);
      drawText(ctx, "Ausbruch?", apexX * 0.95, midY + h * 0.2 + 15, colors.bearish);
    }
  },
  {
    id: "rectangle",
    name: "Rechteck (Rectangle)",
    category: "Bilaterale Muster",
    description: "Ein Rechteck ist eine Konsolidierungsformation, die durch zwei parallele horizontale Linien (Unterstützung und Widerstand) begrenzt wird. Der Kurs bewegt sich seitwärts zwischen diesen Linien. Es kann sowohl eine Fortsetzung des vorherigen Trends als auch eine Umkehr signalisieren, abhängig von der Ausbruchsrichtung.",
    characteristics: [
      "Zwei parallele horizontale Trendlinien.",
      "Obere Linie fungiert als Widerstand, untere als Unterstützung.",
      "Der Kurs testet diese Linien mehrmals.",
      "Volumen kann während der Formation abnehmen und beim Ausbruch ansteigen."
    ],
    trading: "Ein Ausbruch über die Widerstandslinie ist ein Kaufsignal. Ein Ausbruch unter die Unterstützungslinie ist ein Verkaufssignal. Das Kursziel wird oft durch die Höhe des Rechtecks bestimmt, projiziert vom Ausbruchspunkt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, *nachdem* die Ausbruchsrichtung mit Volumen bestätigt wurde.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long oder Short nach dem bestätigten Ausbruch aus dem Rechteck. SL: Auf der anderen Seite der Ausbruchslinie, innerhalb des Rechtecks. TP: Höhe des Rechtecks vom Ausbruchspunkt projiziert.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const resistanceY = h * 0.3;
      const supportY = h * 0.7;
      const startX = w * 0.1;
      const endX = w * 0.9;
      drawLineWithLabel(ctx, w, h, startX, resistanceY, endX, resistanceY, colors.text, 2, "Widerstand", addInteractive);
      drawLineWithLabel(ctx, w, h, startX, supportY, endX, supportY, colors.text, 2, "Unterstützung", addInteractive);
      ctx.beginPath();
      ctx.moveTo(startX + w * 0.05, supportY - h * 0.05);
      ctx.lineTo(startX + w * 0.2, resistanceY + h * 0.05);
      ctx.lineTo(startX + w * 0.35, supportY - h * 0.05);
      ctx.lineTo(startX + w * 0.5, resistanceY + h * 0.05);
      ctx.lineTo(startX + w * 0.65, supportY - h * 0.05);
      ctx.lineTo(startX + w * 0.8, resistanceY + h * 0.05);
      ctx.strokeStyle = colors.highlight;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawArrow(ctx, endX * 0.8, resistanceY, endX * 0.8, resistanceY - h * 0.15, colors.bullish, 2, "Bullischer Ausbruch", addInteractive);
      drawText(ctx, "Ausbruch?", endX * 0.8, resistanceY - h * 0.15 - 10, colors.bullish);
      drawArrow(ctx, endX * 0.8, supportY, endX * 0.8, supportY + h * 0.15, colors.bearish, 2, "Bärischer Ausbruch", addInteractive);
      drawText(ctx, "Ausbruch?", endX * 0.8, supportY + h * 0.15 + 15, colors.bearish);
    }
  },
  {
    id: "commonGap",
    name: "Gewöhnliche Lücke (Common Gap)",
    category: "Gap-Typen",
    description: "Eine gewöhnliche Lücke (Area Gap) tritt oft in Handelsspannen oder Bereichen geringer Marktaktivität auf und hat in der Regel keine große prognostische Bedeutung. Sie wird oft relativ schnell wieder geschlossen.",
    characteristics: [
      "Tritt in Konsolidierungsphasen oder trendlosen Märkten auf.",
      "Geringes Volumen bei der Entstehung der Lücke.",
      "Wird häufig geschlossen (Kurs kehrt zurück, um die Lücke zu füllen).",
      "Kein starkes Signal für eine Trendfortsetzung oder -umkehr."
    ],
    trading: "Gewöhnliche Lücken bieten selten klare Handelssignale. Das Schließen der Lücke kann für kurzfristige Trades genutzt werden, ist aber nicht sehr zuverlässig.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Gering für direktionale Trades basierend auf dem Gap selbst. Mittel für Fading-Strategien (Schließen der Lücke), wenn Marktbedingungen dies unterstützen.<br><strong>Tradingeinstieg mit TP und SL:</strong> Fading-Strategie: Short bei Aufwärtslücke nahe dem Hoch der Lücke, Long bei Abwärtslücke nahe dem Tief der Lücke. SL: Jenseits des Gap-Extremums (z.B. Hoch der Kerze vor dem Gap bei Aufwärtslücke). TP: Schließen der Lücke (am anderen Rand des Gaps).",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const bodyHeight = h * 0.1;
      const gapSize = h * 0.08;
      const candleWidth = w * 0.05;
      drawCandle(ctx, w * 0.2, h * 0.5, candleWidth, bodyHeight, colors.gray, "Vorherige Konsolidierung", addInteractive);
      drawCandle(ctx, w * 0.3, h * 0.52, candleWidth, bodyHeight * 0.8, colors.gray, "Vorherige Konsolidierung", addInteractive);
      const firstCandleTop = h * 0.5 - bodyHeight / 2;
      const secondCandleBottom = firstCandleTop - gapSize;
      const secondCandleTop = secondCandleBottom - bodyHeight;
      drawCandle(ctx, w * 0.45, (firstCandleTop + secondCandleBottom) / 2 - bodyHeight * 0.4, candleWidth, bodyHeight * 0.8, colors.gray, "Kerze vor Gap", addInteractive);
      ctx.beginPath();
      ctx.rect(w * 0.52, secondCandleBottom, candleWidth * 2, firstCandleTop - secondCandleBottom);
      ctx.fillStyle = "#4b556333";
      ctx.fill();
      ctx.strokeStyle = "#4b5563";
      ctx.stroke();
      drawText(ctx, "Common Gap", w * 0.52 + candleWidth, firstCandleTop - gapSize / 2, colors.text, "10px");
      drawCandle(ctx, w * 0.62, secondCandleTop + bodyHeight / 2, candleWidth, bodyHeight, colors.gray, "Kerze nach Gap", addInteractive);
      drawCandle(ctx, w * 0.72, h * 0.5, candleWidth, bodyHeight, colors.gray, "Spätere Konsolidierung", addInteractive);
    }
  },
  {
    id: "breakawayGap",
    name: "Ausbruchslücke (Breakaway Gap)",
    category: "Gap-Typen",
    description: "Eine Ausbruchslücke entsteht, wenn der Kurs mit hohem Volumen aus einer Konsolidierungsformation (z.B. Dreieck, Rechteck) oder über/unter ein wichtiges Unterstützungs-/Widerstandsniveau ausbricht. Sie signalisiert oft den Beginn eines neuen Trends.",
    characteristics: [
      "Tritt am Ende einer Konsolidierungsphase oder beim Bruch wichtiger Niveaus auf.",
      "Hohes Volumen bei der Entstehung der Lücke.",
      "Wird seltener geschlossen als Common Gaps.",
      "Starkes Signal für den Beginn eines neuen Trends in Richtung der Lücke."
    ],
    trading: "Ein Kaufsignal (bei Aufwärtslücke) oder Verkaufssignal (bei Abwärtslücke). Die Lücke selbst kann als Unterstützungs- (Aufwärtslücke) oder Widerstandsniveau (Abwärtslücke) dienen, falls der Kurs zurückkehrt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Hoch, besonders wenn von hohem Volumen begleitet.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: In Richtung des Gaps, oft am Eröffnungskurs der Kerze nach dem Gap oder bei einem kleinen Pullback zum Gap-Rand (der nun Unterstützung/Widerstand ist). SL: Innerhalb oder knapp jenseits des Gaps (z.B. Mitte des Gaps oder anderer Rand des Gaps). TP: Basierend auf der Stärke des neuen Trends, oft ein Vielfaches des Risikos oder nächste signifikante Preisstruktur.",
    drawFunction: (ctx, w, h, addInteractive, colors) => {
      const bodyHeight = h * 0.08;
      const gapSize = h * 0.1;
      const candleWidth = w * 0.04;
      drawLine(ctx, w * 0.1, h * 0.6, w * 0.4, h * 0.6, colors.text, 1.5, "Widerstandszone", addInteractive);
      drawCandle(ctx, w * 0.15, h * 0.65, candleWidth, bodyHeight, colors.gray, "", addInteractive);
      drawCandle(ctx, w * 0.25, h * 0.63, candleWidth, bodyHeight, colors.gray, "", addInteractive);
      drawCandle(ctx, w * 0.35, h * 0.66, candleWidth, bodyHeight, colors.gray, "", addInteractive);
      const firstCandleTop = h * 0.6 - bodyHeight / 2;
      const gapBottom = firstCandleTop;
      const gapTop = gapBottom - gapSize;
      const secondCandleBottom = gapTop;
      const secondCandleTop = secondCandleBottom - bodyHeight * 1.5;
      ctx.beginPath();
      ctx.rect(w * 0.45, gapTop, candleWidth * 1.5, gapSize);
      ctx.fillStyle = colors.bullishFill;
      ctx.fill();
      ctx.strokeStyle = colors.bullish;
      ctx.stroke();
      drawText(ctx, "Breakaway Gap", w * 0.45 + candleWidth * 0.75, gapBottom - gapSize / 2, colors.bullish, "10px");
      drawCandle(ctx, w * 0.55, secondCandleTop + (bodyHeight * 1.5) / 2, candleWidth * 1.2, bodyHeight * 1.5, colors.bullish, "Starke Kerze nach Gap", addInteractive);
      drawArrow(ctx, w * 0.65, secondCandleTop, w * 0.85, secondCandleTop - h * 0.2, colors.bullish, 2, "Neuer Aufwärtstrend", addInteractive);
    }
  }
];
