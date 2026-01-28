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
  import { settingsState } from "../../stores/settings.svelte";
  import { _ } from "../../locales/i18n";
  import { fly } from "svelte/transition";
  import { onMount } from "svelte";

  let visible = $state(false);

  onMount(() => {
    const timer = setTimeout(() => {
      visible = true;
    }, 4000);

    return () => clearTimeout(timer);
  });

  function acceptDisclaimer() {
    settingsState.disclaimerAccepted = true;
  }
</script>

{#if visible}
  <div
    class="fixed bottom-4 right-4 z-[9999] flex flex-col glass-panel text-[var(--text-primary)] rounded-xl shadow-2xl border border-[var(--border-primary)] max-w-md w-[calc(100vw-2rem)] max-h-[80vh] sm:max-h-[60vh]"
    transition:fly={{ y: 20, duration: 400 }}
  >
    <!-- Header -->
    <div
      class="p-4 border-b border-[var(--border-primary)] flex items-center gap-3 rounded-t-xl"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-6 w-6 text-[var(--warning-color)] flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <h2 class="text-lg font-bold">{$_("legal.disclaimerTitle")}</h2>
    </div>

    <!-- Content -->
    <div
      class="p-4 overflow-y-auto text-sm leading-relaxed text-[var(--text-secondary)] space-y-3"
    >
      {@html $_("legal.disclaimerBody")}
    </div>

    <!-- Footer -->
    <div
      class="p-4 border-t border-[var(--border-primary)] rounded-b-xl flex justify-end"
    >
      <button
        class="px-6 py-2 bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)] text-sm font-bold rounded-lg transition-colors shadow-lg"
        onclick={acceptDisclaimer}
      >
        {$_("legal.accept")}
      </button>
    </div>
  </div>
{/if}
