<script lang="ts">
  import { Doughnut } from 'svelte-chartjs';
  import '../../../lib/chartSetup';

  export let data: any;
  export let title: string = '';

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' as const },
      title: { display: !!title, text: title }
    }
  };
</script>

<div class="w-full h-full min-h-[200px]">
  <Doughnut {data} {options} />
</div>
