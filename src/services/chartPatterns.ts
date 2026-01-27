
import { browser } from "$app/environment";

export interface ChartPattern {
    id: string;
    name: string; // Fallback or key
    type: "Umkehrmuster" | "Fortsetzungsmuster" | "Bilaterale Muster" | "Gap-Typen" | "Favoriten";
    // Text content is handled via i18n keys: chartPatterns.{id}.{description|characteristics|trading|...}
    drawFunction: (ctx: CanvasRenderingContext2D, w: number, h: number, addTooltip: (path: Path2D | null, text: string) => void) => void;
}

// Helper for resolving colors (same as CandlestickChart)
const resolveColor = (varName: string, fallback: string = "#000000") => {
    if (!browser) return fallback;
    let val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!val) return fallback;
    if (!val.startsWith("var(") && !val.includes("var(")) return val;
    try {
        const temp = document.createElement("div");
        temp.style.display = "none";
        temp.style.backgroundColor = `var(${varName})`;
        document.body.appendChild(temp);
        const resolved = getComputedStyle(temp).backgroundColor;
        document.body.removeChild(temp);
        return resolved || fallback;
    } catch (e) {
        return fallback;
    }
};

// Drawing Primitives adapted for Chart.js context
// We use a closure or class to manage theme colors to avoid resolving them every frame if possible,
// but for now we'll resolve inside to ensure responsiveness to theme changes.

const getThemeColors = () => ({
    text: resolveColor("--text-secondary", "#9ca3af"),
    grid: resolveColor("--border-color", "#374151"),
    bull: resolveColor("--success-color", "#22c55e"),
    bear: resolveColor("--danger-color", "#ef4444"),
    neutral: resolveColor("--text-tertiary", "#6b7280"),
    accent: resolveColor("--accent-color", "#60a5fa"),
    highlight: resolveColor("--warning-color", "#fde047")
});

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number, tooltipText: string, addTooltip: any) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    if (tooltipText && addTooltip) {
        const path = new Path2D();
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        // Create a hit area around the line center
        path.rect(midX - 20, midY - 20, 40, 40);
        addTooltip(path, tooltipText);
    }
}

function drawLineWithLabel(ctx: CanvasRenderingContext2D, w: number, h: number, x1: number, y1: number, x2: number, y2: number, color: string, width: number, label: string, addTooltip: any) {
    drawLine(ctx, x1, y1, x2, y2, color, width, label, addTooltip);
    if (label) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.save();
        ctx.translate(midX, midY);
        ctx.textAlign = "center";
        ctx.fillStyle = color;
        // Simple offset logic
        let offsetX = 0;
        let offsetY = -15;
        // Adjust based on slope to avoid overlapping line
        if (Math.abs(Math.sin(angle)) > 0.5) {
             offsetX = 15; offsetY = 0;
        }
        drawText(ctx, label, offsetX, offsetY, color, "10px");
        ctx.restore();
    }
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = "12px") {
    ctx.fillStyle = color;
    ctx.font = `${size} Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(text, x, y);
}

function drawArrow(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string, width: number, tooltipText: string, addTooltip: any) {
    const headLength = 10;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();

    const path = new Path2D();
    path.moveTo(toX, toY);
    path.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
    path.moveTo(toX, toY);
    path.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.stroke(path);

    if (tooltipText && addTooltip) {
        const hitPath = new Path2D();
        hitPath.rect(toX - 15, toY - 15, 30, 30);
        addTooltip(hitPath, tooltipText);
    }
}

function drawCandle(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, tooltipText: string, addTooltip: any) {
    const top = y - height / 2;
    ctx.beginPath();
    ctx.fillStyle = color;
    // Rounded corners for consistency with CandlestickChart
    ctx.roundRect(x - width / 2, top, width, height, 2);
    ctx.fill();
    if (tooltipText && addTooltip) {
        const path = new Path2D();
        path.rect(x - width / 2, top, width, height);
        addTooltip(path, tooltipText);
    }
}

function drawPeak(ctx: CanvasRenderingContext2D, centerX: number, peakY: number, width: number, baseY: number, color: string, tooltipText: string, addTooltip: any) {
    const halfWidth = width / 2;
    ctx.beginPath();
    ctx.moveTo(centerX - halfWidth, baseY);
    ctx.lineTo(centerX, peakY);
    ctx.lineTo(centerX + halfWidth, baseY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (tooltipText && addTooltip) {
        const path = new Path2D();
        path.moveTo(centerX - halfWidth, baseY);
        path.lineTo(centerX, peakY);
        path.lineTo(centerX + halfWidth, baseY);
        path.closePath();
        addTooltip(path, tooltipText);
    }
}

function drawTrough(ctx: CanvasRenderingContext2D, centerX: number, troughY: number, width: number, baseY: number, color: string, tooltipText: string, addTooltip: any) {
    const halfWidth = width / 2;
    ctx.beginPath();
    ctx.moveTo(centerX - halfWidth, baseY);
    ctx.lineTo(centerX, troughY);
    ctx.lineTo(centerX + halfWidth, baseY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (tooltipText && addTooltip) {
        const path = new Path2D();
        path.moveTo(centerX - halfWidth, baseY);
        path.lineTo(centerX, troughY);
        path.lineTo(centerX + halfWidth, baseY);
        path.closePath();
        addTooltip(path, tooltipText);
    }
}

export const CHART_PATTERNS: ChartPattern[] = [
    // Umkehrmuster (Reversal Patterns)
    {
        id: "headAndShoulders",
        name: "SKS (Schulter-Kopf-Schulter)",
        type: "Umkehrmuster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const neckY = h * 0.6;
            drawLine(ctx, w * 0.1, neckY, w * 0.9, neckY, c.text, 2, "Nackenlinie", addTooltip);
            drawPeak(ctx, w * 0.25, h * 0.4, w * 0.15, neckY, c.accent, "Linke Schulter", addTooltip);
            drawPeak(ctx, w * 0.5, h * 0.2, w * 0.2, neckY, c.bear, "Kopf", addTooltip);
            drawPeak(ctx, w * 0.75, h * 0.45, w * 0.15, neckY, c.accent, "Rechte Schulter", addTooltip);
            drawText(ctx, "L", w * 0.25, h * 0.38, c.highlight);
            drawText(ctx, "Kopf", w * 0.5, h * 0.18, c.highlight);
            drawText(ctx, "R", w * 0.75, h * 0.43, c.highlight);
            drawArrow(ctx, w * 0.8, neckY, w * 0.8, neckY + h * 0.2, c.bear, 2, "Ausbruchsrichtung", addTooltip);
        }
    },
    {
        id: "inverseHeadAndShoulders",
        name: "Inverse SKS (iSKS)",
        type: "Umkehrmuster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const neckY = h * 0.4;
            drawLine(ctx, w * 0.1, neckY, w * 0.9, neckY, c.text, 2, "Nackenlinie", addTooltip);
            drawTrough(ctx, w * 0.25, h * 0.6, w * 0.15, neckY, c.accent, "Linke Schulter", addTooltip);
            drawTrough(ctx, w * 0.5, h * 0.8, w * 0.2, neckY, c.bull, "Kopf", addTooltip);
            drawTrough(ctx, w * 0.75, h * 0.55, w * 0.15, neckY, c.accent, "Rechte Schulter", addTooltip);
            drawText(ctx, "L", w * 0.25, h * 0.62, c.highlight);
            drawText(ctx, "Kopf", w * 0.5, h * 0.82, c.highlight);
            drawText(ctx, "R", w * 0.75, h * 0.57, c.highlight);
            drawArrow(ctx, w * 0.8, neckY, w * 0.8, neckY - h * 0.2, c.bull, 2, "Ausbruchsrichtung", addTooltip);
        }
    },
    {
        id: "doubleTop",
        name: "Doppeltop",
        type: "Umkehrmuster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const supportY = h * 0.7;
            const peakY = h * 0.3;
            drawLine(ctx, w * 0.1, supportY, w * 0.9, supportY, c.text, 2, "Unterstützungslinie", addTooltip);
            drawPeak(ctx, w * 0.3, peakY, w * 0.2, supportY, c.accent, "Erstes Hoch", addTooltip);
            drawPeak(ctx, w * 0.7, peakY, w * 0.2, supportY, c.accent, "Zweites Hoch", addTooltip);
            drawText(ctx, "Top 1", w * 0.3, peakY - 10, c.highlight);
            drawText(ctx, "Top 2", w * 0.7, peakY - 10, c.highlight);
            drawArrow(ctx, w * 0.6, supportY, w * 0.6, supportY + h * 0.2, c.bear, 2, "Ausbruch", addTooltip);
        }
    },
    {
        id: "doubleBottom",
        name: "Doppelboden",
        type: "Umkehrmuster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const resistanceY = h * 0.3;
            const troughY = h * 0.7;
            drawLine(ctx, w * 0.1, resistanceY, w * 0.9, resistanceY, c.text, 2, "Widerstandslinie", addTooltip);
            drawTrough(ctx, w * 0.3, troughY, w * 0.2, resistanceY, c.accent, "Erstes Tief", addTooltip);
            drawTrough(ctx, w * 0.7, troughY, w * 0.2, resistanceY, c.accent, "Zweites Tief", addTooltip);
            drawText(ctx, "Tief 1", w * 0.3, troughY + 20, c.highlight);
            drawText(ctx, "Tief 2", w * 0.7, troughY + 20, c.highlight);
            drawArrow(ctx, w * 0.6, resistanceY, w * 0.6, resistanceY - h * 0.2, c.bull, 2, "Ausbruch", addTooltip);
        }
    },
    {
        id: "tripleTop",
        name: "Dreifachtop",
        type: "Umkehrmuster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const supportY = h * 0.7;
            const peakY = h * 0.3;
            drawLine(ctx, w * 0.1, supportY, w * 0.9, supportY, c.text, 2, "Unterstützung", addTooltip);
            drawPeak(ctx, w * 0.2, peakY, w * 0.15, supportY, c.accent, "Hoch 1", addTooltip);
            drawPeak(ctx, w * 0.5, peakY, w * 0.15, supportY, c.accent, "Hoch 2", addTooltip);
            drawPeak(ctx, w * 0.8, peakY, w * 0.15, supportY, c.accent, "Hoch 3", addTooltip);
            drawArrow(ctx, w * 0.7, supportY, w * 0.7, supportY + h * 0.2, c.bear, 2, "Ausbruch", addTooltip);
        }
    },
    {
        id: "tripleBottom",
        name: "Dreifachboden",
        type: "Umkehrmuster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const resistanceY = h * 0.3;
            const troughY = h * 0.7;
            drawLine(ctx, w * 0.1, resistanceY, w * 0.9, resistanceY, c.text, 2, "Widerstand", addTooltip);
            drawTrough(ctx, w * 0.2, troughY, w * 0.15, resistanceY, c.accent, "Tief 1", addTooltip);
            drawTrough(ctx, w * 0.5, troughY, w * 0.15, resistanceY, c.accent, "Tief 2", addTooltip);
            drawTrough(ctx, w * 0.8, troughY, w * 0.15, resistanceY, c.accent, "Tief 3", addTooltip);
            drawArrow(ctx, w * 0.7, resistanceY, w * 0.7, resistanceY - h * 0.2, c.bull, 2, "Ausbruch", addTooltip);
        }
    },
    {
        id: "fallingWedge",
        name: "Fallender Keil",
        type: "Umkehrmuster", // Also continuation, but mostly reversal
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const startX = w * 0.1, endX = w * 0.9;
            const startResY = h * 0.2, endResY = h * 0.6;
            const startSupY = h * 0.4, endSupY = h * 0.7;

            drawLineWithLabel(ctx, w, h, startX, startResY, endX, endResY, c.text, 2, "Widerstand", addTooltip);
            drawLineWithLabel(ctx, w, h, startX, startSupY, endX, endSupY, c.text, 2, "Unterstützung", addTooltip);

            ctx.beginPath();
            ctx.moveTo(startX + w * 0.05, startResY + h * 0.02);
            ctx.lineTo(startX + w * 0.2, startSupY + h * 0.05);
            ctx.lineTo(startX + w * 0.35, ((startResY + endResY) / 2) * 0.9);
            ctx.lineTo(startX + w * 0.5, ((startSupY + endSupY) / 2) * 1.05);
            ctx.lineTo(startX + w * 0.65, endResY * 0.95);
            ctx.strokeStyle = c.accent;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            drawArrow(ctx, endX * 0.9, endResY, endX * 0.9, endResY - h * 0.2, c.bull, 2, "Ausbruch", addTooltip);
        }
    },
    {
        id: "risingWedge",
        name: "Steigender Keil",
        type: "Umkehrmuster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const startX = w * 0.1, endX = w * 0.9;
            const startSupY = h * 0.8, endSupY = h * 0.4;
            const startResY = h * 0.6, endResY = h * 0.3;

            drawLineWithLabel(ctx, w, h, startX, startSupY, endX, endSupY, c.text, 2, "Unterstützung", addTooltip);
            drawLineWithLabel(ctx, w, h, startX, startResY, endX, endResY, c.text, 2, "Widerstand", addTooltip);

            ctx.beginPath();
            ctx.moveTo(startX + w * 0.05, startSupY - h * 0.02);
            ctx.lineTo(startX + w * 0.2, startResY - h * 0.05);
            ctx.lineTo(startX + w * 0.35, ((startSupY + endSupY) / 2) * 1.1);
            ctx.lineTo(startX + w * 0.5, ((startResY + endResY) / 2) * 0.95);
            ctx.lineTo(startX + w * 0.65, endSupY * 1.05);
            ctx.strokeStyle = c.accent;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            drawArrow(ctx, endX * 0.9, endSupY, endX * 0.9, endSupY + h * 0.2, c.bear, 2, "Ausbruch", addTooltip);
        }
    },
    {
        id: "ascendingTriangle",
        name: "Aufsteigendes Dreieck",
        type: "Fortsetzungsmuster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const resY = h * 0.3;
            const startSupY = h * 0.8;
            const meetingX = w * 0.85;

            drawLine(ctx, w * 0.1, resY, meetingX, resY, c.text, 2, "Widerstand", addTooltip);
            drawLine(ctx, w * 0.1, startSupY, meetingX, resY, c.text, 2, "Unterstützung", addTooltip);

            ctx.beginPath();
            ctx.moveTo(w * 0.12, startSupY * 0.98);
            ctx.lineTo(w * 0.25, resY * 1.05);
            ctx.lineTo(w * 0.38, startSupY * 0.85);
            ctx.lineTo(w * 0.51, resY * 1.05);
            ctx.lineTo(w * 0.64, startSupY * 0.72);
            ctx.lineTo(w * 0.77, resY * 1.05);
            ctx.strokeStyle = c.accent;
            ctx.lineWidth = 2;
            ctx.stroke();

            drawArrow(ctx, meetingX * 0.95, resY, meetingX * 0.95, resY - h * 0.15, c.bull, 2, "Ausbruch", addTooltip);
        }
    },
    {
        id: "descendingTriangle",
        name: "Absteigendes Dreieck",
        type: "Fortsetzungsmuster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const supY = h * 0.7;
            const startResY = h * 0.2;
            const meetingX = w * 0.85;

            drawLine(ctx, w * 0.1, supY, meetingX, supY, c.text, 2, "Unterstützung", addTooltip);
            drawLine(ctx, w * 0.1, startResY, meetingX, supY, c.text, 2, "Widerstand", addTooltip);

            ctx.beginPath();
            ctx.moveTo(w * 0.12, startResY * 1.05);
            ctx.lineTo(w * 0.25, supY * 0.95);
            ctx.lineTo(w * 0.38, startResY * 1.3);
            ctx.lineTo(w * 0.51, supY * 0.95);
            ctx.lineTo(w * 0.64, startResY * 1.5);
            ctx.lineTo(w * 0.77, supY * 0.95);
            ctx.strokeStyle = c.accent;
            ctx.lineWidth = 2;
            ctx.stroke();

            drawArrow(ctx, meetingX * 0.95, supY, meetingX * 0.95, supY + h * 0.15, c.bear, 2, "Ausbruch", addTooltip);
        }
    },
    {
        id: "symmetricalTriangle",
        name: "Symmetrisches Dreieck",
        type: "Bilaterale Muster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const apexX = w * 0.9;
            const upperStartY = h * 0.2;
            const lowerStartY = h * 0.8;
            const midY = h * 0.5;

            drawLine(ctx, w * 0.1, upperStartY, apexX, midY, c.text, 2, "Widerstand", addTooltip);
            drawLine(ctx, w * 0.1, lowerStartY, apexX, midY, c.text, 2, "Unterstützung", addTooltip);

            ctx.beginPath();
            ctx.moveTo(w * 0.12, lowerStartY * 0.98);
            ctx.lineTo(w * 0.25, upperStartY * 1.1);
            ctx.lineTo(w * 0.38, lowerStartY * 0.9);
            ctx.lineTo(w * 0.51, upperStartY * 1.2);
            ctx.lineTo(w * 0.64, lowerStartY * 0.82);
            ctx.lineTo(w * 0.77, midY);
            ctx.strokeStyle = c.highlight;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            drawArrow(ctx, apexX * 0.95, midY - h * 0.05, apexX * 0.95, midY - h * 0.2, c.bull, 2, "Long", addTooltip);
            drawArrow(ctx, apexX * 0.95, midY + h * 0.05, apexX * 0.95, midY + h * 0.2, c.bear, 2, "Short", addTooltip);
        }
    },
    {
        id: "rectangle",
        name: "Rechteck",
        type: "Bilaterale Muster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const resY = h * 0.3;
            const supY = h * 0.7;
            const startX = w * 0.1;
            const endX = w * 0.9;

            drawLine(ctx, startX, resY, endX, resY, c.text, 2, "Widerstand", addTooltip);
            drawLine(ctx, startX, supY, endX, supY, c.text, 2, "Unterstützung", addTooltip);

            ctx.beginPath();
            ctx.moveTo(startX + w * 0.05, supY - h * 0.05);
            ctx.lineTo(startX + w * 0.2, resY + h * 0.05);
            ctx.lineTo(startX + w * 0.35, supY - h * 0.05);
            ctx.lineTo(startX + w * 0.5, resY + h * 0.05);
            ctx.lineTo(startX + w * 0.65, supY - h * 0.05);
            ctx.lineTo(startX + w * 0.8, resY + h * 0.05);
            ctx.strokeStyle = c.highlight;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            drawArrow(ctx, endX * 0.8, resY, endX * 0.8, resY - h * 0.15, c.bull, 2, "Long", addTooltip);
            drawArrow(ctx, endX * 0.8, supY, endX * 0.8, supY + h * 0.15, c.bear, 2, "Short", addTooltip);
        }
    },
    {
        id: "cupAndHandle",
        name: "Tasse mit Henkel",
        type: "Fortsetzungsmuster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            const cupRimY = h * 0.3;
            const cupBottomY = h * 0.7;
            const cupWidth = w * 0.6;
            const cupCenterX = w * 0.4;

            ctx.beginPath();
            ctx.moveTo(cupCenterX - cupWidth / 2, cupRimY);
            ctx.quadraticCurveTo(cupCenterX, cupBottomY + h * 0.1, cupCenterX + cupWidth / 2, cupRimY);
            ctx.strokeStyle = c.accent;
            ctx.lineWidth = 2;
            ctx.stroke();

            drawLine(ctx, cupCenterX - cupWidth / 2, cupRimY, cupCenterX + cupWidth / 2 + w * 0.15, cupRimY, c.text, 1.5, "Widerstand", addTooltip);

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
            ctx.strokeStyle = c.highlight;
            ctx.lineWidth = 2;
            ctx.stroke();

            drawArrow(ctx, handleEndX, cupRimY, handleEndX + w * 0.1, cupRimY - h * 0.15, c.bull, 2, "Ausbruch", addTooltip);
        }
    },
    {
        id: "flagBull",
        name: "Bullische Flagge",
        type: "Fortsetzungsmuster",
        drawFunction: (ctx, w, h, addTooltip) => {
            const c = getThemeColors();
            // Flaggenmast
            drawLine(ctx, w * 0.2, h * 0.9, w * 0.2, h * 0.2, c.bull, 3, "Flaggenmast", addTooltip);

            // Flagge
            const flagStartX = w * 0.2;
            const flagStartY = h * 0.2;
            const flagEndX = w * 0.5;
            const flagEndY = h * 0.3;
            const height = h * 0.2;

            drawLine(ctx, flagStartX, flagStartY, flagEndX, flagEndY, c.text, 2, "Oben", addTooltip);
            drawLine(ctx, flagStartX, flagStartY + height, flagEndX, flagEndY + height, c.text, 2, "Unten", addTooltip);

            ctx.beginPath();
            ctx.moveTo(flagStartX, flagStartY);
            ctx.lineTo(flagEndX, flagEndY);
            ctx.lineTo(flagEndX, flagEndY + height);
            ctx.lineTo(flagStartX, flagStartY + height);
            ctx.closePath();
            ctx.fillStyle = addOpacity(c.accent, 0.1);
            ctx.fill();

            drawArrow(ctx, flagEndX, flagEndY, flagEndX + w * 0.1, flagEndY - h * 0.15, c.bull, 2, "Ausbruch", addTooltip);
        }
    }
];

// Helper to convert hex/rgb to rgba with opacity
function addOpacity(color: string, opacity: number): string {
    if (!color) return `rgba(0,0,0,${opacity})`;
    if (color.startsWith('rgb')) {
        if (color.startsWith('rgba')) return color;
        return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
    }
    if (color.startsWith('#')) {
        let hex = color.substring(1);
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return color;
}
