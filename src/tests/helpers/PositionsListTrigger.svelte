<script lang="ts">
  import type { OMSPosition } from "../../services/omsTypes";

  let {
    positions = [],
    onclose,
    ontpSl,
    onadd,
  }: {
    positions?: OMSPosition[];
    onclose?: (pos: OMSPosition) => void;
    ontpSl?: (pos: OMSPosition) => void;
    onadd?: (pos: OMSPosition) => void;
  } = $props();
</script>

<!--
  Each probe renders only when its handler arrived, so a test can tell "the
  sidebar decided not to offer this control" from "the button is somewhere
  else in the tree" (FEAT-0023).
-->
{#each positions as pos (pos.positionId)}
  <button
    type="button"
    data-testid="open-close"
    data-position-id={pos.positionId}
    onclick={() => onclose?.(pos)}
  >
    open
  </button>
  {#if ontpSl}
    <button
      type="button"
      data-testid="open-tp-sl"
      data-position-id={pos.positionId}
      onclick={() => ontpSl(pos)}
    >
      tp/sl
    </button>
  {/if}
  {#if onadd}
    <button
      type="button"
      data-testid="open-add"
      data-position-id={pos.positionId}
      onclick={() => onadd(pos)}
    >
      add
    </button>
  {/if}
{/each}
