<script lang="ts">
  import { wsStatusStore } from "../../stores/marketStore";
  import { onMount, onDestroy } from "svelte";

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
        ? "⟳ Connecting..."
        : wsStatus === "reconnecting"
          ? "⟳ Reconnecting..."
          : "✗ Disconnected",
  );

  // Listen to browser online/offline events
  let handleOnline: (() => void) | undefined;
  let handleOffline: (() => void) | undefined;

  onMount(() => {
    handleOnline = () => {
      // Browser is back online - connection will auto-reconnect
    };

    handleOffline = () => {
      // Browser went offline - immediately show disconnected
      wsStatusStore.set("disconnected");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  });

  onDestroy(() => {
    if (handleOnline) window.removeEventListener("online", handleOnline);
    if (handleOffline) window.removeEventListener("offline", handleOffline);
  });
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
