<script lang="ts">
  import DOMPurify from "dompurify";

  interface Props {
    data: string;
    class?: string;
    size?: string;
  }

  let { data, class: className = "", size = "16" }: Props = $props();
</script>

<span class="cachy-icon {className}" style="width: {size}px; height: {size}px;">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html DOMPurify.sanitize(data)}
</span>

<style>
  .cachy-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }

  /* Ensure SVG fills the wrapper */
  :global(.cachy-icon svg) {
    width: 100%;
    height: 100%;
  }
</style>
