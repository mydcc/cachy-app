<!--
  Copyright (C) 2026 MYDCC

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
  // Test-only stand-in for a worker-driven background (FEAT-0265 review).
  // Counts its mounts on a global and, when told to, reports that its worker
  // could not load offline — exactly what ThreeBackground/TradeFlowBackground
  // do through `onunavailableoffline`.
  import { onMount } from "svelte";

  interface Probe {
    mounts: number;
    failOffline: boolean;
  }

  let { onunavailableoffline }: { onunavailableoffline?: () => void } = $props();

  onMount(() => {
    const probe = (globalThis as { __backgroundProbe?: Probe }).__backgroundProbe;
    if (!probe) return;
    probe.mounts++;
    if (probe.failOffline) onunavailableoffline?.();
  });
</script>

<span data-testid="background-probe"></span>
