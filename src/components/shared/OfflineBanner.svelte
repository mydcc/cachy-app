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

<!--
  Global Offline Status Banner
  Shows a clear, non-intrusive but visible warning when the app loses connection.
-->

<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import { marketState } from "../../stores/market.svelte";
  import { _ } from "../../locales/i18n";
  import Icon from "./Icon.svelte";
  import { icons } from "../../lib/constants";

  let isOffline = $derived(marketState.connectionStatus === "disconnected" || marketState.connectionStatus === "reconnecting");
  let statusText = $derived(marketState.connectionStatus === "disconnected"
      ? $_("connection.disconnected") || "Offline"
      : $_("connection.reconnecting") || "Reconnecting...");
</script>

{#if isOffline}
  <div
    class="fixed top-0 left-0 w-full z-[100] bg-[var(--danger-color)] text-white text-sm font-bold py-1 px-4 text-center shadow-md flex items-center justify-center gap-2"
    in:slide={{ duration: 300, axis: 'y' }}
    out:fade
  >
    <div class="animate-pulse">
        <Icon data={icons.refresh} size="14" />
    </div>
    <span>{statusText}</span>
    <span class="opacity-80 font-normal text-xs ml-2 hidden sm:inline">
      {$_("app.offlineMessage") || "Check internet connection"}
    </span>
  </div>
{/if}
