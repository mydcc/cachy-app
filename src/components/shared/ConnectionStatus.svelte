<script lang="ts">
  import { wsStatusStore } from "../../stores/marketStore";

  let wsStatus = $derived($wsStatusStore);

  // Map status to theme variables
  let statusColor = $derived(
    wsStatus === "connected"
      ? "var(--success-color)"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "var(--warning-color)"
        : "var(--danger-color)",
  );
</script>

<div
  class="absolute top-4 right-4 flex gap-1 items-center z-50 pointer-events-none"
>
  <div
    class="rounded-full transition-colors duration-300"
    style="width: 0.382rem; height: 0.382rem; background-color: {statusColor};"
    title="Real-time Connection: {wsStatus}"
  ></div>
</div>
