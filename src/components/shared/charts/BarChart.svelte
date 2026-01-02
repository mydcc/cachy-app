<script lang="ts">
  import { Bar } from 'svelte-chartjs';
  import '../../../lib/chartSetup';
  import Tooltip from '../Tooltip.svelte';

  export let data: any;
  export let title: string = '';
  export let horizontal: boolean = false;
  export let description: string = '';

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

<div class="w-full h-full min-h-[200px] relative">
  {#if description}
    <div class="absolute top-[-10px] right-[-10px] z-10 p-2">
       <Tooltip text={description} />
    </div>
  {/if}
  <Bar {data} {options} />
</div>
