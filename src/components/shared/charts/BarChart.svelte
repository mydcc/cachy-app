<script lang="ts">
  import { Bar } from 'svelte-chartjs';
  import '../../../lib/chartSetup';

  export let data: any;
  export let title: string = '';
  export let horizontal: boolean = false;

  $: options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' as const : 'x' as const,
    plugins: {
      legend: { display: false },
      title: { display: !!title, text: title }
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { display: true } }
    }
  };
</script>

<div class="w-full h-full min-h-[200px]">
  <Bar {data} {options} />
</div>
