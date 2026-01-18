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

  // Detailed status text for tooltip
  let statusText = $derived(
    wsStatus === "connected"
      ? "✓ Connected"
      : wsStatus === "connecting"
        ? "⟳ Connecting to Bitunix..."
        : wsStatus === "reconnecting"
          ? "⟳ Reconnecting to Bitunix..."
          : "✗ Disconnected",
  );

  let isAnimated = $derived(wsStatus !== "connected");
</script>

<div
  class="absolute top-2 right-2 md:top-4 md:right-4 flex gap-1 items-center z-50"
>
  <div
    class="rounded-full transition-colors duration-300 {isAnimated
      ? 'animate-pulse'
      : ''}"
    style="width: 0.382rem; height: 0.382rem; background-color: {statusColor};"
    title="WebSocket: {statusText}"
  ></div>
</div>

<style>
  @keyframes pulse {
    0% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7);
    }
    70% {
      transform: scale(1.1);
      box-shadow: 0 0 0 5px rgba(255, 255, 255, 0);
    }
    100% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
    }
  }

  .animate-pulse {
    animation: pulse 1.5s infinite;
  }
</style>
