<script lang="ts">
  import type { OMSPosition } from "../../services/omsTypes";

  let { position }: { position?: OMSPosition | null } = $props();
</script>

<span data-testid="probe-symbol">{position?.symbol ?? "none"}</span>
<span data-testid="probe-pnl">{position?.unrealizedPnl?.toString() ?? "none"}</span>
<span data-testid="probe-mark">{position?.markPrice?.toString() ?? "none"}</span>
