<script lang="ts">
  import { Doughnut } from 'svelte-chartjs';
  import '../../../lib/chartSetup';
  import Tooltip from '../Tooltip.svelte';

  export let data: any;
  export let title: string = '';
  export let description: string = '';

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' as const },
      title: { display: !!title, text: title }
    }
  };
</script>

<div class="w-full h-full min-h-[200px] relative">
  {#if description}
    <div class="absolute top-[-10px] right-[-10px] z-10 p-2">
       <Tooltip text={description} />
    </div>
  {/if}
  <Doughnut {data} {options} />
</div>
