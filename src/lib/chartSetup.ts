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

import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale,
  BarElement,
  ArcElement,
  Filler,
  TimeScale,
  LineController,
  BarController,
  DoughnutController,
  BubbleController,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import ChartDataLabels from "chartjs-plugin-datalabels";

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale,
  BarElement,
  ArcElement,
  Filler,
  TimeScale,
  LineController,
  BarController,
  DoughnutController,
  BubbleController,
  annotationPlugin,
  ChartDataLabels,
);

export async function initZoomPlugin() {
  if (typeof window !== "undefined") {
    try {
      const plugin = await import("chartjs-plugin-zoom");
      ChartJS.register(plugin.default);
    } catch (err) {
      console.error("Failed to load chartjs-plugin-zoom", err);
    }
  }
}

// Global defaults for dark theme
ChartJS.defaults.color = "#94a3b8"; // text-slate-400
ChartJS.defaults.borderColor = "#334155"; // border-slate-700
ChartJS.defaults.scale.grid.color = "#334155";

// Disable datalabels globally by default
ChartJS.defaults.set("plugins.datalabels", {
  display: false,
});

// Configure passive event listeners to prevent scroll-blocking warnings
ChartJS.defaults.events = [
  "mousemove",
  "mouseout",
  "click",
  "touchstart",
  "touchmove",
];
