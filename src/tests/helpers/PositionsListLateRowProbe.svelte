<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import PositionsList from "../../components/shared/PositionsList.svelte";
  import type { OMSPosition } from "../../services/omsTypes";

  // Test-only probe (FEAT-0808 review): `$set` is gone in Svelte 5, so the
  // late-arrival case drives a live list through an exported setter — the
  // component under test sees a plain reactive prop change, exactly what a
  // hydration landing after a tab switch produces.
  let positions = $state<OMSPosition[]>([]);
  // The highlight is already pending when the list mounts — the link
  // resolved before the rows arrived.
  let highlightPositionId = $state<string | null>("paper-pos-1");

  export function arriveLate(next: OMSPosition[]): void {
    positions = next;
  }
</script>

<PositionsList {positions} {highlightPositionId} />
