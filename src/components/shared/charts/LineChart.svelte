<script lang="ts">
  import { Line } from 'svelte-chartjs';
  import '../../../lib/chartSetup';
  import Tooltip from '../Tooltip.svelte';
  import type { ChartOptions } from 'chart.js';

  export let data: any;
  export let title: string = '';
  export let yLabel: string = '';
  export let description: string = '';

  const options: ChartOptions<'line'> = {
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

<div class="w-full h-full min-h-[200px] relative">
  {#if description}
    <div class="absolute top-[-10px] right-[-10px] z-10 p-2">
       <Tooltip text={description} />
    </div>
  {/if}
  <Line {data} {options} />
</div>
