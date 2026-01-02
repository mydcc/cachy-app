<script lang="ts">
  import { Line } from 'svelte-chartjs';
  import '../../../lib/chartSetup';

  export let data: any;
  export let title: string = '';
  export let yLabel: string = '';

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: !!title, text: title }
    },
    scales: {
      x: {
        grid: { display: false }
      },
      y: {
        title: { display: !!yLabel, text: yLabel }
      }
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
  };
</script>

<div class="w-full h-full min-h-[200px]">
  <Line {data} {options} />
</div>
