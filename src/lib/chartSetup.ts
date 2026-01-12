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
  TimeScale
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import ChartDataLabels from 'chartjs-plugin-datalabels';

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
  annotationPlugin,
  ChartDataLabels
);

export async function initZoomPlugin() {
  if (typeof window !== 'undefined') {
    try {
      const plugin = await import('chartjs-plugin-zoom');
      ChartJS.register(plugin.default);
    } catch (err) {
      console.error('Failed to load chartjs-plugin-zoom', err);
    }
  }
}

// Global defaults for dark theme
ChartJS.defaults.color = '#94a3b8'; // text-slate-400
ChartJS.defaults.borderColor = '#334155'; // border-slate-700
ChartJS.defaults.scale.grid.color = '#334155';
