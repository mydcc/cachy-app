<script lang="ts">
  import { untrack } from "svelte";
  import ClosePositionModal from "../../components/shared/ClosePositionModal.svelte";
  import type { OMSPosition } from "../../services/omsTypes";

  let { initialPosition }: { initialPosition: OMSPosition } = $props();

  let position = $state<OMSPosition>(untrack(() => initialPosition));

  /** Simulate the parent re-reading a live position (same identity, new price). */
  export function refresh(next: OMSPosition) {
    position = next;
  }
</script>

<ClosePositionModal {position} onclose={() => {}} onsuccess={() => {}} />
