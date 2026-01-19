<script lang="ts">
  import { marketState } from "../../stores/market.svelte";

  let wsStatus = $derived(marketState.connectionStatus);

  // Map status to theme variables
  let statusColor = $derived(
    wsStatus === "connected"
      ? "var(--success-color)"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "var(--warning-color)"
        : "var(--danger-color)",
  );

  // Detailed status text for tooltip
  let statusText = $derived(
    wsStatus === "connected"
      ? "✓ Connected"
      : wsStatus === "connecting"
        ? "⟳ Connecting to Bitunix..."
        : wsStatus === "reconnecting"
          ? "⟳ Reconnecting to Bitunix..."
          : "✗ Waiting for connection...",
  );

  let isAnimated = $derived(wsStatus !== "connected");
</script>

<div
  class="absolute top-2 right-2 md:top-4 md:right-4 flex gap-1 items-center z-50"
>
  <div
    class="rounded-full transition-colors duration-300"
    style="width: 0.382rem; height: 0.382rem; background-color: {statusColor};"
    title="WebSocket: {statusText}"
  ></div>
</div>

<style>
</style>
