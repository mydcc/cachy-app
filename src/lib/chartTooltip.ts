/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import katex from "katex";
import type { Chart } from "chart.js";

export const getOrCreateTooltip = (chart: Chart) => {
  let tooltipEl = chart.canvas.parentNode?.querySelector("div.chartjs-tooltip");

  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.classList.add("chartjs-tooltip");
    tooltipEl.style.background = "rgba(15, 23, 42, 0.9)"; // slate-900
    tooltipEl.style.borderRadius = "8px";
    tooltipEl.style.color = "white";
    tooltipEl.style.opacity = "1";
    tooltipEl.style.pointerEvents = "none";
    tooltipEl.style.position = "absolute";
    tooltipEl.style.transform = "translate(-50%, 0)";
    tooltipEl.style.transition = "all .1s ease";
    tooltipEl.style.zIndex = "100";
    tooltipEl.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    tooltipEl.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
    tooltipEl.style.backdropFilter = "blur(4px)";
    tooltipEl.style.padding = "8px 12px";
    tooltipEl.style.minWidth = "150px";

    const table = document.createElement("table");
    table.style.margin = "0";

    tooltipEl.appendChild(table);
    chart.canvas.parentNode?.appendChild(tooltipEl);
  }

  return tooltipEl as HTMLElement;
};

export const externalTooltipHandler = (context: { chart: Chart; tooltip: any }) => {
  // Tooltip Element
  const { chart, tooltip } = context;
  const tooltipEl = getOrCreateTooltip(chart);

  // Hide if no tooltip
  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = "0";
    return;
  }

  // Set Text
  if (tooltip.body) {
    const titleLines = tooltip.title || [];
    const bodyLines = tooltip.body.map((b: any) => b.lines);

    const tableHead = document.createElement("thead");

    titleLines.forEach((title: string) => {
      const tr = document.createElement("tr");
      tr.style.borderWidth = "0";
      const th = document.createElement("th");
      th.style.borderWidth = "0";
      th.style.textAlign = "left";
      th.style.fontSize = "12px";
      th.style.fontWeight = "600";
      th.style.color = "#94a3b8"; // text-secondary
      th.style.paddingBottom = "4px";
      th.innerText = title;
      tr.appendChild(th);
      tableHead.appendChild(tr);
    });

    const tableBody = document.createElement("tbody");
    bodyLines.forEach((body: string, i: number) => {
      const colors = tooltip.labelColors[i];

      const span = document.createElement("span");
      span.style.background = colors.backgroundColor;
      span.style.borderColor = colors.borderColor;
      span.style.borderWidth = "2px";
      span.style.marginRight = "8px";
      span.style.height = "10px";
      span.style.width = "10px";
      span.style.display = "inline-block";
      span.style.borderRadius = "2px";

      const tr = document.createElement("tr");
      tr.style.backgroundColor = "inherit";
      tr.style.borderWidth = "0";

      const td = document.createElement("td");
      td.style.borderWidth = "0";
      td.style.fontSize = "13px";
      td.style.fontWeight = "500";
      td.style.display = "flex";
      td.style.alignItems = "center";

      // Check for Math Formula in Data
      // We look for a custom property in the dataset or data point if possible,
      // but standard Chart.js tooltip context is text-based.
      // Strategy: Check if the text matches a known formula key OR contains KaTeX delimiters
      // For now, we assume body is text.

      const text = body[0] as string; // "Label: Value"
      const parts = text.split(":");
      const label = parts[0];
      const value = parts.slice(1).join(":");

      td.appendChild(span);

      const textNode = document.createElement("span");
      textNode.innerText = text;
      td.appendChild(textNode);

      tr.appendChild(td);
      tableBody.appendChild(tr);

      // --- KaTeX Injection ---
      // We check the dataset for a `math` property
      const dataIndex = tooltip.dataPoints[i].dataIndex;
      const datasetIndex = tooltip.dataPoints[i].datasetIndex;
      const dataset = chart.data.datasets[datasetIndex];
      const mathFormula = (dataset as any).mathFormula; // Custom property we will add
      const description = (dataset as any).description; // Description text

      if (mathFormula || description) {
        const mathRow = document.createElement("tr");
        const mathTd = document.createElement("td");
        mathTd.colSpan = 2;
        mathTd.style.paddingTop = "8px";
        mathTd.style.borderTop = "1px solid rgba(255,255,255,0.1)";
        mathTd.style.marginTop = "8px";
        mathTd.style.fontSize = "11px";
        mathTd.style.color = "#cbd5e1"; // slate-300

        if (description) {
            const descDiv = document.createElement("div");
            descDiv.style.marginBottom = "4px";
            descDiv.innerText = description;
            mathTd.appendChild(descDiv);
        }

        if (mathFormula) {
            try {
                const katexContainer = document.createElement("div");
                katexContainer.style.marginTop = "4px";
                katex.render(mathFormula, katexContainer, {
                    throwOnError: false,
                    displayMode: false
                });
                mathTd.appendChild(katexContainer);
            } catch (e) {
                console.warn("KaTeX render error", e);
            }
        }

        mathRow.appendChild(mathTd);
        tableBody.appendChild(mathRow);
      }
    });

    const tableRoot = tooltipEl.querySelector("table");

    // Remove old children
    while (tableRoot?.firstChild) {
      tableRoot.firstChild.remove();
    }

    // Add new children
    tableRoot?.appendChild(tableHead);
    tableRoot?.appendChild(tableBody);
  }

  const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;

  // Display, position, and set styles for font
  tooltipEl.style.opacity = "1";
  tooltipEl.style.left = positionX + tooltip.caretX + "px";
  tooltipEl.style.top = positionY + tooltip.caretY + "px";
  tooltipEl.style.fontFamily = tooltip.options.bodyFont.family;
  tooltipEl.style.padding = tooltip.options.padding + "px " + tooltip.options.padding + "px";
};
