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
  TimeScale
);

// Global defaults for dark theme
ChartJS.defaults.color = '#94a3b8'; // text-slate-400
ChartJS.defaults.borderColor = '#334155'; // border-slate-700
ChartJS.defaults.scale.grid.color = '#334155';
