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
  ChartDataLabels
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
ChartJS.defaults.events = ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'];
