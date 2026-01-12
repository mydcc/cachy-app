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
import zoomPlugin from 'chartjs-plugin-zoom';
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
  zoomPlugin,
  ChartDataLabels
);

// Global defaults for dark theme
ChartJS.defaults.color = '#94a3b8'; // text-slate-400
ChartJS.defaults.borderColor = '#334155'; // border-slate-700
ChartJS.defaults.scale.grid.color = '#334155';
