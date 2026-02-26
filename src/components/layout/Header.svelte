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
  import { _ } from "../../locales/i18n";
  import { marketState } from "../../stores/market.svelte";
  import { fade } from "svelte/transition";

  // Derived state for connection status
  let status = $derived(marketState.connectionStatus);
  let isConnected = $derived(status === "connected");
  let isReconnecting = $derived(status === "reconnecting" || status === "connecting");
  let isDisconnected = $derived(status === "disconnected");
</script>

{#if !isConnected}
  <div
    class="w-full py-1 text-center text-xs font-bold uppercase tracking-widest transition-colors duration-300 z-50 fixed top-0 left-0"
    class:bg-red-600={isDisconnected}
    class:text-white={isDisconnected}
    class:bg-yellow-500={isReconnecting}
    class:text-black={isReconnecting}
    transition:fade={{ duration: 200 }}
  >
    {#if isReconnecting}
      <span class="flex items-center justify-center gap-2">
        <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {$_("connection.reconnecting")}
      </span>
    {:else}
      <span>{$_("connection.offline")}</span>
    {/if}
  </div>
{/if}

<header class="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]" class:mt-6={!isConnected}>
  <div class="flex items-center gap-4">
    <h1 class="text-lg font-bold text-[var(--text-primary)]">{$_("app.title")}</h1>
    <!-- Add Navigation/Tabs here later -->
  </div>

  <div class="flex items-center gap-4">
    <!-- Status Indicator (Compact) -->
    <div class="flex items-center gap-2 text-xs" title="Connection Status">
      <div class="w-2 h-2 rounded-full"
           class:bg-green-500={isConnected}
           class:bg-yellow-500={isReconnecting}
           class:bg-red-500={isDisconnected}
      ></div>
      <span class="text-[var(--text-secondary)] uppercase font-mono">
        {status}
      </span>
    </div>
  </div>
</header>
