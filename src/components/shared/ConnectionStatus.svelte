<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

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
