/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Copyright (C) 2026 MYDCT
 */
import type { ChartPatternDrawFunction, ThemeColors, AddInteractiveElement } from './chartPatterns.types';
import {
  drawLine,
  drawLineWithLabel,
  drawPeak,
  drawTrough,
  drawText,
  drawArrow,
  drawCandle,
  addTooltipToPath,
  drawPatternSeries,
  drawPricePath
} from './chartPatterns.helpers';

export const DRAW_FUNCTIONS: Record<string, ChartPatternDrawFunction> = {
  "headAndShoulders": (ctx, w, h, addInteractive, colors) => {
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
      },
  "inverseHeadAndShoulders": (ctx, w, h, addInteractive, colors) => {
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
      },
  "headAndShouldersTopFailure": (ctx, w, h, addInteractive, colors) => {
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
    },
  "headAndShouldersBottomFailure": (ctx, w, h, addInteractive, colors) => {
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
    },
  "doubleTop": (ctx, w, h, addInteractive, colors) => {
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
      },
  "doubleBottom": (ctx, w, h, addInteractive, colors) => {
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
      },
  "tripleTop": (ctx, w, h, addInteractive, colors) => {
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
      },
  "tripleBottom": (ctx, w, h, addInteractive, colors) => {
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
      },
  "fallingWedge": (ctx, w, h, addInteractive, colors) => {
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
    },
  "risingWedge": (ctx, w, h, addInteractive, colors) => {
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
    },
  "diamondTop": (ctx, w, h, addInteractive, colors) => {
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
    },
  "diamondBottom": (ctx, w, h, addInteractive, colors) => {
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
    },
  "roundingTop": (ctx, w, h, addInteractive, colors) => {
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
    },
  "roundingBottom": (ctx, w, h, addInteractive, colors) => {
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
    },
  "broadeningTop": (ctx, w, h, addInteractive, colors) => {
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
    },
  "broadeningBottom": (ctx, w, h, addInteractive, colors) => {
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
    },
  "islandReversal": (ctx, w, h, addInteractive, colors) => {
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
    },
  "pipeBottom": (ctx, w, h, addInteractive, colors) => {
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
    },
  "pipeTop": (ctx, w, h, addInteractive, colors) => {
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
    },
  "bumpAndRunReversalTop": (ctx, w, h, addInteractive, colors) => {
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
    },
  "bumpAndRunReversalBottom": (ctx, w, h, addInteractive, colors) => {
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
    },
  "spikeTop": (ctx, w, h, addInteractive, colors) => {
      const startX = w * 0.2, startY = h * 0.8;
      const peakX = w * 0.5, peakY = h * 0.1;
      const endX = w * 0.8, endY = h * 0.8;

      drawLineWithLabel(ctx, w, h, startX, startY, peakX, peakY, colors.bearishLight, 2.5, "Steiler Anstieg", addInteractive);
      drawLineWithLabel(ctx, w, h, peakX, peakY, endX, endY, colors.bearish, 2.5, "Steiler Abfall", addInteractive);
      drawText(ctx, "Spike / V-Top", peakX, peakY - 15, colors.highlight);
    },
  "spikeBottom": (ctx, w, h, addInteractive, colors) => {
      const startX = w * 0.2, startY = h * 0.2;
      const troughX = w * 0.5, troughY = h * 0.9;
      const endX = w * 0.8, endY = h * 0.2;

      drawLineWithLabel(ctx, w, h, startX, startY, troughX, troughY, colors.neutral, 2.5, "Steiler Abfall", addInteractive);
      drawLineWithLabel(ctx, w, h, troughX, troughY, endX, endY, colors.bullish, 2.5, "Steiler Anstieg", addInteractive);
      drawText(ctx, "Spike / V-Bottom", troughX, troughY + 15, colors.highlight);
    },
  "threeDrivesTop": (ctx, w, h, addInteractive, colors) => {
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
    },
  "threeDrivesBottom": (ctx, w, h, addInteractive, colors) => {
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
    },
  "hornTop": (ctx, w, h, addInteractive, colors) => {
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
    },
  "hornBottom": (ctx, w, h, addInteractive, colors) => {
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
    },
  "eveAdamTop": (ctx, w, h, addInteractive, colors) => {
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
    },
  "eveAdamBottom": (ctx, w, h, addInteractive, colors) => {
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
    },
  "invertedCupAndHandleReversal": (ctx, w, h, addInteractive, colors) => {
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
    },
  "symmetricalTriangleContinuationBullish": (ctx, w, h, addInteractive, colors) => {
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
    },
  "symmetricalTriangleContinuationBearish": (ctx, w, h, addInteractive, colors) => {
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
    },
  "cupAndHandle": (ctx, w, h, addInteractive, colors) => {
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
    },
  "invertedCupAndHandleContinuation": (ctx, w, h, addInteractive, colors) => {
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
    },
  "bullishPennant": (ctx, w, h, addInteractive, colors) => {
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
    },
  "bearishPennant": (ctx, w, h, addInteractive, colors) => {
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
    },
  "ascendingChannel": (ctx, w, h, addInteractive, colors) => {
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
    },
  "descendingChannel": (ctx, w, h, addInteractive, colors) => {
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
    },
  "rectangleContinuationBullish": (ctx, w, h, addInteractive, colors) => {
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
    },
  "rectangleContinuationBearish": (ctx, w, h, addInteractive, colors) => {
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
    },
  "deadCatBounce": (ctx, w, h, addInteractive, colors) => {
      const startX = w * 0.1, startY = h * 0.15;
      const firstDropX = w * 0.35, firstDropY = h * 0.7;
      const bouncePeakX = w * 0.55, bouncePeakY = h * 0.5;
      const finalDropX = w * 0.8, finalDropY = h * 0.85;

      drawLineWithLabel(ctx, w, h, startX, startY, firstDropX, firstDropY, colors.bearish, 2.5, "Starker Abverkauf", addInteractive);
      drawLineWithLabel(ctx, w, h, firstDropX, firstDropY, bouncePeakX, bouncePeakY, colors.bullishLight, 2, "Bounce", addInteractive);
      drawText(ctx, "Bounce", bouncePeakX, bouncePeakY - 10, colors.bullishLight);
      drawLineWithLabel(ctx, w, h, bouncePeakX, bouncePeakY, finalDropX, finalDropY, colors.bearish, 2.5, "Weiterer Abfall", addInteractive);
    },
  "runawayGap": (ctx, w, h, addInteractive, colors) => {
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
    },
  "exhaustionGap": (ctx, w, h, addInteractive, colors) => {
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
    },
};
