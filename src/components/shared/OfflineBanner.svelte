<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { marketState } from "../../stores/market.svelte";
  import { _ } from "../../locales/i18n";
  import { icons } from "../../lib/constants";

  let isOffline = $state(false);
  let showBanner = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Monitor navigator online/offline
  function updateOnlineStatus() {
    isOffline = !navigator.onLine;
  }

  $effect(() => {
    // Check both browser network and WebSocket status
    const isDisconnected = isOffline || marketState.connectionStatus === "disconnected";

    if (isDisconnected) {
      if (!timer && !showBanner) {
        timer = setTimeout(() => {
          showBanner = true;
        }, 5000); // 5s grace period
      }
    } else {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      showBanner = false;
    }
  });

  onMount(() => {
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      if (timer) clearTimeout(timer);
    };
  });
</script>

{#if showBanner}
  <div
    class="fixed bottom-0 left-0 w-full z-[9999] bg-[var(--danger-color)] text-white font-bold py-3 px-4 text-center shadow-[0_-4px_10px_rgba(0,0,0,0.3)] border-t border-white/20 backdrop-blur-md bg-opacity-90 flex items-center justify-center gap-3 animate-pulse"
    transition:fade={{ duration: 300 }}
    role="alert"
  >
    <div class="p-1 bg-white/20 rounded-full">
      {@html icons.alert || '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'}
    </div>
    <span>{$_("app.offlineMessage") || "Connection Lost - Trading functionality may be limited."}</span>

    <button
      class="ml-4 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs transition-colors"
      onclick={() => window.location.reload()}
    >
      {$_("app.refresh") || "Refresh"}
    </button>
  </div>
{/if}
