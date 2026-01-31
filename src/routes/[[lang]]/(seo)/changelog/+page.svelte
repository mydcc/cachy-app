<script lang="ts">
  import ContentRenderer from '$lib/components/ContentRenderer.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>{data.title} - Cachy</title>
</svelte:head>

<ContentRenderer content={data.html} />
