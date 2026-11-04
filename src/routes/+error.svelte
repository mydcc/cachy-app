<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import { page } from "$app/state";
  import { _ } from "../locales/i18n";

  function reload() {
    if (typeof window !== "undefined") window.location.reload();
  }
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
  <h1 class="text-2xl font-semibold">{$_("errorBoundary.title")}</h1>
  <p class="max-w-md text-sm opacity-80">
    {$_("errorBoundary.message")}
  </p>
  {#if page.error?.message}
    <p class="max-w-md break-words font-mono text-xs opacity-60">{page.error.message}</p>
  {/if}
  <button
    type="button"
    class="rounded-md border px-4 py-2 text-sm font-medium"
    onclick={reload}
  >
    {$_("errorBoundary.reload")}
  </button>
</div>
