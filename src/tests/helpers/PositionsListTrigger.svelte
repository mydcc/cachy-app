<script lang="ts">
  import type { OMSPosition } from "../../services/omsTypes";

  let {
    positions = [],
    onclose,
  }: {
    positions?: OMSPosition[];
    onclose?: (pos: OMSPosition) => void;
  } = $props();
</script>

{#each positions as pos (pos.positionId)}
  <button
    type="button"
    data-testid="open-close"
    data-position-id={pos.positionId}
    onclick={() => onclose?.(pos)}
  >
    open
  </button>
{/each}
