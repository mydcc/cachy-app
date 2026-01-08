<script lang="ts">
  import { Doughnut } from 'svelte-chartjs';
  import '../../../lib/chartSetup';
  import Tooltip from '../Tooltip.svelte';

  export let data: any;
  export let title: string = '';
  export let description: string = '';
  export let options: any = {};

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' as const },
      title: { display: !!title, text: title }
    }
  };

  $: mergedOptions = {
    ...defaultOptions,
    ...options,
    plugins: {
      ...defaultOptions.plugins,
      ...(options.plugins || {}),
      legend: {
        ...defaultOptions.plugins.legend,
        ...(options.plugins?.legend || {})
      },
      title: {
        ...defaultOptions.plugins.title,
        ...(options.plugins?.title || {})
      }
    }
  };
</script>

<div class="w-full h-full min-h-[200px] relative">
  {#if description}
    <div class="absolute bottom-[-10px] left-[-10px] z-10 p-2">
       <Tooltip text={description} />
    </div>
  {/if}
  <Doughnut {data} options={mergedOptions} />
</div>
